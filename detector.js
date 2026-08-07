/**
 * detector.js — AI Orchestrator: manages all detectors, renders overlays, updates UI
 * Coordinates FaceDetector, PoseDetector, HandDetector, MotionDetector
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus, syncCanvasToVideo, FPSTracker, $ } from './utils.js';
import { FaceDetector, FaceRenderer } from './face.js';
import { PoseDetector, PoseRenderer, SkeletonMode } from './pose.js';
import { HandDetector, HandRenderer } from './hands.js';
import { MotionDetector }             from './motion.js';
import { Notifications }              from './notifications.js';

// ============================================================
// AI DETECTION ORCHESTRATOR
// ============================================================
export class DetectorOrchestrator {
  constructor() {
    this._video        = $('webcam');
    this._canvas       = $('overlay-canvas');
    this._ctx          = this._canvas.getContext('2d');

    // Detectors
    this._faceDetector   = new FaceDetector();
    this._poseDetector   = new PoseDetector();
    this._handDetector   = new HandDetector();
    this._motionDetector = new MotionDetector();

    // Renderers
    this._faceRenderer = new FaceRenderer(this._canvas);
    this._poseRenderer = new PoseRenderer(this._canvas);
    this._handRenderer = new HandRenderer(this._canvas);

    // State
    this._running    = false;
    this._raf        = null;
    this._fpsTracker = new FPSTracker();
    this._modelsReady= { face: false, pose: false, hands: false };

    // Skeleton & tracking settings — default NONE (no skeleton until user picks)
    this.skeletonMode = SkeletonMode.NONE;  // 'none' | 'head' | 'hands' | 'full'
    this.maxPersons   = 1;                  // 1 | 2 | 3

    // Listen to settings changes
    this._setupListeners();
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────────────────

  /** Initialize all AI models */
  async init() {
    EventBus.emit('ai:loading');

    // Load MediaPipe libraries from CDN
    await this._loadMediaPipeScripts();

    // Initialize all detectors in parallel
    const [face, pose, hands] = await Promise.all([
      this._faceDetector.init(),
      this._poseDetector.init(),
      this._handDetector.init()
    ]);

    this._modelsReady = { face, pose, hands };

    const allReady = face && pose && hands;
    if (allReady) {
      AppState.aiReady = true;
      EventBus.emit('ai:ready');
      Notifications.success('AI Ready', 'All models loaded successfully');
      return true;
    } else {
      const failed = [];
      if (!face)  failed.push('Face');
      if (!pose)  failed.push('Pose');
      if (!hands) failed.push('Hands');
      Notifications.warn('AI Partial Load', `${failed.join(', ')} failed. Some features may be unavailable.`);
      EventBus.emit('ai:partial', { failed });
      AppState.aiReady = true; // Allow running with partial
      return false;
    }
  }

  /** Start detection loop */
  start() {
    if (this._running) return;
    this._running = true;
    this._loop();
  }

  /** Stop detection loop */
  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._clearCanvas();
  }

  /** Get canvas for screenshot/recording */
  get canvas() { return this._canvas; }

  get isRunning() { return this._running; }

  /** Expose detectors for UI access */
  get faceResults()   { return this._faceDetector.lastResults || []; }
  get motionHistory() { return this._motionDetector.getHistory(); }

  // ──────────────────────────────────────────────────────────
  // DETECTION LOOP
  // ──────────────────────────────────────────────────────────

  async _loop() {
    if (!this._running) return;

    // Sync canvas size to video
    syncCanvasToVideo(this._canvas, this._video);

    // Clear previous frame
    this._clearCanvas();

    // Run all detections in parallel
    const [faces, pose, hands, motion] = await Promise.all([
      AppState.settings.faceDetection   && this._modelsReady.face
        ? this._faceDetector.detect(this._video)
        : [],
      AppState.settings.poseDetection   && this._modelsReady.pose
        ? this._poseDetector.detect(this._video)
        : null,
      AppState.settings.handTracking    && this._modelsReady.hands
        ? this._handDetector.detect(this._video)
        : [],
      AppState.settings.motionDetection
        ? this._motionDetector.detect(this._video)
        : { detected: false, intensity: 0 }
    ]);

    // Render overlays (order matters for layering)
    if (this.skeletonMode !== SkeletonMode.NONE && pose?.length > 0) {
      this._poseRenderer.render(pose, this.skeletonMode, this.maxPersons);
    }
    if (AppState.settings.boundingBoxes && faces?.length > 0) {
      this._faceRenderer.render(faces, AppState.settings.boundingBoxes, AppState.settings.landmarks);
    }
    if (AppState.settings.landmarks && hands?.length > 0) {
      this._handRenderer.render(hands, AppState.settings.landmarks);
    }

    // Update FPS
    const fps = this._fpsTracker.tick();
    AppState.fps = fps;
    EventBus.emit('fps:update', { fps });

    // Next frame
    this._raf = requestAnimationFrame(() => this._loop());
  }

  _clearCanvas() {
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  // ──────────────────────────────────────────────────────────
  // MEDIAPIPE CDN LOADER
  // ──────────────────────────────────────────────────────────

  async _loadMediaPipeScripts() {
    // Load sequentially — MediaPipe scripts depend on each other
    const scripts = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3/drawing_utils.js',
      'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.js',
      'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js',
      'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js'
    ];

    for (const src of scripts) {
      await this._loadScript(src);
    }

    // Small pause to ensure globals are registered
    await new Promise(r => setTimeout(r, 300));
  }

  _loadScript(src) {
    return new Promise((resolve) => {
      // Check if already loaded
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }

      const script    = document.createElement('script');
      script.src      = src;
      script.async    = false; // Keep load order
      script.crossOrigin = 'anonymous';
      script.onload   = () => resolve();
      script.onerror  = () => {
        console.warn('Failed to load MediaPipe script:', src);
        resolve(); // Continue even if one fails
      };
      document.head.appendChild(script);
    });
  }

  // ──────────────────────────────────────────────────────────
  // SETTINGS LISTENER
  // ──────────────────────────────────────────────────────────

  _setupListeners() {
    // Listen for confidence slider changes
    EventBus.on('settings:confidence', ({ value }) => {
      this._faceDetector.updateConfidence?.(value);
      // Note: Pose and Hands confidence set at init only (MediaPipe limitation)
    });
  }

  // ──────────────────────────────────────────────────────────
  // CLEANUP
  // ──────────────────────────────────────────────────────────

  destroy() {
    this.stop();
    this._faceDetector.destroy?.();
    this._poseDetector.destroy?.();
    this._handDetector.destroy?.();
  }
}
