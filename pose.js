/**
 * pose.js — Full-body pose detection and skeleton rendering
 * Uses MediaPipe Pose via CDN
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus, clamp } from './utils.js';

// ============================================================
// POSE SKELETON CONNECTIONS
// Full body: 33 landmarks per MediaPipe Pose
// ============================================================
const POSE_CONNECTIONS = [
  // Face
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],
  // Torso
  [11,12],[11,23],[12,24],[23,24],
  // Left arm
  [11,13],[13,15],[15,17],[15,19],[15,21],[17,19],
  // Right arm
  [12,14],[14,16],[16,18],[16,20],[16,22],[18,20],
  // Left leg
  [23,25],[25,27],[27,29],[27,31],[29,31],
  // Right leg
  [24,26],[26,28],[28,30],[28,32],[30,32]
];

// Color segments by body region
const SEGMENT_COLOR = {
  face:      'rgba(168,85,247,0.7)',
  torso:     'rgba(0,212,255,0.7)',
  leftArm:   'rgba(52,211,153,0.7)',
  rightArm:  'rgba(251,146,60,0.7)',
  leftLeg:   'rgba(56,189,248,0.7)',
  rightLeg:  'rgba(244,114,182,0.7)'
};

function getConnectionColor(i, j) {
  if ([0,1,2,3,4,5,6,7,8].some(v => v===i||v===j)) return SEGMENT_COLOR.face;
  if ([11,12,23,24].includes(i) && [11,12,23,24].includes(j)) return SEGMENT_COLOR.torso;
  if ([11,13,15,17,19,21].some(v=>v===i||v===j)) return SEGMENT_COLOR.leftArm;
  if ([12,14,16,18,20,22].some(v=>v===i||v===j)) return SEGMENT_COLOR.rightArm;
  if ([23,25,27,29,31].some(v=>v===i||v===j)) return SEGMENT_COLOR.leftLeg;
  return SEGMENT_COLOR.rightLeg;
}

// ============================================================
// POSE RENDERER
// ============================================================
export class PoseRenderer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._phase  = 0;
  }

  /**
   * Draw skeleton and joints on canvas.
   * @param {Array} landmarks    - 33 normalized pose landmarks
   * @param {boolean} showSkeleton
   * @param {boolean} showLandmarks
   */
  render(landmarks, showSkeleton, showLandmarks) {
    if (!landmarks || landmarks.length === 0) return;
    this._phase = (this._phase + 0.04) % (Math.PI * 2);
    const cw = this._canvas.width;
    const ch = this._canvas.height;
    const px = lm => ({ x: lm.x * cw, y: lm.y * ch });

    if (showSkeleton) {
      this._drawConnections(landmarks, px);
    }
    if (showLandmarks) {
      this._drawJoints(landmarks, px);
    }
  }

  _drawConnections(landmarks, px) {
    const ctx = this._ctx;
    POSE_CONNECTIONS.forEach(([i, j]) => {
      const a = landmarks[i];
      const b = landmarks[j];
      if (!a || !b) return;
      // Only draw visible landmarks (visibility > 0.5)
      if ((a.visibility ?? 1) < 0.3 || (b.visibility ?? 1) < 0.3) return;

      const pa = px(a), pb = px(b);
      const color = getConnectionColor(i, j);

      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2.5;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 8;
      ctx.lineCap     = 'round';
      ctx.stroke();
      ctx.shadowBlur  = 0;
    });
  }

  _drawJoints(landmarks, px) {
    const ctx    = this._ctx;
    const pulse  = 0.6 + 0.4 * Math.sin(this._phase);

    landmarks.forEach((lm, i) => {
      if (!lm) return;
      if ((lm.visibility ?? 1) < 0.3) return;
      const p = px(lm);

      // Outer ring
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,212,255,${pulse * 0.6})`;
      ctx.lineWidth   = 1;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle   = '#00d4ff';
      ctx.shadowColor = 'rgba(0,212,255,0.8)';
      ctx.shadowBlur  = 10;
      ctx.fill();
      ctx.shadowBlur  = 0;
    });
  }
}

// ============================================================
// POSE DETECTOR ENGINE
// ============================================================
export class PoseDetector {
  constructor() {
    this._pose      = null;
    this._ready     = false;
    this._results   = null;
    this._prevDetected = false;
  }

  async init() {
    return new Promise((resolve) => {
      try {
        const pose = new window.Pose({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        pose.setOptions({
          modelComplexity:        1,
          smoothLandmarks:        true,
          enableSegmentation:     false,
          smoothSegmentation:     false,
          minDetectionConfidence: AppState.settings.confidence,
          minTrackingConfidence:  0.5
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
    if (!this._ready || !this._pose) return null;
    try {
      await this._pose.send({ image: videoElement });
    } catch (e) { /* skip */ }
    return this._results;
  }

  _onResults(results) {
    const lm = results.poseLandmarks;

    if (lm && lm.length > 0) {
      this._results = lm;
      AppState.poseDetected = true;

      if (!this._prevDetected) {
        EventBus.emit('pose:detected');
        this._prevDetected = true;
      }
    } else {
      this._results = null;
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
