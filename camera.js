/**
 * camera.js — Webcam management: open, close, switch, mirror, zoom
 * AI Human Tracker · Infinity Intelligence
 */

import { $, AppState, EventBus } from './utils.js';
import { Notifications } from './notifications.js';

// ============================================================
// CAMERA MANAGER
// ============================================================
export class CameraManager {
  constructor() {
    this._video       = $('webcam');
    this._wrapper     = $('video-wrapper');
    this._camSelect   = $('cam-select');
    this._stream      = null;
    this._devices     = [];
    this._currentIdx  = 0;
    this._zoom        = 1;
    this._mirrored    = true;

    this._bindButtons();
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────────────────

  /** Enumerate cameras and populate the select dropdown */
  async enumerateCameras() {
    try {
      // Need a permission grant first to get labels
      const devices = await navigator.mediaDevices.enumerateDevices();
      this._devices = devices.filter(d => d.kind === 'videoinput');
      this._populateSelect();
    } catch (err) {
      console.warn('Camera enumeration failed:', err);
    }
  }

  /** Start the webcam stream */
  async start(deviceId = null) {
    try {
      // Stop any existing stream
      if (this._stream) this.stop();

      const constraints = {
        video: {
          width:  { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
          ...(deviceId ? { deviceId: { exact: deviceId } } : {})
        },
        audio: false
      };

      this._stream = await navigator.mediaDevices.getUserMedia(constraints);
      this._video.srcObject = this._stream;

      await new Promise(resolve => {
        this._video.onloadedmetadata = () => { this._video.play(); resolve(); };
      });

      // After getting permission, enumerate to get labels
      await this.enumerateCameras();

      // Apply mirror
      this.setMirror(AppState.settings.mirror);

      AppState.cameraActive = true;
      EventBus.emit('camera:started', { stream: this._stream });
      Notifications.success('Camera Connected', 'Webcam stream is live');

      return true;
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access.'
        : `Camera error: ${err.message}`;
      Notifications.error('Camera Failed', msg);
      EventBus.emit('camera:error', { error: err });
      return false;
    }
  }

  /** Stop the current stream */
  stop() {
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    this._video.srcObject = null;
    AppState.cameraActive = false;
    EventBus.emit('camera:stopped');
  }

  /** Switch to the next available camera */
  async switchCamera() {
    if (this._devices.length <= 1) {
      Notifications.warn('Switch Camera', 'No additional cameras found');
      return;
    }
    this._currentIdx = (this._currentIdx + 1) % this._devices.length;
    const dev = this._devices[this._currentIdx];
    this._camSelect.value = dev.deviceId;
    await this.start(dev.deviceId);
    Notifications.info('Camera Switched', dev.label || `Camera ${this._currentIdx + 1}`);
  }

  /** Toggle mirror mode */
  setMirror(val) {
    this._mirrored = val;
    AppState.mirrored = val;
    this._video.classList.toggle('mirror', val);
    EventBus.emit('camera:mirror', { mirrored: val });
  }

  toggleMirror() { this.setMirror(!this._mirrored); }

  /** Zoom in/out (CSS transform on video) */
  setZoom(val) {
    this._zoom = Math.max(1, Math.min(3, val));
    AppState.zoom = this._zoom;
    this._video.style.transform = this._mirrored
      ? `scaleX(-1) scale(${this._zoom})`
      : `scale(${this._zoom})`;
  }

  zoomIn()  { this.setZoom(this._zoom + 0.2); }
  zoomOut() { this.setZoom(this._zoom - 0.2); }

  /** Toggle fullscreen for the video wrapper */
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this._wrapper.requestFullscreen().catch(err =>
        Notifications.warn('Fullscreen', err.message)
      );
    } else {
      document.exitFullscreen();
    }
  }

  get video() { return this._video; }
  get stream() { return this._stream; }
  get isActive() { return !!this._stream; }

  // ──────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────────────

  _populateSelect() {
    const sel = this._camSelect;
    sel.innerHTML = '';
    if (this._devices.length === 0) {
      sel.innerHTML = '<option>No cameras</option>';
      return;
    }
    this._devices.forEach((dev, i) => {
      const opt = document.createElement('option');
      opt.value = dev.deviceId;
      opt.textContent = dev.label || `Camera ${i + 1}`;
      if (i === this._currentIdx) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  _bindButtons() {
    // Camera select dropdown
    this._camSelect.addEventListener('change', async () => {
      const deviceId = this._camSelect.value;
      const idx = this._devices.findIndex(d => d.deviceId === deviceId);
      if (idx !== -1) this._currentIdx = idx;
      if (AppState.cameraActive) await this.start(deviceId);
    });
  }
}
