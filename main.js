"use strict";

const AUDIO_BITRATE_KBPS = 96;

////////////////////
// FFmpeg loading //
////////////////////

// Get elements
const loadingScreen = document.getElementById("loading-screen");
const loadingSpinner = document.getElementById("loading-spinner");
const loadingError = document.getElementById("loading-error");
const loadedPage = document.getElementById("loaded-page");

// Pull FFmpeg from CDN
const { createFFmpeg } = FFmpeg;
const ffmpeg = createFFmpeg({
    corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
    log: false,
});

// Load and show elements when ready
(async () => {
    try {
        await ffmpeg.load();
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

// Get duration of vide object using temporary object URL
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
    const kbitsPerMB = 8000;
    let videoDesiredSizeMB;

    if (includeAudio) {
        // Subtract audio size to get remaining size for video
        const audioSizeMB = (AUDIO_BITRATE_KBPS * durationSeconds) / kbitsPerMB;
        const remainingSizeMB = desiredSizeMB - audioSizeMB;
        videoDesiredSizeMB = remainingSizeMB * 0.95;
    } else {
        videoDesiredSizeMB = desiredSizeMB * 0.95;
    }

    return (videoDesiredSizeMB * kbitsPerMB) / durationSeconds;
}

// Convert codec name to ffmpeg arguments
function getCodecArgs(codec) {
    switch (codec) {
        case "H.264":
            return ["-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p"];
        case "H.265":
            return ["-c:v", "libx265", "-preset", "medium", "-pix_fmt", "yuv420p", "-tag:v", "hvc1"];
        case "AV1":
            return ["-c:v", "libaom-av1", "-cpu-used", "4", "-pix_fmt", "yuv420p"];
    }
}

// Build ffmpeg command based on settings
function buildCompressionCommand(inputFileName, outputFileName, targetBitrateKbps, settings) {
    // Minimum 50kbps to avoid nonsense values
    const roundedBitrateKbps = Math.max(50, Math.floor(targetBitrateKbps));

    // Build command with codec selection
    const command = [
        "-i", inputFileName,
        ...getCodecArgs(settings.codec),
        "-b:v", `${roundedBitrateKbps}k`,
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

document.getElementById("compress-btn").addEventListener("click", async () => {
    // Check that file selected
    if (fileInput.files.length === 0) {
        alert("Please select a video file to compress.");
        return;
    }

    // Get settings from UI
    const settings = getCompressionSettings();
    if (!settings) {
        alert("Invalid compression settings");
        return;
    }
    console.log("Compression settings:", settings);

    // Get video duration
    const duration = await getVideoDuration(fileInput.files[0]);
    if (!duration) {
        alert("Failed to get video duration");
        return;
    }
    console.log("Video duration (seconds):", duration);

    // Calculate target bitrate
    const targetBitrateKbps = calculateBitrateKbps(duration, settings.targetSizeMB, settings.includeAudio);
    console.log("Calculated target bitrate (kbps):", targetBitrateKbps);

    // Build new file name
    const inputFileName = fileInput.files[0].name;
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
});
