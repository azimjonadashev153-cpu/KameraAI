/**
 * screenshot.js — Capture, preview, and download screenshots
 * Composites video + overlay canvas into a single image
 * AI Human Tracker · Infinity Intelligence
 */

import { $, fileTimestamp } from './utils.js';
import { Notifications }    from './notifications.js';
import { EventBus }         from './utils.js';

// ============================================================
// SCREENSHOT MANAGER
// ============================================================
export class ScreenshotManager {
  constructor() {
    this._previewCard = $('screenshot-card');
    this._previewImg  = $('screenshot-preview');
    this._downloadBtn = $('btn-download-screenshot');
    this._closeBtn    = $('btn-close-screenshot');
    this._lastDataUrl = null;
    this._lastFilename= '';

    this._bindButtons();
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────────────────

  /**
   * Capture the current frame: composites video + canvas overlays.
   * @param {HTMLVideoElement} video
   * @param {HTMLCanvasElement} overlayCanvas
   */
  capture(video, overlayCanvas) {
    if (!video || video.readyState < 2) {
      Notifications.warn('Screenshot', 'Camera is not ready');
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Temp composite canvas
    const composite = document.createElement('canvas');
    composite.width  = vw;
    composite.height = vh;
    const ctx = composite.getContext('2d');

    // Draw video frame (respect mirror setting)
    if (video.classList.contains('mirror')) {
      ctx.save();
      ctx.translate(vw, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, vw, vh);
    if (video.classList.contains('mirror')) ctx.restore();

    // Draw overlay canvas on top (AI detections)
    if (overlayCanvas && overlayCanvas.width > 0) {
      ctx.drawImage(overlayCanvas, 0, 0, vw, vh);
    }

    // Watermark
    this._addWatermark(ctx, vw, vh);

    // Export
    const dataUrl  = composite.toDataURL('image/png', 0.95);
    const filename = `ai-tracker_${fileTimestamp()}.png`;

    this._lastDataUrl  = dataUrl;
    this._lastFilename = filename;

    // Show preview
    this._showPreview(dataUrl);

    // Emit event
    EventBus.emit('screenshot:taken', { filename });
    Notifications.success('Screenshot Saved', filename);

    return dataUrl;
  }

  // ──────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────────────

  _addWatermark(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.font        = 'bold 13px Inter, sans-serif';
    ctx.fillStyle   = '#00d4ff';
    ctx.textAlign   = 'right';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = 6;
    const ts = new Date().toLocaleString();
    ctx.fillText(`AI Human Tracker · ${ts}`, w - 10, h - 10);
    ctx.restore();
  }

  _showPreview(dataUrl) {
    this._previewImg.src = dataUrl;
    this._previewCard.classList.remove('hidden');
    // Scroll preview into view smoothly
    this._previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  _hidePreview() {
    this._previewCard.classList.add('hidden');
    this._previewImg.src = '';
  }

  _download() {
    if (!this._lastDataUrl) return;
    const a = document.createElement('a');
    a.href     = this._lastDataUrl;
    a.download = this._lastFilename;
    a.click();
    Notifications.info('Download Started', this._lastFilename);
  }

  _bindButtons() {
    this._downloadBtn.addEventListener('click', () => this._download());
    this._closeBtn.addEventListener('click',    () => this._hidePreview());
  }
}
