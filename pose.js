/**
 * pose.js — Realistic full-body pose & hand skeleton rendering
 * Supports: hands-only mode, full-body mode, per-person tracking limit
 * Smooth, life-like skeleton with proper joint anatomy
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus, clamp } from './utils.js';

// ============================================================
// SKELETON MODE ENUM
// ============================================================
export const SkeletonMode = {
  NONE:  'none',
  HANDS: 'hands',
  FULL:  'full'
};

// ============================================================
// POSE CONNECTIONS — anatomically correct grouping
// ============================================================

// Full body connections with body region tags
const BODY_SEGMENTS = [
  // HEAD connections (subtle)
  { pts: [0,1],[1,2],[2,3],[3,7],  region: 'head'  },
  { pts: [0,4],[4,5],[5,6],[6,8],  region: 'head'  },

  // TORSO — strong center
  { pts: [11,12],  region: 'torso' },
  { pts: [11,23],  region: 'torso' },
  { pts: [12,24],  region: 'torso' },
  { pts: [23,24],  region: 'torso' },

  // LEFT ARM
  { pts: [11,13],  region: 'lArm' },
  { pts: [13,15],  region: 'lArm' },
  { pts: [15,17],  region: 'lArm' },
  { pts: [15,19],  region: 'lArm' },
  { pts: [15,21],  region: 'lArm' },
  { pts: [17,19],  region: 'lArm' },

  // RIGHT ARM
  { pts: [12,14],  region: 'rArm' },
  { pts: [14,16],  region: 'rArm' },
  { pts: [16,18],  region: 'rArm' },
  { pts: [16,20],  region: 'rArm' },
  { pts: [16,22],  region: 'rArm' },
  { pts: [18,20],  region: 'rArm' },

  // LEFT LEG
  { pts: [23,25],  region: 'lLeg' },
  { pts: [25,27],  region: 'lLeg' },
  { pts: [27,29],  region: 'lLeg' },
  { pts: [27,31],  region: 'lLeg' },
  { pts: [29,31],  region: 'lLeg' },

  // RIGHT LEG
  { pts: [24,26],  region: 'rLeg' },
  { pts: [26,28],  region: 'rLeg' },
  { pts: [28,30],  region: 'rLeg' },
  { pts: [28,32],  region: 'rLeg' },
  { pts: [30,32],  region: 'rLeg' },
];

// Flatten for rendering
const CONNECTIONS = [];
BODY_SEGMENTS.forEach(seg => {
  // each entry may have pts as [i,j] directly or as array of pairs
  if (Array.isArray(seg.pts[0])) {
    seg.pts.forEach(pair => CONNECTIONS.push({ a: pair[0], b: pair[1], region: seg.region }));
  } else {
    CONNECTIONS.push({ a: seg.pts[0], b: seg.pts[1], region: seg.region });
  }
});

// Hand-only connections (wrist + arm only from pose landmarks)
const HAND_CONNECTIONS_POSE = [
  { a:11, b:13, region:'lArm' },
  { a:13, b:15, region:'lArm' },
  { a:12, b:14, region:'rArm' },
  { a:14, b:16, region:'rArm' },
];

// Region colors — vibrant, life-like
const REGION_STYLE = {
  head:  { stroke: 'rgba(200,200,255,0.5)', glow: 'rgba(200,200,255,0.3)', lw: 1.5 },
  torso: { stroke: 'rgba(0,212,255,0.85)',  glow: 'rgba(0,212,255,0.5)',   lw: 3   },
  lArm:  { stroke: 'rgba(52,211,153,0.85)', glow: 'rgba(52,211,153,0.5)',  lw: 2.5 },
  rArm:  { stroke: 'rgba(251,146,60,0.85)', glow: 'rgba(251,146,60,0.5)',  lw: 2.5 },
  lLeg:  { stroke: 'rgba(56,189,248,0.85)', glow: 'rgba(56,189,248,0.5)',  lw: 2.5 },
  rLeg:  { stroke: 'rgba(244,114,182,0.85)',glow: 'rgba(244,114,182,0.5)', lw: 2.5 },
};

// Key joints to highlight with circles
const KEY_JOINTS = [11,12,13,14,15,16,23,24,25,26,27,28]; // shoulders, elbows, wrists, hips, knees, ankles

// ============================================================
// SMOOTH INTERPOLATION — lerp between frames for fluid motion
// ============================================================
class LandmarkSmoother {
  constructor(alpha = 0.4) {
    this._alpha  = alpha; // lower = smoother but more lag
    this._prev   = null;
  }

  smooth(landmarks) {
    if (!landmarks) { this._prev = null; return null; }
    if (!this._prev) { this._prev = landmarks; return landmarks; }

    const smoothed = landmarks.map((lm, i) => {
      const p = this._prev[i] || lm;
      return {
        x:          p.x + this._alpha * (lm.x - p.x),
        y:          p.y + this._alpha * (lm.y - p.y),
        z:          (p.z || 0) + this._alpha * ((lm.z || 0) - (p.z || 0)),
        visibility: lm.visibility
      };
    });

    this._prev = smoothed;
    return smoothed;
  }

  reset() { this._prev = null; }
}

// ============================================================
// POSE RENDERER
// ============================================================
export class PoseRenderer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._phase  = 0;
    // Smoothers per person slot (max 5)
    this._smoothers = Array.from({ length: 5 }, () => new LandmarkSmoother(0.35));
  }

  /**
   * Render skeleton overlay.
   * @param {Array}         allLandmarks  - Array of landmark arrays (one per person)
   * @param {SkeletonMode}  mode          - 'none' | 'hands' | 'full'
   * @param {number}        maxPersons    - max number of people to render (1,2,3,Infinity)
   */
  render(allLandmarks, mode, maxPersons = Infinity) {
    if (!allLandmarks || allLandmarks.length === 0 || mode === SkeletonMode.NONE) return;

    this._phase = (this._phase + 0.05) % (Math.PI * 2);
    const pulse = 0.7 + 0.3 * Math.sin(this._phase);

    const count = Math.min(allLandmarks.length, maxPersons);
    for (let i = 0; i < count; i++) {
      const raw = allLandmarks[i];
      // Smooth landmarks for this person slot
      const lm = this._smoothers[i] ? this._smoothers[i].smooth(raw) : raw;
      if (!lm) continue;

      if (mode === SkeletonMode.FULL) {
        this._drawFullBody(lm, pulse, i);
      } else if (mode === SkeletonMode.HANDS) {
        this._drawHandsOnly(lm, pulse, i);
      }
    }

    // Reset smoothers for unused slots
    for (let i = count; i < this._smoothers.length; i++) {
      this._smoothers[i].reset();
    }
  }

  // ── FULL BODY SKELETON ────────────────────────────────────
  _drawFullBody(lm, pulse, personIdx) {
    const ctx = this._ctx;
    const cw  = this._canvas.width;
    const ch  = this._canvas.height;
    const px  = l => ({ x: l.x * cw, y: l.y * ch });

    // Draw each connection
    CONNECTIONS.forEach(({ a, b, region }) => {
      const la = lm[a], lb = lm[b];
      if (!la || !lb) return;
      const visA = la.visibility ?? 1;
      const visB = lb.visibility ?? 1;
      if (visA < 0.25 || visB < 0.25) return; // skip invisible

      const style = REGION_STYLE[region] || REGION_STYLE.torso;
      const pa    = px(la), pb = px(lb);
      const alpha = Math.min(visA, visB);

      // Glow pass (wider, blurred)
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = style.glow.replace('0.5)', `${0.3 * pulse})`);
      ctx.lineWidth   = style.lw * 3;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.filter      = 'blur(4px)';
      ctx.stroke();

      // Sharp pass
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = style.stroke.replace('0.85)', `${0.85 * alpha})`);
      ctx.lineWidth   = style.lw;
      ctx.filter      = 'none';
      ctx.stroke();
    });

    ctx.filter = 'none';

    // Draw key joints
    KEY_JOINTS.forEach(idx => {
      const l = lm[idx];
      if (!l || (l.visibility ?? 1) < 0.3) return;
      const p = px(l);
      this._drawJoint(ctx, p, 5, pulse);
    });

    // Person label at top of body (nose or mid-shoulder)
    const nose = lm[0];
    if (nose && (nose.visibility ?? 1) > 0.4) {
      const np = px(nose);
      ctx.save();
      ctx.font      = 'bold 11px Inter, sans-serif';
      ctx.fillStyle = `rgba(0,212,255,${0.9 * pulse})`;
      ctx.textAlign = 'center';
      ctx.shadowColor= 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(`P${personIdx + 1}`, np.x, np.y - 14);
      ctx.restore();
    }
  }

  // ── HANDS + ARMS ONLY ─────────────────────────────────────
  _drawHandsOnly(lm, pulse, personIdx) {
    const ctx = this._ctx;
    const cw  = this._canvas.width;
    const ch  = this._canvas.height;
    const px  = l => ({ x: l.x * cw, y: l.y * ch });

    HAND_CONNECTIONS_POSE.forEach(({ a, b, region }) => {
      const la = lm[a], lb = lm[b];
      if (!la || !lb) return;
      if ((la.visibility ?? 1) < 0.25 || (lb.visibility ?? 1) < 0.25) return;

      const style = REGION_STYLE[region];
      const pa = px(la), pb = px(lb);

      // Glow
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = style.glow;
      ctx.lineWidth   = style.lw * 3;
      ctx.lineCap     = 'round';
      ctx.filter      = 'blur(4px)';
      ctx.stroke();

      // Sharp
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth   = style.lw;
      ctx.filter      = 'none';
      ctx.stroke();
    });

    ctx.filter = 'none';

    // Wrist joints
    [15, 16].forEach(idx => {
      const l = lm[idx];
      if (!l || (l.visibility ?? 1) < 0.3) return;
      this._drawJoint(ctx, px(l), 6, pulse);
    });
    // Elbow joints
    [13, 14].forEach(idx => {
      const l = lm[idx];
      if (!l || (l.visibility ?? 1) < 0.3) return;
      this._drawJoint(ctx, px(l), 4, pulse);
    });
  }

  // ── JOINT CIRCLE ──────────────────────────────────────────
  _drawJoint(ctx, p, r, pulse) {
    // Outer glow ring
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,212,255,${0.25 * pulse})`;
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Inner filled dot
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle   = '#fff';
    ctx.shadowColor = 'rgba(0,212,255,0.9)';
    ctx.shadowBlur  = 10;
    ctx.fill();
    ctx.shadowBlur  = 0;
  }
}

// ============================================================
// POSE DETECTOR ENGINE
// ============================================================
export class PoseDetector {
  constructor() {
    this._pose         = null;
    this._ready        = false;
    this._results      = [];   // Array of landmark arrays
    this._prevDetected = false;
  }

  async init() {
    return new Promise((resolve) => {
      try {
        // MediaPipe Pose supports single person per instance.
        // For multi-person we use a single detector and process results as array.
        const pose = new window.Pose({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
        });

        pose.setOptions({
          modelComplexity:          1,
          smoothLandmarks:          true,
          enableSegmentation:       false,
          smoothSegmentation:       false,
          minDetectionConfidence:   AppState.settings.confidence,
          minTrackingConfidence:    0.5
        });

        pose.onResults((results) => this._onResults(results));

        pose.initialize().then(() => {
          this._pose  = pose;
          this._ready = true;
          resolve(true);
        }).catch(err => {
          console.warn('Pose init failed:', err);
          resolve(false);
        });

      } catch (err) {
        console.warn('Pose not available:', err);
        resolve(false);
      }
    });
  }

  async detect(videoElement) {
    if (!this._ready || !this._pose) return [];
    try {
      await this._pose.send({ image: videoElement });
    } catch (e) { /* skip bad frames */ }
    return this._results;
  }

  _onResults(results) {
    const lm = results.poseLandmarks;

    if (lm && lm.length > 0) {
      // MediaPipe Pose returns single person; wrap in array for unified API
      this._results = [lm];
      AppState.poseDetected = true;

      if (!this._prevDetected) {
        EventBus.emit('pose:detected');
        this._prevDetected = true;
      }
    } else {
      this._results = [];
      AppState.poseDetected = false;

      if (this._prevDetected) {
        EventBus.emit('pose:lost');
        this._prevDetected = false;
      }
    }
  }

  get isReady()    { return this._ready; }
  get lastResults(){ return this._results; }

  destroy() {
    if (this._pose) this._pose.close?.();
    this._pose  = null;
    this._ready = false;
  }
}
