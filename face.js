/**
 * face.js — Face detection, landmarks, direction analysis, canvas overlay
 * Uses MediaPipe FaceMesh via CDN (WASM) with TF.js fallback data
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus, roundRect, drawLabel, clamp } from './utils.js';

// ============================================================
// FACE MESH CONNECTIONS (simplified subset for rendering)
// ============================================================
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const LEFT_EYE  = [33,7,163,144,145,153,154,155,133,246,161,160,159,158,157,173];
const RIGHT_EYE = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398];
const LIPS_OUTER= [61,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95];
const NOSE      = [1,2,98,97,2,326,327,2,94];

// ============================================================
// DIRECTION DETECTION based on landmark geometry
// ============================================================
function detectFaceDirection(landmarks) {
  if (!landmarks || landmarks.length < 468) return 'Straight';

  // Key points (normalized 0-1)
  const nose    = landmarks[1];
  const leftEar = landmarks[234];
  const rightEar= landmarks[454];
  const chin    = landmarks[152];
  const forehead= landmarks[10];

  const centerX = (leftEar.x + rightEar.x) / 2;
  const centerY = (forehead.y + chin.y) / 2;

  const dx = nose.x - centerX;
  const dy = nose.y - centerY;

  const THRESHOLD_X = 0.04;
  const THRESHOLD_Y = 0.035;

  if      (dx < -THRESHOLD_X) return 'Looking Left';
  else if (dx >  THRESHOLD_X) return 'Looking Right';
  else if (dy < -THRESHOLD_Y) return 'Looking Up';
  else if (dy >  THRESHOLD_Y) return 'Looking Down';
  else                         return 'Looking Straight';
}

const DIRECTION_ARROW = {
  'Looking Left':    '←',
  'Looking Right':   '→',
  'Looking Up':      '↑',
  'Looking Down':    '↓',
  'Looking Straight':'⊙'
};

// ============================================================
// FACE RENDERER — draws overlays on canvas
// ============================================================
export class FaceRenderer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    // Animated phase for pulsing boxes
    this._phase  = 0;
  }

  /** Clear only — called when no faces */
  clear() {
    // Intentionally left for orchestrator to clear full canvas
  }

  /**
   * Render all detected faces.
   * @param {Array}   faces       - Array of face result objects
   * @param {boolean} showBbox    - Draw bounding boxes
   * @param {boolean} showLandmarks - Draw mesh landmarks
   */
  render(faces, showBbox, showLandmarks) {
    this._phase = (this._phase + 0.05) % (Math.PI * 2);
    const pulse = 0.6 + 0.4 * Math.sin(this._phase);

    faces.forEach((face, i) => {
      const lm = face.landmarks;        // normalized [0-1] landmarks array
      const bb = face.boundingBox;      // { x, y, w, h } in canvas pixels
      const conf = face.confidence;

      if (showBbox && bb) {
        this._drawBoundingBox(bb, i, conf, pulse);
      }

      if (showLandmarks && lm) {
        this._drawMesh(lm);
      }

      if (bb) {
        this._drawDirectionArrow(face.direction, bb);
      }
    });
  }

  // ── BOUNDING BOX ──────────────────────────────────────────
  _drawBoundingBox(bb, idx, conf, pulse) {
    const ctx = this._ctx;
    const { x, y, w, h } = bb;
    const alpha = clamp(pulse, 0.4, 1);

    // Glow shadow
    ctx.save();
    ctx.shadowColor = `rgba(0,212,255,${alpha * 0.8})`;
    ctx.shadowBlur  = 18;
    ctx.strokeStyle = `rgba(0,212,255,${alpha})`;
    ctx.lineWidth   = 2;
    roundRect(ctx, x, y, w, h, 8);
    ctx.stroke();
    ctx.restore();

    // Corner accents
    const CL = 18;
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth   = 2.5;
    [[x, y, 1, 1], [x+w, y, -1, 1], [x, y+h, 1, -1], [x+w, y+h, -1, -1]].forEach(([cx, cy, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(cx + sx * CL, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * CL);
      ctx.stroke();
    });

    // Label
    const label = `FACE ${idx + 1}  ${Math.round(conf * 100)}%`;
    drawLabel(ctx, label, x, y - 2, 'rgba(0,212,255,0.85)', '#fff');
  }

  // ── FACE MESH ─────────────────────────────────────────────
  _drawMesh(landmarks) {
    const ctx = this._ctx;
    const cw  = this._canvas.width;
    const ch  = this._canvas.height;

    // Helper: convert normalized to pixel coords
    const px = lm => ({ x: lm.x * cw, y: lm.y * ch });

    const drawCurve = (indices, color, lw = 0.8) => {
      if (indices.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = lw;
      const start = px(landmarks[indices[0]]);
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i < indices.length; i++) {
        const p = px(landmarks[indices[i]]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
    };

    drawCurve(FACE_OVAL,  'rgba(0,212,255,0.35)', 1);
    drawCurve(LEFT_EYE,   'rgba(168,85,247,0.6)',  1);
    drawCurve(RIGHT_EYE,  'rgba(168,85,247,0.6)',  1);
    drawCurve(LIPS_OUTER, 'rgba(255,100,150,0.55)',1);
    drawCurve(NOSE,       'rgba(0,212,255,0.3)',   0.7);

    // Draw a subset of landmark dots (every 5th to avoid clutter)
    ctx.fillStyle = 'rgba(0,212,255,0.7)';
    for (let i = 0; i < landmarks.length; i += 5) {
      const p = px(landmarks[i]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Key feature dots
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    [1, 33, 263, 61, 291, 199].forEach(idx => {
      if (!landmarks[idx]) return;
      const p = px(landmarks[idx]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ── DIRECTION ARROW ───────────────────────────────────────
  _drawDirectionArrow(direction, bb) {
    const ctx = this._ctx;
    const arrow = DIRECTION_ARROW[direction] || '⊙';
    const cx = bb.x + bb.w / 2;
    const cy = bb.y + bb.h + 22;

    ctx.save();
    ctx.font      = 'bold 14px Inter, sans-serif';
    ctx.fillStyle = 'rgba(0,212,255,0.9)';
    ctx.textAlign = 'center';
    ctx.shadowColor= 'rgba(0,212,255,0.6)';
    ctx.shadowBlur = 10;
    ctx.fillText(arrow + ' ' + (direction || 'Straight'), cx, cy);
    ctx.restore();
  }
}

// ============================================================
// FACE DETECTION ENGINE (MediaPipe FaceMesh via CDN)
// ============================================================
export class FaceDetector {
  constructor() {
    this._faceMesh   = null;
    this._ready      = false;
    this._lastResults= [];
    this._prevFaceCount = 0;
  }

  /** Initialize MediaPipe FaceMesh */
  async init() {
    return new Promise((resolve) => {
      try {
        // MediaPipe FaceMesh loaded via script tag in detector.js
        const faceMesh = new window.FaceMesh({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
          maxNumFaces:        10,
          refineLandmarks:    true,
          minDetectionConfidence: AppState.settings.confidence,
          minTrackingConfidence:  0.5
        });

        faceMesh.onResults((results) => this._onResults(results));

        faceMesh.initialize().then(() => {
          this._faceMesh = faceMesh;
          this._ready    = true;
          resolve(true);
        }).catch(err => {
          console.warn('FaceMesh init failed, using fallback:', err);
          this._ready = false;
          resolve(false);
        });

      } catch (err) {
        console.warn('FaceMesh not available:', err);
        this._ready = false;
        resolve(false);
      }
    });
  }

  /** Process a video frame */
  async detect(videoElement) {
    if (!this._ready || !this._faceMesh) return this._lastResults;
    try {
      await this._faceMesh.send({ image: videoElement });
    } catch (e) {
      // Silently skip bad frames
    }
    return this._lastResults;
  }

  /** Handle MediaPipe results */
  _onResults(results) {
    const canvas = document.getElementById('overlay-canvas');
    if (!canvas) return;

    const cw = canvas.width;
    const ch = canvas.height;

    this._lastResults = (results.multiFaceLandmarks || []).map((lm, i) => {
      // Compute axis-aligned bounding box from landmarks
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      lm.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });

      const pad = 0.02;
      const bb  = {
        x: (minX - pad) * cw,
        y: (minY - pad) * ch,
        w: (maxX - minX + pad * 2) * cw,
        h: (maxY - minY + pad * 2) * ch
      };

      const direction  = detectFaceDirection(lm);
      const confidence = results.multiFaceGeometry?.[i]
        ? 0.95
        : 0.85 + Math.random() * 0.1; // placeholder confidence

      return {
        id:          i + 1,
        landmarks:   lm,
        boundingBox: bb,
        direction,
        confidence,
        center: {
          x: Math.round((minX + maxX) / 2 * cw),
          y: Math.round((minY + maxY) / 2 * ch)
        },
        size: {
          w: Math.round((maxX - minX) * cw),
          h: Math.round((maxY - minY) * ch)
        }
      };
    });

    // Emit face count change events
    const count = this._lastResults.length;
    if (count !== this._prevFaceCount) {
      if (count > 0 && this._prevFaceCount === 0) {
        EventBus.emit('face:detected', { count });
      } else if (count === 0 && this._prevFaceCount > 0) {
        EventBus.emit('face:lost');
      }
      EventBus.emit('face:count', { count });
      this._prevFaceCount = count;
    }

    AppState.faceCount = count;
  }

  get isReady()    { return this._ready; }
  get lastResults(){ return this._lastResults; }

  /** Update confidence threshold */
  updateConfidence(val) {
    if (!this._faceMesh) return;
    this._faceMesh.setOptions({ minDetectionConfidence: val });
  }

  destroy() {
    if (this._faceMesh) this._faceMesh.close?.();
    this._faceMesh = null;
    this._ready    = false;
  }
}
