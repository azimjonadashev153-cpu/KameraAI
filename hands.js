/**
 * hands.js — Hand tracking, landmark rendering, gesture detection
 * Uses MediaPipe Hands via CDN
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus, clamp } from './utils.js';

// ============================================================
// HAND CONNECTIONS (21 landmarks per hand)
// ============================================================
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],       // Thumb
  [0,5],[5,6],[6,7],[7,8],       // Index
  [5,9],[9,10],[10,11],[11,12],  // Middle
  [9,13],[13,14],[14,15],[15,16],// Ring
  [13,17],[17,18],[18,19],[19,20],// Pinky
  [0,17]                          // Palm edge
];

// Finger tip indices
const FINGERTIPS = [4, 8, 12, 16, 20];
// Finger base (MCP) indices
const FINGER_MCP = [2, 5, 9, 13, 17];

// Colors per hand
const HAND_COLORS = {
  Left:  { primary: '#34d399', glow: 'rgba(52,211,153,0.6)' },
  Right: { primary: '#818cf8', glow: 'rgba(129,140,248,0.6)' }
};

// ============================================================
// GESTURE DETECTION — basic gestures from landmark geometry
// ============================================================
function detectGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return 'Hand Detected';

  // Check if fingers are extended by comparing tip y vs MCP y
  const fingers = [1,2,3,4].map(i => {
    const tip = landmarks[FINGERTIPS[i]];
    const mcp = landmarks[FINGER_MCP[i]];
    return tip.y < mcp.y; // y decreases upward in image coords
  });

  // Thumb: compare x instead (horizontal extension)
  const thumbExtended = Math.abs(landmarks[4].x - landmarks[2].x) > 0.06;
  const allExtended   = fingers.every(Boolean) && thumbExtended;
  const noneExtended  = fingers.every(f => !f) && !thumbExtended;
  const fistClosed    = noneExtended;
  const openHand      = allExtended;
  const indexPoint    = fingers[1] && !fingers[0] && !fingers[2] && !fingers[3];
  const peace         = fingers[1] && fingers[2] && !fingers[0] && !fingers[3];
  const thumbsUp      = thumbExtended && !fingers[1] && !fingers[2] && !fingers[3] && !fingers[0];
  const okSign        = !fingers[1] && fingers[2] && fingers[3] && thumbExtended;

  if (openHand)   return 'Open Hand ✋';
  if (fistClosed) return 'Fist ✊';
  if (indexPoint) return 'Pointing ☝';
  if (peace)      return 'Peace ✌';
  if (thumbsUp)   return 'Thumbs Up 👍';
  if (okSign)     return 'OK 👌';
  return 'Hand Detected';
}

// ============================================================
// HAND RENDERER
// ============================================================
export class HandRenderer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._phase  = 0;
  }

  /**
   * Render all detected hands.
   * @param {Array} hands  - Array of { landmarks, handedness } objects
   * @param {boolean} showLandmarks
   */
  render(hands, showLandmarks) {
    if (!hands || hands.length === 0) return;
    this._phase = (this._phase + 0.06) % (Math.PI * 2);

    hands.forEach(hand => {
      const { landmarks, handedness } = hand;
      const side   = handedness || 'Right';
      const colors = HAND_COLORS[side] || HAND_COLORS.Right;
      this._drawHand(landmarks, colors);
    });
  }

  _drawHand(landmarks, colors) {
    const ctx = this._ctx;
    const cw  = this._canvas.width;
    const ch  = this._canvas.height;
    const px  = lm => ({ x: lm.x * cw, y: lm.y * ch });
    const pulse = 0.6 + 0.4 * Math.sin(this._phase);

    // Draw connections
    HAND_CONNECTIONS.forEach(([i, j]) => {
      const pa = px(landmarks[i]);
      const pb = px(landmarks[j]);

      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth   = 2;
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur  = 8;
      ctx.lineCap     = 'round';
      ctx.stroke();
    });
    ctx.shadowBlur = 0;

    // Draw joints
    landmarks.forEach((lm, i) => {
      const p    = px(lm);
      const isTip = FINGERTIPS.includes(i);
      const r    = isTip ? 5 : 3;

      // Outer glow ring on fingertips
      if (isTip) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = `${colors.primary}${Math.round(pulse * 80).toString(16).padStart(2,'0')}`;
        ctx.lineWidth   = 1;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = isTip ? '#fff' : colors.primary;
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur  = isTip ? 12 : 6;
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    // Wrist label
    const wrist = px(landmarks[0]);
    ctx.save();
    ctx.font      = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = colors.primary;
    ctx.textAlign = 'center';
    ctx.shadowColor= colors.glow;
    ctx.shadowBlur = 8;
    ctx.fillText('HAND', wrist.x, wrist.y + 16);
    ctx.restore();
  }
}

// ============================================================
// HAND DETECTOR ENGINE
// ============================================================
export class HandDetector {
  constructor() {
    this._hands     = null;
    this._ready     = false;
    this._results   = [];
    this._prevCount = 0;
  }

  async init() {
    return new Promise((resolve) => {
      try {
        const hands = new window.Hands({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
        });

        hands.setOptions({
          maxNumHands:             2,
          modelComplexity:         1,
          minDetectionConfidence:  AppState.settings.confidence,
          minTrackingConfidence:   0.5
        });

        hands.onResults((results) => this._onResults(results));

        hands.initialize().then(() => {
          this._hands = hands;
          this._ready = true;
          resolve(true);
        }).catch(err => {
          console.warn('Hands init failed:', err);
          resolve(false);
        });

      } catch (err) {
        console.warn('Hands not available:', err);
        resolve(false);
      }
    });
  }

  async detect(videoElement) {
    if (!this._ready || !this._hands) return [];
    try {
      await this._hands.send({ image: videoElement });
    } catch (e) { /* skip */ }
    return this._results;
  }

  _onResults(results) {
    const multiLandmarks  = results.multiHandLandmarks  || [];
    const multiHandedness = results.multiHandedness     || [];

    this._results = multiLandmarks.map((lm, i) => ({
      landmarks:  lm,
      handedness: multiHandedness[i]?.label || 'Right',
      score:      multiHandedness[i]?.score || 0.9,
      gesture:    detectGesture(lm)
    }));

    const count = this._results.length;
    AppState.handCount = count;

    if (count !== this._prevCount) {
      EventBus.emit('hands:update', { count, hands: this._results });
      this._prevCount = count;
    }
  }

  /** Get detected hand sides as a set: 'Left', 'Right', 'Both', 'None' */
  get handSides() {
    const sides = new Set(this._results.map(h => h.handedness));
    if (sides.size === 0)    return 'None';
    if (sides.size === 2)    return 'Both';
    return [...sides][0];
  }

  get isReady()    { return this._ready; }
  get lastResults(){ return this._results; }

  destroy() {
    if (this._hands) this._hands.close?.();
    this._hands = null;
    this._ready = false;
  }
}
