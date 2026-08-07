/**
 * motion.js — Motion detection + hand movement trail lines
 * Uses pixel differencing to find moving regions, draws glowing lines
 * 100% browser-native, zero external libraries
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus, clamp } from './utils.js';

// ============================================================
// MOTION TRAIL RENDERER
// Draws glowing lines connecting motion hotspots
// ============================================================
export class MotionTrailRenderer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._trails = []; // array of { x, y, age, vx, vy }
    this._phase  = 0;
    this._MAX_TRAILS = 80;
  }

  /**
   * Add new motion points and draw trails
   * @param {Array} points - [{x, y, intensity}] motion hotspots
   */
  update(points) {
    this._phase = (this._phase + 0.05) % (Math.PI * 2);

    // Add new points as trail nodes
    points.forEach(p => {
      if (this._trails.length < this._MAX_TRAILS) {
        this._trails.push({
          x: p.x, y: p.y,
          age: 0,
          intensity: p.intensity || 1,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
        });
      }
    });

    // Age and draw trails
    this._draw();

    // Remove old trails
    this._trails = this._trails.filter(t => t.age < 30);
  }

  _draw() {
    const ctx    = this._ctx;
    const trails = this._trails;

    trails.forEach(t => {
      t.age++;
      t.x += t.vx * 0.3;
      t.y += t.vy * 0.3;
    });

    // Connect nearby trail points with glowing lines
    for (let i = 0; i < trails.length; i++) {
      for (let j = i + 1; j < trails.length; j++) {
        const a = trails[i], b = trails[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < 120) {
          const alpha = (1 - dist/120) * (1 - a.age/30) * (1 - b.age/30) * 0.8;
          const pulse = 0.6 + 0.4 * Math.sin(this._phase + i * 0.5);

          // Glow line
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(0,212,255,${alpha * pulse * 0.3})`;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.filter = 'blur(3px)';
          ctx.stroke();
          ctx.restore();

          // Sharp line
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(0,212,255,${alpha * pulse})`;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }

      // Draw trail node dot
      const t = trails[i];
      const dotAlpha = (1 - t.age/30) * 0.9;
      const pulse = 0.6 + 0.4 * Math.sin(this._phase + i * 0.3);

      ctx.beginPath();
      ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,212,255,${dotAlpha * pulse})`;
      ctx.shadowColor = 'rgba(0,212,255,0.8)';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  clear() {
    this._trails = [];
  }
}

// ============================================================
// MOTION DETECTOR
// Pixel differencing on downsampled canvas
// Returns motion hotspots for trail renderer
// ============================================================
export class MotionDetector {
  constructor() {
    this._offscreen = document.createElement('canvas');
    this._offscreen.width  = 160;
    this._offscreen.height = 120;
    this._ctx = this._offscreen.getContext('2d', { willReadFrequently: true });

    this._prev    = null;
    this._history = Array(30).fill(0);
    this._idx     = 0;
    this._prevMotion = false;

    this._threshold = 20; // pixel diff threshold
  }

  /**
   * Detect motion from video frame
   * Returns { detected, intensity, hotspots: [{x,y,intensity}] }
   */
  detect(video) {
    if (!video || video.videoWidth === 0) {
      return { detected: false, intensity: 0, hotspots: [] };
    }

    const ctx = this._ctx;
    const W   = this._offscreen.width;
    const H   = this._offscreen.height;

    ctx.drawImage(video, 0, 0, W, H);
    const curr = ctx.getImageData(0, 0, W, H);

    if (!this._prev) {
      this._prev = curr;
      return { detected: false, intensity: 0, hotspots: [] };
    }

    // Find motion cells (8x8 blocks)
    const blockSize = 8;
    const hotspots  = [];
    let totalDiff   = 0;
    const scaleX    = (video.videoWidth  || W) / W;
    const scaleY    = (video.videoHeight || H) / H;

    for (let by = 0; by < H; by += blockSize) {
      for (let bx = 0; bx < W; bx += blockSize) {
        let blockDiff = 0;
        const count = blockSize * blockSize;

        for (let dy = 0; dy < blockSize && by+dy < H; dy++) {
          for (let dx = 0; dx < blockSize && bx+dx < W; dx++) {
            const idx = ((by+dy)*W + (bx+dx)) * 4;
            const rD = Math.abs(curr.data[idx]   - this._prev.data[idx]);
            const gD = Math.abs(curr.data[idx+1] - this._prev.data[idx+1]);
            const bD = Math.abs(curr.data[idx+2] - this._prev.data[idx+2]);
            blockDiff += (rD + gD + bD) / 3;
          }
        }

        const avgDiff = blockDiff / count;
        if (avgDiff > this._threshold) {
          totalDiff++;
          // Map back to video canvas coords
          const cx = (bx + blockSize/2) * scaleX;
          const cy = (by + blockSize/2) * scaleY;
          hotspots.push({ x: cx, y: cy, intensity: avgDiff / 255 });
        }
      }
    }

    this._prev = curr;

    // Calculate intensity
    const totalBlocks = (W / blockSize) * (H / blockSize);
    const pct = (totalDiff / totalBlocks) * 100;
    const intensity = clamp(Math.round(pct * 4), 0, 100);

    // Rolling history
    this._history[this._idx] = intensity;
    this._idx = (this._idx + 1) % this._history.length;
    const avg = this._history.reduce((s,v) => s+v, 0) / this._history.length;
    const smoothed = Math.round(avg);
    const detected = smoothed > 5;

    if (detected && !this._prevMotion) {
      EventBus.emit('motion:detected', { intensity: smoothed });
      this._prevMotion = true;
    } else if (!detected && this._prevMotion) {
      EventBus.emit('motion:stopped');
      this._prevMotion = false;
    }

    AppState.motionDetected  = detected;
    AppState.motionIntensity = smoothed;

    return { detected, intensity: smoothed, hotspots };
  }

  getHistory() { return this._history; }

  reset() {
    this._prev    = null;
    this._history = Array(30).fill(0);
    this._idx     = 0;
    this._prevMotion = false;
  }
}
