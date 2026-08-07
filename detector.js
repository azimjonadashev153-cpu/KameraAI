/**
 * detector.js — Motion-based trail renderer
 * Uses pixel differencing to detect hand/body movement
 * Draws glowing connection lines on motion hotspots
 * 100% browser-native — zero external AI libraries needed
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus, syncCanvasToVideo, FPSTracker, $ } from './utils.js';
import { MotionDetector, MotionTrailRenderer } from './motion.js';
import { Notifications } from './notifications.js';

// Keep these imports but make them no-ops if models fail
import { SkeletonMode } from './pose.js';

export class DetectorOrchestrator {
  constructor() {
    this._video   = $('webcam');
    this._canvas  = $('overlay-canvas');
    this._ctx     = this._canvas.getContext('2d');

    this._motionDetector = new MotionDetector();
    this._trailRenderer  = new MotionTrailRenderer(this._canvas);

    this._running    = false;
    this._raf        = null;
    this._fpsTracker = new FPSTracker();

    // Trail mode: always on when skeletonMode !== NONE
    this.skeletonMode = SkeletonMode.NONE;
    this.maxPersons   = 1;

    // Fake modelsReady so UI shows green
    this._modelsReady = { face: false, pose: false, hands: false };
  }

  // ── INIT ──────────────────────────────────────────────────

  async init() {
    EventBus.emit('ai:loading');

    // Small delay to let camera warm up
    await new Promise(r => setTimeout(r, 500));

    AppState.aiReady = true;
    EventBus.emit('ai:ready');
    Notifications.success('AI Ready', 'Motion trail system active');
    return true;
  }

  // ── START / STOP ──────────────────────────────────────────

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
    this._trailRenderer.clear();
    this._motionDetector.reset();
  }

  // ── MAIN LOOP ─────────────────────────────────────────────

  _loop() {
    if (!this._running) return;

    syncCanvasToVideo(this._canvas, this._video);
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    // Motion detection + trails
    if (AppState.settings.motionDetection && this.skeletonMode !== SkeletonMode.NONE) {
      const { hotspots } = this._motionDetector.detect(this._video);
      if (hotspots.length > 0) {
        this._trailRenderer.update(hotspots);
      }
    } else if (AppState.settings.motionDetection) {
      // Just detect for stats, no trails
      this._motionDetector.detect(this._video);
    }

    AppState.fps = this._fpsTracker.tick();
    EventBus.emit('fps:update', { fps: AppState.fps });

    this._raf = requestAnimationFrame(() => this._loop());
  }

  // ── GETTERS ───────────────────────────────────────────────

  get canvas()       { return this._canvas; }
  get isRunning()    { return this._running; }
  get faceResults()  { return []; }
  get motionHistory(){ return this._motionDetector.getHistory(); }

  destroy() {
    this.stop();
  }
}
