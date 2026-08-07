/**
 * hands.js — stub (hand trails handled by motion.js)
 */
import { AppState, EventBus } from './utils.js';
export class HandRenderer {
  constructor(canvas){ this._canvas=canvas; this._inW=1; this._inH=1; }
  render(){}
  setInputSize(w,h){ this._inW=w; this._inH=h; }
}
export class HandDetector {
  constructor(){ this._ready=false; this._results=[]; }
  async init(){ return false; }
  async detect(){ return []; }
  get isReady(){ return false; }
  get lastResults(){ return this._results; }
  destroy(){}
}
 * No WASM conflict — runs in TF.js WebGL backend
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus } from './utils.js';

// TF.js hand-pose-detection keypoints (21 per hand)
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],        // Thumb
  [0,5],[5,6],[6,7],[7,8],        // Index
  [5,9],[9,10],[10,11],[11,12],   // Middle
  [9,13],[13,14],[14,15],[15,16], // Ring
  [13,17],[17,18],[18,19],[19,20],// Pinky
  [0,17]                          // Palm
];

const TIPS = [4, 8, 12, 16, 20];
const MCP  = [2, 5, 9, 13, 17];

const COLORS = {
  Left:  { line: 'rgba(52,211,153,0.9)',  glow: 'rgba(52,211,153,0.5)'  },
  Right: { line: 'rgba(129,140,248,0.9)', glow: 'rgba(129,140,248,0.5)' }
};

function detectGesture(kps) {
  if (!kps || kps.length < 21) return 'Hand';
  const fingers = [1,2,3,4].map(i =>
    kps[TIPS[i]].y < kps[MCP[i]].y
  );
  const thumbOut = Math.abs(kps[4].x - kps[2].x) > 30;
  if (fingers.every(Boolean) && thumbOut)     return 'Open ✋';
  if (fingers.every(f => !f) && !thumbOut)    return 'Fist ✊';
  if (fingers[1] && !fingers[0] && !fingers[2] && !fingers[3]) return 'Point ☝';
  if (fingers[1] && fingers[2] && !fingers[0] && !fingers[3])  return 'Peace ✌';
  if (thumbOut && !fingers[1] && !fingers[2] && !fingers[3])   return 'Thumbs 👍';
  return 'Hand';
}

// ── RENDERER ─────────────────────────────────────────────────
export class HandRenderer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._phase  = 0;
  }

  render(hands, _showLandmarks) {
    if (!hands?.length) return;
    this._phase = (this._phase + 0.06) % (Math.PI * 2);
    const pulse = 0.7 + 0.3 * Math.sin(this._phase);
    hands.forEach(h => this._drawHand(h, pulse));
  }

  _drawHand(hand, pulse) {
    const ctx    = this._ctx;
    const cw     = this._canvas.width;
    const ch     = this._canvas.height;
    const kps    = hand.keypoints;
    const side   = hand.handedness || 'Right';
    const colors = COLORS[side] || COLORS.Right;

    const xy = k => {
      // If inW == 1 (holistic normalized), scale to canvas directly
      // If inW > 1 (pixel coords), scale from input to canvas
      const sx = this._inW <= 1 ? cw : cw / this._inW;
      const sy = this._inH <= 1 ? ch : ch / this._inH;
      return { x: k.x * sx, y: k.y * sy };
    };

    // Draw connections
    CONNECTIONS.forEach(([a, b]) => {
      const pa = xy(kps[a]), pb = xy(kps[b]);
      // Glow
      ctx.save();
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = colors.glow; ctx.lineWidth = 8;
      ctx.lineCap = 'round'; ctx.filter = 'blur(4px)'; ctx.stroke(); ctx.restore();
      // Line
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = colors.line; ctx.lineWidth = 2.5;
      ctx.lineCap = 'round'; ctx.stroke();
    });

    // Draw joints
    kps.forEach((k, i) => {
      const p    = xy(k);
      const isTip = TIPS.includes(i);
      const r    = isTip ? 5 : 3;

      if (isTip) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = `${colors.line.replace('0.9)', `${0.3 * pulse})`)}`;
        ctx.lineWidth = 1; ctx.stroke();
      }

      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? '#fff' : colors.line;
      ctx.shadowColor = colors.glow; ctx.shadowBlur = isTip ? 12 : 5;
      ctx.fill(); ctx.shadowBlur = 0;
    });

    // Gesture label
    const wrist = xy(kps[0]);
    ctx.save();
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = colors.line; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
    ctx.fillText(hand.gesture || side, wrist.x, wrist.y + 20);
    ctx.restore();
  }

  setInputSize(w, h) { this._inW = w; this._inH = h; }
}

// ── DETECTOR ─────────────────────────────────────────────────
export class HandDetector {
  constructor() {
    this._detector  = null;
    this._ready     = false;
    this._results   = [];
    this._prevCount = 0;
    this._inW = 0; this._inH = 0;
  }

  async init() {
    try {
      if (!window.handPoseDetection || !window.tf) {
        console.warn('hand-pose-detection not loaded');
        return false;
      }

      const model   = window.handPoseDetection.SupportedModels.MediaPipeHands;
      const config  = {
        runtime: 'tfjs',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4',
        modelType: 'full',
        maxHands: 2,
        minHandDetectionConfidence: AppState.settings.confidence,
        minHandPresenceConfidence:  0.5,
        minTrackingConfidence:      0.5,
      };

      this._detector = await window.handPoseDetection.createDetector(model, config);
      this._ready    = true;
      return true;
    } catch (e) {
      console.warn('Hand detector init failed:', e);
      return false;
    }
  }

  async detect(video) {
    if (!this._ready || !this._detector) return [];
    if (!video || video.readyState < 2)    return [];
    try {
      const hands = await this._detector.estimateHands(video, {
        flipHorizontal: false
      });

      this._inW = video.videoWidth;
      this._inH = video.videoHeight;

      this._results = (hands || []).map(h => ({
        keypoints:  h.keypoints,
        handedness: h.handedness,
        score:      h.score,
        gesture:    detectGesture(h.keypoints)
      }));

      const count = this._results.length;
      AppState.handCount = count;

      if (count !== this._prevCount) {
        EventBus.emit('hands:update', { count, hands: this._results });
        this._prevCount = count;
      }
    } catch (e) { /* skip frame */ }
    return this._results;
  }

  get isReady()    { return this._ready; }
  get lastResults(){ return this._results; }

  destroy() {
    this._detector?.dispose?.();
    this._detector = null;
    this._ready    = false;
  }
}
