# Compress 8MB

Compress videos for upload-limited platforms directly in the browser, with no server uploads. All processing is done on-device, powered by [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm).

A hosted version is available through GitHub Pages at [odddollar.github.io/Compress-8MB/](https://odddollar.github.io/Compress-8MB/).

## Features

- All video processing done client-side with no uploading files to a server
- Selectable video codec
  - H.264 - Better compatibility with online platforms and faster encoding
  - H.265 - Better image quality
- Settable target file size
- Settable output frame rate
  - Same as source, 24 FPS, 30 FPS, 60 FPS
- Include compressed audio or strip it out
  - Audio compressed to 96KB/s AAC
- Output to an MP4 container

## Building

### Clone the repository

Clone and navigate to the repository with the commands below:

```bash
git clone https://github.com/odddollar/Compress-8MB.git
cd Compress-8MB
```

### Download required dependencies

Download the following required FFmpeg.wasm files and place them into a new `ffmpeg` directory:

- [814.ffmpeg.js](https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd/814.ffmpeg.js)
- [ffmpeg-core.js](https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/umd/ffmpeg-core.js)
- [ffmpeg-core.wasm](https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/umd/ffmpeg-core.wasm)
- [ffmpeg-core.worker.js](https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/umd/ffmpeg-core.worker.js)
- [ffmpeg.js](https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.js)

Download the following file and place at the project's root:

-  [coi-serviceworker.min.js](https://unpkg.com/coi-serviceworker@0.1.7/coi-serviceworker.min.js)

The final project structure should resemble this:

```
Compress-8MB/
├── ffmpeg/
│   ├── 814.ffmpeg.js
│   ├── ffmpeg-core.js
│   ├── ffmpeg-core.wasm
│   ├── ffmpeg-core.worker.js
│   └── ffmpeg.js
├── .gitignore
├── coi-serviceworker.min.js
├── index.html
├── LICENSE
├── main.js
├── README.md
└── styles.css
```

### Start local hosting server

Do not open `index.html` directly in the browser using a `file://` path. FFmpeg.wasm requires a local web server because of browser security restrictions and `SharedArrayBuffer` requirements.

Some options for running a server include:

**1. VS Code Live Server**

1. Install the `Live Server` VS Code extension
2. Open the project folder in VS Code
3. Right-click `index.html`
4. Select `Open with Live Server`
5. A web page will open at something like `http://localhost:8080`

**2. Python HTTP server**

From the project root:

```bash
python -m http.server 8080
```

Then open `http://localhost:8000` in a web browser

## Third-party licenses

This repository is released under the MIT License and does not contain GPL-licensed [FFmpeg](https://www.ffmpeg.org/) binaries or source code.

The GitHub Pages deployment dynamically incorporates FFmpeg.wasm builds containing `x264` and `x265`, which are subject to GPL and other third-party licenses. Those components are obtained separately during the release build process from the [UNPKG](https://unpkg.com/) CDN and are not stored or distributed as part of this repository itself. The deployment process is performed via GitHub Actions using the workflow defined [here](.github/workflows/pages.yml).

Anyone deploying, redistributing, or modifying this project is solely responsible for ensuring their own compliance with all applicable third-party licenses, including those relating to FFmpeg, `x264`, and `x265`.
