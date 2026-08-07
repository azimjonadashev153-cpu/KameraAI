/**
 * detector.js — AI Orchestrator using MediaPipe Holistic
 * Single unified pipeline: face + pose + hands in ONE model = zero WASM conflict
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus, syncCanvasToVideo, FPSTracker, $ } from './utils.js';
import { PoseRenderer, SkeletonMode } from './pose.js';
import { HandRenderer } from './hands.js';
import { FaceRenderer } from './face.js';
import { MotionDetector } from './motion.js';
import { Notifications } from './notifications.js';

export class DetectorOrchestrator {
  constructor() {
    this._video   = $('webcam');
    this._canvas  = $('overlay-canvas');
    this._ctx     = this._canvas.getContext('2d');

    this._poseRenderer = new PoseRenderer(this._canvas);
    this._handRenderer = new HandRenderer(this._canvas);
    this._faceRenderer = new FaceRenderer(this._canvas);
    this._motionDetector = new MotionDetector();

    this._holistic  = null;
    this._running   = false;
    this._raf       = null;
    this._fpsTracker= new FPSTracker();
    this._ready     = false;

    // Latest results from holistic callback
    this._lastResults = null;

    // Public settings
    this.skeletonMode = SkeletonMode.NONE;
    this.maxPersons   = 1;

    EventBus.on('settings:confidence', ({ value }) => {
      AppState.settings.confidence = value;
    });
  }

  async init() {
    EventBus.emit('ai:loading');
    await this._waitFor(() => window.Holistic, 'Holistic');

    try {
      this._holistic = new window.Holistic({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`
      });

      this._holistic.setOptions({
        modelComplexity:            1,
        smoothLandmarks:            true,
        enableSegmentation:         false,
        smoothSegmentation:         false,
        refineFaceLandmarks:        false,
        minDetectionConfidence:     0.5,
        minTrackingConfidence:      0.5,
      });

      this._holistic.onResults((results) => this._onResults(results));

      await this._holistic.initialize();

      this._ready = true;
      AppState.aiReady = true;
      EventBus.emit('ai:ready');
      Notifications.success('AI Ready', 'Holistic model loaded!');
      return true;
    } catch (e) {
      console.error('Holistic init failed:', e);
      Notifications.error('AI Failed', e.message);
      return false;
    }
  }

  _onResults(results) {
    this._lastResults = results;

    // Update AppState
    AppState.faceCount    = results.faceLandmarks ? 1 : 0;
    AppState.poseDetected = !!results.poseLandmarks;
    AppState.handCount    = (results.leftHandLandmarks ? 1 : 0) + (results.rightHandLandmarks ? 1 : 0);

    // Emit events
    if (results.faceLandmarks && AppState.faceCount !== this._prevFaceCount) {
      EventBus.emit(AppState.faceCount > 0 ? 'face:detected' : 'face:lost', { count: AppState.faceCount });
      EventBus.emit('face:count', { count: AppState.faceCount });
    }
    this._prevFaceCount = AppState.faceCount;

    const hands = [];
    if (results.leftHandLandmarks)  hands.push({ keypoints: results.leftHandLandmarks,  handedness: 'Left',  score: 0.9 });
    if (results.rightHandLandmarks) hands.push({ keypoints: results.rightHandLandmarks, handedness: 'Right', score: 0.9 });
    if (hands.length !== this._prevHandCount) {
      EventBus.emit('hands:update', { count: hands.length, hands });
      this._prevHandCount = hands.length;
    }
  }

  start() {
    if (this._running || !this._ready) return;
    this._running = true;
    this._loop();
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  async _loop() {
    if (!this._running) return;

    syncCanvasToVideo(this._canvas, this._video);
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    // Send frame to holistic
    if (this._holistic && this._video.readyState >= 2) {
      try {
        await this._holistic.send({ image: this._video });
      } catch (e) { /* skip bad frame */ }
    }

    // Motion detection
    if (AppState.settings.motionDetection) {
      this._motionDetector.detect(this._video);
    }

    // Render from latest results
    if (this._lastResults) {
      const r   = this._lastResults;
      const cw  = this._canvas.width;
      const ch  = this._canvas.height;

      // ── POSE SKELETON ──
      if (this.skeletonMode !== SkeletonMode.NONE && r.poseLandmarks) {
        // Convert normalized landmarks to pose format
        const poses = [{ keypoints: r.poseLandmarks.map((lm, i) => ({
          x:     lm.x * cw,
          y:     lm.y * ch,
          score: lm.visibility ?? 0.9,
          name:  i
        })) }];
        this._poseRenderer.setInputSize(cw, ch);
        this._poseRenderer.render(poses, this.skeletonMode, this.maxPersons);
      }

      // ── FACE ──
      if (AppState.settings.faceDetection && r.faceLandmarks) {
        const normLm = r.faceLandmarks; // already normalized 0-1
        let minX=1, minY=1, maxX=0, maxY=0;
        normLm.forEach(p => {
          if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y;
          if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y;
        });
        const faces = [{
          id: 1,
          landmarks: normLm,
          boundingBox: {
            x: (minX-0.02)*cw, y: (minY-0.02)*ch,
            w: (maxX-minX+0.04)*cw, h: (maxY-minY+0.04)*ch
          },
          direction: this._detectDir(normLm),
          confidence: 0.92,
          center: { x: Math.round((minX+maxX)/2*cw), y: Math.round((minY+maxY)/2*ch) },
          size:   { w: Math.round((maxX-minX)*cw), h: Math.round((maxY-minY)*ch) }
        }];
        this._faceRenderer.render(faces, AppState.settings.boundingBoxes, AppState.settings.landmarks);

        // Update face analysis in UI
        EventBus.emit('face:count', { count: 1, faces });
      } else if (!r.faceLandmarks) {
        AppState.faceCount = 0;
      }

      // ── HANDS ──
      if (AppState.settings.handTracking) {
        const hands = [];
        if (r.leftHandLandmarks)  hands.push({ keypoints: r.leftHandLandmarks,  handedness: 'Left',  score: 0.9, gesture: this._gesture(r.leftHandLandmarks) });
        if (r.rightHandLandmarks) hands.push({ keypoints: r.rightHandLandmarks, handedness: 'Right', score: 0.9, gesture: this._gesture(r.rightHandLandmarks) });
        if (hands.length > 0) {
          this._handRenderer.setInputSize(1, 1); // already normalized
          this._handRenderer.render(hands, true);
          AppState.handCount = hands.length;
        }
      }
    }

    AppState.fps = this._fpsTracker.tick();
    EventBus.emit('fps:update', { fps: AppState.fps });

    this._raf = requestAnimationFrame(() => this._loop());
  }

  _detectDir(lm) {
    if (!lm || lm.length < 400) return 'Straight';
    const nose = lm[1], le = lm[234], re = lm[454], chin = lm[152], fore = lm[10];
    if (!nose||!le||!re) return 'Straight';
    const cx = (le.x+re.x)/2, cy = (fore.y+chin.y)/2;
    const dx = nose.x-cx, dy = nose.y-cy;
    if (dx < -0.04) return 'Left';
    if (dx >  0.04) return 'Right';
    if (dy < -0.03) return 'Up';
    if (dy >  0.03) return 'Down';
    return 'Straight';
  }

  _gesture(kps) {
    if (!kps || kps.length < 21) return 'Hand';
    const tips = [4,8,12,16,20], mcp = [2,5,9,13,17];
    const ext = [1,2,3,4].map(i => kps[tips[i]].y < kps[mcp[i]].y);
    if (ext.every(Boolean)) return 'Open ✋';
    if (ext.every(f=>!f))   return 'Fist ✊';
    if (ext[1]&&!ext[0]&&!ext[2]&&!ext[3]) return 'Point ☝';
    if (ext[1]&&ext[2]&&!ext[0]&&!ext[3])  return 'Peace ✌';
    return 'Hand';
  }

  _waitFor(check, name, timeout = 15000) {
    return new Promise(resolve => {
      const start = Date.now();
      const poll  = () => {
        if (check()) { resolve(); return; }
        if (Date.now() - start > timeout) { console.warn(name + ' not available'); resolve(); return; }
        setTimeout(poll, 200);
      };
      poll();
    });
  }

  get canvas()       { return this._canvas; }
  get isRunning()    { return this._running; }
  get faceResults()  { return []; }
  get motionHistory(){ return this._motionDetector.getHistory(); }

  destroy() {
    this.stop();
    this._holistic?.close?.();
  }
}
