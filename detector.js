/**
 * detector.js — AI Orchestrator using ONLY TensorFlow.js
 * MoveNet (pose) + MediaPipe Hands model via TF.js + FaceMesh via TF.js
 * Zero WASM conflict — all models run in the same TF.js WebGL backend
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus, syncCanvasToVideo, FPSTracker, $ } from './utils.js';
import { FaceDetector, FaceRenderer } from './face.js';
import { PoseDetector, PoseRenderer, SkeletonMode } from './pose.js';
import { HandDetector, HandRenderer } from './hands.js';
import { MotionDetector } from './motion.js';
import { Notifications }  from './notifications.js';

export class DetectorOrchestrator {
  constructor() {
    this._video   = $('webcam');
    this._canvas  = $('overlay-canvas');
    this._ctx     = this._canvas.getContext('2d');

    this._faceDetector   = new FaceDetector();
    this._poseDetector   = new PoseDetector();
    this._handDetector   = new HandDetector();
    this._motionDetector = new MotionDetector();

    this._faceRenderer = new FaceRenderer(this._canvas);
    this._poseRenderer = new PoseRenderer(this._canvas);
    this._handRenderer = new HandRenderer(this._canvas);

    this._running     = false;
    this._raf         = null;
    this._fpsTracker  = new FPSTracker();
    this._modelsReady = { face: false, pose: false, hands: false };

    this.skeletonMode = SkeletonMode.NONE;
    this.maxPersons   = 1;

    EventBus.on('settings:confidence', ({ value }) => {
      AppState.settings.confidence = value;
    });
  }

  // ── PUBLIC API ─────────────────────────────────────────────

  async init() {
    EventBus.emit('ai:loading');

    // Wait for TF.js to be available (loaded via script tag)
    await this._waitForTF();

    // Set WebGL backend
    try {
      await window.tf.setBackend('webgl');
      await window.tf.ready();
    } catch (e) {
      console.warn('WebGL backend failed, using cpu:', e);
      await window.tf.setBackend('cpu');
      await window.tf.ready();
    }

    // Init all detectors
    const [pose, hands, face] = await Promise.all([
      this._poseDetector.init(),
      this._handDetector.init(),
      this._faceDetector.init(),
    ]);

    this._modelsReady = { pose, hands, face };

    AppState.aiReady = true;
    const failed = [];
    if (!pose)  failed.push('Pose');
    if (!hands) failed.push('Hands');
    if (!face)  failed.push('Face');

    if (failed.length === 0) {
      EventBus.emit('ai:ready');
      Notifications.success('AI Ready', 'All models loaded!');
    } else {
      EventBus.emit('ai:partial', { failed });
      Notifications.warn('AI Partial', `${failed.join(', ')} unavailable`);
    }

    return failed.length === 0;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._loop();
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  get canvas()       { return this._canvas; }
  get isRunning()    { return this._running; }
  get faceResults()  { return this._faceDetector.lastResults || []; }
  get motionHistory(){ return this._motionDetector.getHistory(); }

  // ── DETECTION LOOP ─────────────────────────────────────────

  async _loop() {
    if (!this._running) return;

    syncCanvasToVideo(this._canvas, this._video);
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    const runPose  = this.skeletonMode !== SkeletonMode.NONE && this._modelsReady.pose;
    const runHands = AppState.settings.handTracking  && this._modelsReady.hands;
    const runFace  = AppState.settings.faceDetection && this._modelsReady.face;

    const [poses, hands, faces] = await Promise.all([
      runPose  ? this._poseDetector.detect(this._video) : Promise.resolve([]),
      runHands ? this._handDetector.detect(this._video) : Promise.resolve([]),
      runFace  ? this._faceDetector.detect(this._video) : Promise.resolve([]),
    ]);

    // Motion (sync — uses offscreen canvas, fast)
    if (AppState.settings.motionDetection) {
      this._motionDetector.detect(this._video);
    }

    // Render
    if (poses?.length > 0 && this.skeletonMode !== SkeletonMode.NONE) {
      this._poseRenderer.setInputSize(
        this._video.videoWidth  || this._canvas.width,
        this._video.videoHeight || this._canvas.height
      );
      this._poseRenderer.render(poses, this.skeletonMode, this.maxPersons);
    }

    if (faces?.length > 0 && AppState.settings.boundingBoxes) {
      this._faceRenderer.render(faces, true, AppState.settings.landmarks);
    }

    if (hands?.length > 0) {
      this._handRenderer.setInputSize(
        this._video.videoWidth  || this._canvas.width,
        this._video.videoHeight || this._canvas.height
      );
      this._handRenderer.render(hands, true);
    }

    AppState.fps = this._fpsTracker.tick();
    EventBus.emit('fps:update', { fps: AppState.fps });

    this._raf = requestAnimationFrame(() => this._loop());
  }

  // ── WAIT FOR TF.js ────────────────────────────────────────

  _waitForTF() {
    return new Promise(resolve => {
      let tries = 0;
      const check = () => {
        tries++;
        if (window.tf && window.poseDetection) {
          resolve();
        } else if (tries > 100) {
          console.warn('TF.js not found after 10s');
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  destroy() {
    this.stop();
    this._poseDetector.destroy?.();
    this._handDetector.destroy?.();
    this._faceDetector.destroy?.();
  }
}
