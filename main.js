"use strict";

const CONTAINER_OVERHEAD_PERCENT = 0.05;
const AUDIO_SIZE_PERCENT = 0.15;
const KBITS_PER_MB = 8192;

// Allows clearing encoded file on reset
let currentOutputFileName = null;

//////////////////////
// Mediabunny setup //
//////////////////////

// Import required mediabunny classes
const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } = Mediabunny;
const { registerAacEncoder } = MediabunnyAacEncoder;
const { registerAc3Decoder } = MediabunnyAc3;

// Allow additional audio codecs
registerAacEncoder();
registerAc3Decoder();

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
    const frameRate = frameRateRaw === "Same as source" ? null : parseInt(frameRateRaw, 10);

    // Get resolution
    const resolutionRaw = document.getElementById("resolution").value;
    const resolution = resolutionRaw === "Same as source" ? null : resolutionRaw;

    // Get audio inclusion
    const includeAudio = document.getElementById("include-audio").checked;

    return { codec, targetSizeMB: targetSizeRaw, frameRate, resolution, includeAudio };
}

// Get duration of video file
async function getVideoDuration(file) {
    const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(file),
    });
    try {
        return await input.computeDuration();
    } catch {
        return null;
    } finally {
        input.dispose();
    }
}

// Calculate video bitrate for target size accounting for audio
function calculateVideoBitrateKbps(durationSeconds, desiredSizeMB, includeAudio) {
    let videoDesiredSizeMB;

    if (includeAudio) {
        // Subtract audio size to get remaining size for video
        const audioSizeMB = desiredSizeMB * AUDIO_SIZE_PERCENT;
        const remainingSizeMB = desiredSizeMB - audioSizeMB;
        videoDesiredSizeMB = remainingSizeMB * (1 - CONTAINER_OVERHEAD_PERCENT);
    } else {
        videoDesiredSizeMB = desiredSizeMB * (1 - CONTAINER_OVERHEAD_PERCENT);
    }

    // Calculate bitrate
    const videoBitrateKbps = (videoDesiredSizeMB * KBITS_PER_MB) / durationSeconds;

    // Clamp video bitrate to avoid nonsense values
    return Math.max(50, Math.floor(videoBitrateKbps));
}

// Calculate audio bitrate for target size
function calculateAudioBitrateKbps(durationSeconds, desiredSizeMB) {
    const audioSizeMB = desiredSizeMB * AUDIO_SIZE_PERCENT;

    // Calculate bitrate
    const audioBitrateKbps = (audioSizeMB * KBITS_PER_MB) / durationSeconds;

    // Clamp audio bitrate to avoid nonsense values
    return Math.max(16, Math.floor(audioBitrateKbps));
}

// Convert codec name to mediabunny video codec string
function getVideoCodec(codec) {
    switch (codec) {
        case "H.264": return "avc";
        case "H.265": return "hevc";
    }
}

// Convert codec name to mediabunny audio codec string
function getAudioCodec(codec) {
    switch (codec) {
        case "H.264": return "aac";
        case "H.265": return "aac";
    }
}

// Convert resolution string to width and height
function getVideoResolution(resolution) {
    const [width, height] = resolution.split("x").map(Number);
    return { width, height };
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

// Run conversion and handle progress
async function runCompression(file, settings, videoTargetBitrateKbps, audioTargetBitrateKbps, outputFileName) {
    // Switch visible sections
    settingsPane.hidden = true;
    progressPane.hidden = false;
    progressText.textContent = "Starting...";
    progressBar.value = 0;

    // Set up input from uploaded file
    const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(file),
    });

    // Set up output to in-memory buffer
    const output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
    });

    try {
        // Build video options
        const videoOptions = {
            codec: getVideoCodec(settings.codec),
            bitrate: videoTargetBitrateKbps * 1000,
        };

        // Set frame rate if specified
        if (settings.frameRate) {
            videoOptions.frameRate = settings.frameRate;
        }

        // Set resolution if specified
        if (settings.resolution) {
            res = getVideoResolution(settings.resolution);
            videoOptions.width = res.width;
            videoOptions.height = res.height;
        }

        // Transcode audio if included, discard if not
        const audioOptions = settings.includeAudio
            ? { codec: getAudioCodec(settings.codec), bitrate: audioTargetBitrateKbps * 1000 }
            : { discard: true };

        // Initialise conversion
        const conversion = await Conversion.init({
            input,
            output,
            tracks: "primary",
            video: videoOptions,
            audio: audioOptions,
        });

        // Abort if conversion is invalid
        if (!conversion.isValid) {
            throw new Error("Unsupported codec or track configuration");
        }

        // Set up progress callback
        conversion.onProgress = (progress, progressTime) => {
            progressBar.value = Math.round(progress * 100);
            progressText.textContent = `Encoding... ${Math.round(progress * 100)}% at ${Math.round(progressTime)}s`;
        };

        // Run conversion
        await conversion.execute();

        // Update ui after successful encoding
        progressText.textContent = "Encoding complete!";
        progressBar.value = 100;
        downloadBtn.hidden = false;
        resetBtn.hidden = false;

        // Set up download handler
        downloadBtn.onclick = () => {
            const blob = new Blob([output.target.buffer], { type: "video/mp4" });
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
    } finally {
        input.dispose();
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

    // Calculate target bitrates
    const videoBitrateKbps = calculateVideoBitrateKbps(duration, settings.targetSizeMB, settings.includeAudio);
    const audioBitrateKbps = settings.includeAudio ? calculateAudioBitrateKbps(duration, settings.targetSizeMB) : 0;
    console.log("Calculated target video bitrate (kbps):", videoBitrateKbps);
    if (settings.includeAudio) console.log("Calculated target audio bitrate (kbps):", audioBitrateKbps);

    // Build new file name
    const inputFileName = file.name;
    const inputBaseName = inputFileName.replace(/\.[^.]+$/, "");
    const outputFileName = `${inputBaseName}_compressed.mp4`;

    // Build ffmpeg command
    const ffmpegCommand = buildCompressionCommand(
        inputFileName,
        outputFileName,
        videoBitrateKbps,
        audioBitrateKbps,
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
