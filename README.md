# 🤖 AI Human Face & Motion Tracker

**A production-quality, real-time AI-powered human tracking web application**

Built with **MediaPipe**, **vanilla JavaScript**, and **premium dark glassmorphism UI** — runs entirely in the browser with zero backend required.

---

## ✨ Features

### 🎯 AI Detection
- **Face Detection** — Detects unlimited faces with MediaPipe FaceMesh
  - 468-point facial landmarks
  - Real-time face mesh rendering
  - Direction detection (Left, Right, Up, Down, Straight)
  - Confidence scores
  - Animated bounding boxes

- **Body Pose Detection** — Full-body 33-point skeleton tracking
  - Color-coded body segments
  - Real-time skeleton overlay
  - Visibility-aware rendering

- **Hand Tracking** — Dual-hand 21-landmark detection
  - Gesture recognition (Open Hand, Fist, Peace, Pointing, Thumbs Up, OK)
  - Left/Right hand classification
  - Smooth landmark rendering

- **Motion Detection** — Pixel-difference based movement analysis
  - Real-time intensity percentage
  - 30-frame rolling history
  - Sparkline visualization

### 🎬 Recording & Capture
- **Screenshot** — Composite video + AI overlays with timestamp watermark
- **Video Recording** — WebM/MP4 recording with overlays baked in
- **Auto-Download** — Timestamped filenames

### 🎨 Premium UI/UX
- **Dark Glassmorphism Theme** — Blurred glass cards, gradient accents
- **Cyber Blue/Cyan/Purple** color palette
- **Animated Background** — Particle system with connected nodes + grid
- **Smooth Animations** — Fade, scale, glow, pulse effects
- **Responsive Design** — Desktop, tablet, mobile
- **Toast Notifications** — Beautiful sliding toast system
- **Live Event Log** — Scrolling activity feed
- **Real-Time Stats** — FPS, CPU, resolution, browser detection

### ⚙️ Settings Panel
- Toggle AI features (Face, Pose, Hands, Motion)
- Overlay controls (Bounding boxes, Landmarks, Skeleton, FPS)
- Camera options (Mirror, Notifications)
- Theme switcher (Dark/Light)
- Confidence threshold slider

### 📹 Camera Controls
- Multi-camera support with live switching
- Mirror mode toggle
- Digital zoom (1.0x - 3.0x)
- Fullscreen preview
- Camera selection dropdown

---

## 🚀 Quick Start

### Requirements
- Modern browser with WebRTC support (Chrome, Edge, Firefox, Safari)
- Webcam access
- Internet connection (loads MediaPipe models from CDN)

### Installation

1. **Extract or clone** this folder
2. **Open with Live Server** or any local server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js http-server
   npx http-server
   
   # Using VS Code Live Server extension
   Right-click index.html → "Open with Live Server"
   ```
3. **Navigate** to `http://localhost:8000` (or your server's address)
4. **Allow camera** permission when prompted
5. **Click "Activate Camera"** to start

---

## 📁 Project Structure

```
ai-tracker/
├── index.html          # Main HTML layout
├── style.css           # Premium glassmorphism styles (~600 lines)
├── script.js           # Application entry point
├── utils.js            # Shared utilities, EventBus, helpers
├── notifications.js    # Toast notification system
├── camera.js           # Webcam management
├── face.js             # Face detection + rendering
├── pose.js             # Pose detection + skeleton
├── hands.js            # Hand tracking + gestures
├── motion.js           # Motion detection
├── screenshot.js       # Screenshot capture
├── recording.js        # Video recording
├── detector.js         # AI orchestrator
├── assets/
│   └── icons/          # (Optional icon assets)
└── README.md           # This file
```

---

## 🎛️ How It Works

### Architecture

**Modular ES6 Design** — Each feature is isolated in its own module:

1. **`script.js`** — App entry point, coordinates all modules
2. **`detector.js`** — Loads MediaPipe from CDN, orchestrates AI detectors
3. **`face.js`**, **`pose.js`**, **`hands.js`** — Individual AI detectors + renderers
4. **`motion.js`** — Frame differencing on downsampled canvas
5. **`camera.js`** — WebRTC stream management
6. **`screenshot.js`** / **`recording.js`** — Capture features
7. **`utils.js`** — Shared helpers (EventBus, FPSTracker, canvas utilities)
8. **`notifications.js`** — Toast system

### Event-Driven Communication

All modules communicate via **EventBus** (pub/sub pattern):
- `camera:started`, `face:detected`, `motion:detected`, etc.
- Decoupled, testable, extensible

### AI Pipeline

1. **Load MediaPipe** models from CDN (FaceMesh, Pose, Hands)
2. **Video frame** → Detectors (parallel execution)
3. **Results** → Renderers → Canvas overlay
4. **Canvas + Video** → Composite for screenshot/recording

---

## 🎨 UI Components

### Header
- Animated logo with pulsing rings
- Live clock & date
- System status indicator
- Settings & fullscreen buttons

### Camera Panel
- Live video feed with overlay canvas
- Scanning line effect
- Corner frame decorations
- FPS counter overlay
- Recording indicator
- Control buttons (switch, mirror, zoom, fullscreen)
- Screenshot preview

### Dashboard
- **6 Status Cards** — Camera, AI, Faces, Motion, Pose, Hands
- **System Info Chips** — FPS, CPU, Resolution, Browser
- **Face Analysis** — Per-face details (ID, confidence, center, size, direction)
- **Hand Status** — Left/Right hand detection with gesture labels
- **Motion Panel** — Intensity bar, sparkline history
- **Recording Panel** — Timer, start/stop controls

### Event Log
- Scrolling activity feed
- Color-coded messages (success, info, warn, error, detect)
- Timestamps
- Auto-scroll to bottom

### Settings Panel
- Slide-in drawer from right
- Grouped sections with custom toggles
- Smooth animations

---

## 🧪 Testing Recommendations

1. **Face Detection** — Test with multiple people, different angles
2. **Pose** — Stand back from camera, try full body visibility
3. **Hands** — Make gestures: ✋ ✊ ☝ ✌ 👍 👌
4. **Motion** — Wave hands, walk around
5. **Recording** — Record 10s clip, verify overlays are included
6. **Multi-Camera** — If available, test camera switching
7. **Responsive** — Resize browser window, test mobile

---

## 🛠️ Customization

### Colors
Edit CSS variables in `style.css`:
```css
:root {
  --primary: #00d4ff;     /* Cyber blue */
  --secondary: #a855f7;   /* Purple */
  --accent: #06b6d4;      /* Cyan */
  --success: #10b981;     /* Green */
  --warning: #f59e0b;     /* Orange */
  --danger: #ef4444;      /* Red */
}
```

### AI Confidence
Adjust detection sensitivity in Settings Panel or modify defaults in `utils.js`:
```js
AppState.settings.confidence = 0.5; // 0.1 - 0.99
```

### FPS Target
Modify recording FPS in `recording.js`:
```js
const canvasStream = compositeCanvas.captureStream(30); // 30 FPS
```

---

## 🌐 Browser Compatibility

| Feature          | Chrome | Edge | Firefox | Safari |
|-----------------|--------|------|---------|--------|
| Face Detection  | ✅     | ✅   | ✅      | ✅     |
| Pose Detection  | ✅     | ✅   | ✅      | ✅     |
| Hand Tracking   | ✅     | ✅   | ✅      | ✅     |
| Video Recording | ✅     | ✅   | ✅      | ⚠️ *   |
| Screenshot      | ✅     | ✅   | ✅      | ✅     |

*Safari: Limited codec support for MediaRecorder

---

## 📚 Technologies

- **MediaPipe** — Google's ML solutions for pose, face, hands
- **Vanilla JavaScript (ES6 Modules)** — No frameworks
- **WebRTC** — Camera access
- **Canvas API** — Rendering overlays
- **MediaRecorder API** — Video recording
- **CSS3** — Glassmorphism, animations, gradients

---

## 🎓 Educational Use

This project is ideal for:
- **Computer Science capstone projects**
- **AI/ML demonstrations**
- **Web development portfolios**
- **HCI/UX case studies**
- **Live demo presentations**

---

## 📝 License

**Educational & Personal Use**  
Feel free to modify, extend, and learn from this codebase.

For commercial use, ensure compliance with [MediaPipe's Apache 2.0 License](https://github.com/google/mediapipe/blob/master/LICENSE).

---

## 🙏 Credits

- **MediaPipe** by Google — AI models
- **Inter & JetBrains Mono** fonts by Google Fonts
- **Design inspiration** — Apple, Tesla, Microsoft Fluent

---

## 🚨 Troubleshooting

**Camera won't start?**
- Check browser permissions (chrome://settings/content/camera)
- Try HTTPS (required by some browsers)
- Ensure no other app is using the camera

**AI models fail to load?**
- Check internet connection (loads from CDN)
- Disable ad blockers
- Try different browser

**Recording doesn't work?**
- Safari has limited codec support
- Use Chrome/Edge for best results

**Low FPS?**
- Disable some detectors in Settings
- Close other tabs/applications
- Try lower resolution camera

---

## 🎉 Enjoy Tracking!

Built with ❤️ for the future of AI-powered web applications.

**Version:** 2.0  
**Last Updated:** 2025

---
