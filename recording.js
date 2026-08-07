/**
 * recording.js — Video recording via MediaRecorder API
 * Records the webcam stream (with overlay canvas composited)
 * AI Human Tracker · Infinity Intelligence
 */

import { $, fileTimestamp, formatDuration, EventBus } from './utils.js';
import { Notifications } from './notifications.js';

// ============================================================
// RECORDING MANAGER
// ============================================================
export class RecordingManager {
  constructor() {
    this._mediaRecorder = null;
    this._chunks        = [];
    this._isRecording   = false;
    this._startTime     = null;
    this._timerInterval = null;

    // UI refs
    this._timerEl    = $('rec-timer');
    this._indicator  = $('rec-indicator');
    this._startBtn   = $('btn-start-rec');
    this._stopBtn    = $('btn-stop-rec');
    this._recBtnMain = $('btn-record');
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────────────────

  /**
   * Start recording.
   * Prefers a composited canvas stream (video + overlays);
   * falls back to raw camera stream.
   * @param {HTMLVideoElement}  video
   * @param {HTMLCanvasElement} overlayCanvas
   * @param {MediaStream}       cameraStream
   */
  start(video, overlayCanvas, cameraStream) {
    if (this._isRecording) return;
    if (!cameraStream) {
      Notifications.warn('Recording', 'Start the camera first');
      return;
    }

    let recordStream;

    try {
      // Try composited canvas stream (video + AI overlay)
      const compositeCanvas = this._buildCompositeCanvas(video, overlayCanvas);
      const canvasStream    = compositeCanvas.captureStream(30);

      // Merge with audio if available
      const audioTracks = cameraStream.getAudioTracks();
      const allTracks   = [...canvasStream.getTracks(), ...audioTracks];
      recordStream      = new MediaStream(allTracks);
    } catch (e) {
      // Fallback: raw camera stream
      recordStream = cameraStream;
    }

    // Preferred MIME types in order of support
    const mimes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    const mimeType = mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    this._chunks = [];
    this._mediaRecorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : {});

    this._mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) this._chunks.push(e.data);
    };

    this._mediaRecorder.onstop = () => this._save();
    this._mediaRecorder.onerror = err => {
      Notifications.error('Recording Error', err.message);
      this._stopUI();
    };

    this._mediaRecorder.start(100); // collect data every 100ms
    this._isRecording = true;
    this._startTime   = Date.now();

    this._startUI();
    EventBus.emit('recording:started');
    Notifications.success('Recording Started', 'Capturing video…');
  }

  /** Stop recording and trigger download */
  stop() {
    if (!this._isRecording || !this._mediaRecorder) return;
    this._mediaRecorder.stop();
    this._isRecording = false;
    this._stopUI();
    EventBus.emit('recording:stopped');
  }

  get isRecording() { return this._isRecording; }

  // ──────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────────────

  /** Build an offscreen canvas that composites video + overlay each frame */
  _buildCompositeCanvas(video, overlay) {
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');

    const drawFrame = () => {
      if (!this._isRecording) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Mirror-aware video drawing
      if (video.classList.contains('mirror')) {
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (video.classList.contains('mirror')) ctx.restore();

      // Overlay canvas
      if (overlay && overlay.width > 0) {
        ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
      }

      requestAnimationFrame(drawFrame);
    };

    drawFrame();
    return canvas;
  }

  _save() {
    if (this._chunks.length === 0) {
      Notifications.warn('Recording', 'No data was captured');
      return;
    }

    const mimeType = this._mediaRecorder?.mimeType || 'video/webm';
    const ext      = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob     = new Blob(this._chunks, { type: mimeType });
    const url      = URL.createObjectURL(blob);
    const filename = `ai-tracker_${fileTimestamp()}.${ext}`;

    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();

    // Clean up object URL after download
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    Notifications.success('Recording Saved', filename);
    EventBus.emit('recording:saved', { filename });
    this._chunks = [];
  }

  _startUI() {
    // Show timer
    this._timerEl.classList.remove('hidden');
    this._timerEl.textContent = '00:00';

    // Show recording indicator
    this._indicator.classList.remove('hidden');

    // Swap buttons
    this._startBtn.classList.add('hidden');
    this._stopBtn.classList.remove('hidden');

    // Main camera record button state
    this._recBtnMain.textContent = '';
    this._recBtnMain.innerHTML = '<span class="rec-btn-dot"></span> Stop';
    this._recBtnMain.classList.add('recording');

    // Start timer
    this._timerInterval = setInterval(() => {
      const secs = Math.floor((Date.now() - this._startTime) / 1000);
      this._timerEl.textContent = formatDuration(secs);
    }, 1000);
  }

  _stopUI() {
    clearInterval(this._timerInterval);
    this._timerEl.classList.add('hidden');
    this._indicator.classList.add('hidden');

    this._startBtn.classList.remove('hidden');
    this._stopBtn.classList.add('hidden');

    this._recBtnMain.innerHTML = '<span class="rec-btn-dot"></span> Record';
    this._recBtnMain.classList.remove('recording');
  }
}
