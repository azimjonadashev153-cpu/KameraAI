/**
 * motion.js — Motion detection via pixel difference on canvas
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus, clamp, mapRange } from './utils.js';

// ============================================================
// MOTION DETECTOR
// Uses temporal frame differencing on a downsampled canvas
// ============================================================
export class MotionDetector {
  constructor() {
    // Downsampled canvas for performance
    this._canvas   = document.createElement('canvas');
    this._ctx      = this._canvas.getContext('2d', { willReadFrequently: true });
    this._canvas.width  = 80;
    this._canvas.height = 60;

    this._prevFrame = null;
    this._history   = Array(30).fill(0);
    this._idx       = 0;

    this._threshold = 12;    // Pixel diff threshold
    this._prevMotion= false;
  }

  /**
   * Detect motion from a video frame.
   * Returns { detected: boolean, intensity: number (0-100) }
   */
  detect(video) {
    if (!video || video.videoWidth === 0) return { detected: false, intensity: 0 };

    const ctx = this._ctx;
    const cw  = this._canvas.width;
    const ch  = this._canvas.height;

    // Draw current frame to internal canvas
    ctx.drawImage(video, 0, 0, cw, ch);
    const curr = ctx.getImageData(0, 0, cw, ch);

    if (!this._prevFrame) {
      this._prevFrame = curr;
      return { detected: false, intensity: 0 };
    }

    // Compute pixel difference
    let totalDiff = 0;
    const len = curr.data.length;
    for (let i = 0; i < len; i += 4) {
      const rDiff = Math.abs(curr.data[i]     - this._prevFrame.data[i]);
      const gDiff = Math.abs(curr.data[i + 1] - this._prevFrame.data[i + 1]);
      const bDiff = Math.abs(curr.data[i + 2] - this._prevFrame.data[i + 2]);
      const avgDiff = (rDiff + gDiff + bDiff) / 3;
      if (avgDiff > this._threshold) totalDiff++;
    }

    this._prevFrame = curr;

    const pixels   = (cw * ch);
    const diffPct  = (totalDiff / pixels) * 100;
    const intensity= clamp(Math.round(diffPct * 3), 0, 100); // amplify a bit

    // Update rolling history
    this._history[this._idx] = intensity;
    this._idx = (this._idx + 1) % this._history.length;

    // Smooth intensity over history
    const avg      = this._history.reduce((sum, v) => sum + v, 0) / this._history.length;
    const smoothed = Math.round(avg);

    const detected = smoothed > 8;

    // State change events
    if (detected && !this._prevMotion) {
      EventBus.emit('motion:detected', { intensity: smoothed });
      this._prevMotion = true;
    } else if (!detected && this._prevMotion) {
      EventBus.emit('motion:stopped');
      this._prevMotion = false;
    }

    AppState.motionDetected  = detected;
    AppState.motionIntensity = smoothed;

    return { detected, intensity: smoothed };
  }

  getHistory() {
    return this._history;
  }

  reset() {
    this._prevFrame = null;
    this._history   = Array(30).fill(0);
    this._idx       = 0;
    this._prevMotion= false;
  }
}
