"use strict";

const AUDIO_BITRATE_KBPS = 96;

// Allows clearing encoded file on reset
let currentOutputFileName = null;

////////////////////
// FFmpeg loading //
////////////////////

// Get elements
const loadingScreen = document.getElementById("loading-screen");
const loadingSpinner = document.getElementById("loading-spinner");
const loadingError = document.getElementById("loading-error");
const loadedPage = document.getElementById("loaded-page");

// Pull ffmpeg from included files
const { FFmpeg } = FFmpegWASM;
const ffmpeg = new FFmpeg();

// Load and show elements when ready
(async () => {
    try {
        await ffmpeg.load({
            coreURL: "ffmpeg-core.js",
            wasmURL: "ffmpeg-core.wasm",
            workerURL: "ffmpeg-core.worker.js"
        });

        loadingScreen.hidden = true;
        loadedPage.hidden = false;
    } catch (err) {
        loadingSpinner.hidden = true;
        loadingError.textContent = `Failed to load FFmpeg: ${err.message ?? err}`;
    }
})();

/////////////////
// Ui updating //
/////////////////

// Codec card selection
document.querySelectorAll(".codec-card").forEach(card => {
    card.addEventListener("click", () => {
        document.querySelectorAll(".codec-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
    });
});

///////////////
// Utilities //
///////////////

// Get compression settings
function getCompressionSettings() {
    // Get selected codec
    const codecCard = document.querySelector(".codec-card.active strong");
    const codec = codecCard ? codecCard.textContent.trim() : null;

    // Get target size and validate
    const targetSizeRaw = parseFloat(document.getElementById("target-size").value);
    if (targetSizeRaw <= 0) {
        return null;
    }

    // Get frame rate
    const frameRateRaw = document.getElementById("frame-rate").value;
    const frameRate = frameRateRaw === "Same as source" ? -1 : parseInt(frameRateRaw, 10);

    // Get audio inclusion
    const includeAudio = document.getElementById("include-audio").checked;

    return { codec, targetSizeMB: targetSizeRaw, frameRate, includeAudio };
}

// Get duration of video object using temporary object URL
function getVideoDuration(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(video.duration);
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        video.src = url;
    });
}

// Calculate video bitrate for target size account for audio
function calculateBitrateKbps(durationSeconds, desiredSizeMB, includeAudio) {
    const kbitsPerMB = 8192;
    let videoDesiredSizeMB;

    if (includeAudio) {
        // Subtract audio size to get remaining size for video
        const audioSizeMB = (AUDIO_BITRATE_KBPS * durationSeconds) / kbitsPerMB;
        const remainingSizeMB = desiredSizeMB - audioSizeMB;
        videoDesiredSizeMB = remainingSizeMB * 0.95;
    } else {
        videoDesiredSizeMB = desiredSizeMB * 0.95;
    }

    // Calculate bitrate
    const bitrateKbps = (videoDesiredSizeMB * kbitsPerMB) / durationSeconds

    // Clamp video bitrate to avoid nonsense values
    return Math.max(50, Math.floor(bitrateKbps));
}

// Convert video codec name to ffmpeg arguments
function getVideoCodecArgs(codec) {
    switch (codec) {
        case "H.264":
            return ["-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p"];
        case "H.265":
            return ["-c:v", "libx265", "-preset", "medium", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1"];
    }
}

// Build ffmpeg command based on settings
function buildCompressionCommand(inputFileName, outputFileName, targetBitrateKbps, settings) {
    // Build command with codec selection
    const command = [
        "-hide_banner",
        "-i", inputFileName,
        ...getVideoCodecArgs(settings.codec),
        "-b:v", `${targetBitrateKbps}k`,
    ];

    // Set frame rate if specified
    if (settings.frameRate > 0) {
        command.push("-r", String(settings.frameRate));
    }

    // Transcode audio if included, discard if not
    if (settings.includeAudio) {
        command.push("-c:a", "aac", "-b:a", `${AUDIO_BITRATE_KBPS}k`);
    } else {
        command.push("-an");
    }

    // Optimise for streaming
    command.push("-movflags", "+faststart", outputFileName);

    return command;
}

//////////////////////////
// File upload handling //
//////////////////////////

// Get elements
const uploadBox = document.getElementById("upload-box");
const fileInput = document.getElementById("file-input");
const uploadText = document.getElementById("upload-text");

// Click to open file picker
uploadBox.addEventListener("click", () => {
    fileInput.click();
});

// File input change handler
fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        uploadText.textContent = file.name;
    }
});

// Drag and drop handlers
uploadBox.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadBox.classList.add("drag-over");
});

uploadBox.addEventListener("dragleave", () => {
    uploadBox.classList.remove("drag-over");
});

uploadBox.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadBox.classList.remove("drag-over");

    if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];

        // Check that dropped file is video
        if (file.type.startsWith("video/")) {
            fileInput.files = e.dataTransfer.files;
            uploadText.textContent = file.name;
        }
    }
});

/////////////////////
// Run compression //
/////////////////////

// Get elements
const compressBtn = document.getElementById("compress-btn");
const settingsPane = document.getElementById("settings-pane");
const progressPane = document.getElementById("progress-pane");
const progressText = document.getElementById("progress-text");
const progressBar = document.getElementById("progress-bar");
const downloadBtn = document.getElementById("download-btn");
const resetBtn = document.getElementById("reset-btn");

// Run ffmpeg command and handle progress
async function runCompression(inputFile, ffmpegCommand, inputFileName, outputFileName) {
    // Set up progress callback
    const progressHandler = ({ progress }) => {
        progressBar.value = Math.round(progress * 100);
    };

    // Set up logger to show ffmpeg output
    const logHandler = ({ message }) => {
        if (/^frame=/.test(message)) {
            progressText.textContent = message;
        }
    };

    try {
        // Switch visible sections
        settingsPane.hidden = true;
        progressPane.hidden = false;
        progressText.textContent = "Starting...";
        progressBar.value = 0;

        // Write input file to virtual filesystem
        const fileBuffer = await inputFile.arrayBuffer();
        await ffmpeg.writeFile(inputFileName, new Uint8Array(fileBuffer));

        ffmpeg.on("progress", progressHandler);
        ffmpeg.on("log", logHandler);

        // Run ffmpeg
        await ffmpeg.exec(ffmpegCommand);

        // Update ui after successful encoding
        progressText.textContent = "Encoding complete!";
        progressBar.value = 100;
        downloadBtn.hidden = false;
        resetBtn.hidden = false;
        currentOutputFileName = outputFileName;

        // Set up download handler
        downloadBtn.onclick = async () => {
            const outputData = await ffmpeg.readFile(outputFileName);
            const blob = new Blob([outputData.buffer], { type: "video/mp4" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = outputFileName;
            a.click();
            URL.revokeObjectURL(url);
        };
    } catch (err) {
        progressBar.value = 0;
        downloadBtn.hidden = true;
        resetBtn.hidden = false;
        progressText.textContent = `Error: ${err.message}`;
        console.error("FFmpeg error:", err);
    } finally {
        // Clean up filesystem
        try {
            await ffmpeg.deleteFile(inputFileName);
        } catch (e) { }

        // Remove event listeners
        ffmpeg.off("progress", progressHandler);
        ffmpeg.off("log", logHandler);
    }
}

// Compress button handler
compressBtn.addEventListener("click", async () => {
    // Check that file selected
    if (fileInput.files.length === 0) {
        alert("Please select a video file to compress.");
        return;
    }
    const file = fileInput.files[0];

    // Get settings from UI
    const settings = getCompressionSettings();
    if (!settings) {
        alert("Invalid compression settings");
        return;
    }
    console.log("Compression settings:", settings);

    // Get video duration
    const duration = await getVideoDuration(file);
    if (!duration) {
        alert("Failed to get video duration");
        return;
    }
    console.log("Video duration (seconds):", duration);

    // Calculate target bitrate
    const targetBitrateKbps = calculateBitrateKbps(duration, settings.targetSizeMB, settings.includeAudio);
    console.log("Calculated target bitrate (kbps):", targetBitrateKbps);

    // Build new file name
    const inputFileName = file.name;
    const inputBaseName = inputFileName.replace(/\.[^.]+$/, "");
    const outputFileName = `${inputBaseName}_compressed.mp4`;

    // Build ffmpeg command
    const ffmpegCommand = buildCompressionCommand(
        inputFileName,
        outputFileName,
        targetBitrateKbps,
        settings,
    );
    console.log("FFmpeg command:", ffmpegCommand.join(" "));

    // Run compression
    await runCompression(file, ffmpegCommand, inputFileName, outputFileName);
});

// Reset ui to initial state
resetBtn.addEventListener("click", async () => {
    // Delete previous output file from ffmpeg filesystem
    if (currentOutputFileName) {
        try {
            await ffmpeg.deleteFile(currentOutputFileName);
        } catch (e) { }
        currentOutputFileName = null;
    }

    // Hide progress pane, show settings
    settingsPane.hidden = false;
    progressPane.hidden = true;

    // Reset progress state
    progressText.textContent = "";
    progressBar.value = 0;
    downloadBtn.hidden = true;
    downloadBtn.onclick = null;
    resetBtn.hidden = true;

    // Clear file input and upload label
    fileInput.value = "";
    uploadText.textContent = "Click to choose a video file, or drag one here";

    // Reset codec selection to first card
    document.querySelectorAll(".codec-card").forEach((c, i) => {
        c.classList.toggle("active", i === 0);
    });

    // Reset target size, frame rate, and audio toggle to defaults
    document.getElementById("target-size").value = 8;
    document.getElementById("frame-rate").value = "Same as source";
    document.getElementById("include-audio").checked = true;
});
