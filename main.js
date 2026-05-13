"use strict";

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

// Calculate video bitrate for target size account for audio
function calculateBitrate(durationSeconds, desiredSizeMB, includeAudio) {
    const kbitsPerMB = 8192;
    let videoDesiredSizeMB;

    if (includeAudio) {
        // Subtract audio size to get remaining size for video
        const audioBitrateKbps = 96;
        const audioSizeMB = (audioBitrateKbps * durationSeconds) / kbitsPerMB;
        const remainingSizeMB = desiredSizeMB - audioSizeMB;
        videoDesiredSizeMB = remainingSizeMB * 0.85;
    } else {
        videoDesiredSizeMB = desiredSizeMB * 0.85;
    }

    return (videoDesiredSizeMB * kbitsPerMB) / durationSeconds;
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
});
