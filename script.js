/**
 * script.js — Main application entry point
 * AI Human Tracker · Infinity Intelligence
 * Coordinates all modules, UI bindings, event log, and state sync
 */

import {
  $, AppState, EventBus,
  formatTime, formatDate, detectBrowser,
  BackgroundRenderer, CPUMonitor, debounce
} from './utils.js';
import { Notifications }          from './notifications.js';
import { CameraManager }          from './camera.js';
import { DetectorOrchestrator }   from './detector.js';
import { ScreenshotManager }      from './screenshot.js';
import { RecordingManager }       from './recording.js';

// ============================================================
// EVENT LOGGER — scrolling event feed
// ============================================================
export class Logger {
  constructor(containerId) {
    this._container = $(containerId);
    this._maxLogs   = 100;
  }

  log(msg, type = 'info') {
    const time  = formatTime();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `
      <span class="log-time mono">${time}</span>
      <span class="log-msg">${this._escape(msg)}</span>
    `;
    this._container.appendChild(entry);

    // Auto-scroll to bottom
    this._container.scrollTop = this._container.scrollHeight;

    // Limit size
    while (this._container.children.length > this._maxLogs) {
      this._container.firstChild.remove();
    }
  }

  clear() {
    this._container.innerHTML = '';
    this.log('Log cleared');
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

// ============================================================
// UI UPDATER — syncs AppState to DOM elements
// ============================================================
class UIUpdater {
  constructor() {
    this._elements = {
      // Status cards
      statCamera: $('stat-camera'),
      statAI:     $('stat-ai'),
      statFaces:  $('stat-faces'),
      statMotion: $('stat-motion'),
      statPose:   $('stat-pose'),
      statHands:  $('stat-hands'),

      badgeCamera: $('badge-camera'),
      badgeAI:     $('badge-ai'),
      badgeFaces:  $('badge-faces'),
      badgeMotion: $('badge-motion'),
      badgePose:   $('badge-pose'),
      badgeHands:  $('badge-hands'),

      // Info chips
      infoFps:     $('info-fps'),
      infoCpu:     $('info-cpu'),
      infoRes:     $('info-res'),
      infoBrowser: $('info-browser'),

      // Face analysis
      faceAnalysisContent: $('face-analysis-content'),

      // Hand status
      handLeft:       $('hand-left'),
      handRight:      $('hand-right'),
      handLeftState:  $('hand-left-state'),
      handRightState: $('hand-right-state'),

      // Motion
      motionIndicator: $('motion-indicator'),
      motionLabel:     $('motion-label'),
      intensityBar:    $('intensity-bar'),
      intensityVal:    $('intensity-val'),
      motionHistory:   $('motion-history'),

      // FPS counter
      fpsCounter: $('fps-counter'),

      // System status
      systemStatus: $('system-status'),
      statusDot:    $('status-dot'),
      statusText:   $('status-text')
    };

    this._prevState = { ...AppState };
    this._updateLoop();
  }

  /** Check for state changes and update UI reactively */
  _updateLoop() {
    // Camera
    if (AppState.cameraActive !== this._prevState.cameraActive) {
      this._elements.statCamera.textContent = AppState.cameraActive ? 'Active' : 'Offline';
      this._elements.badgeCamera.textContent = AppState.cameraActive ? 'ON' : 'OFF';
      this._elements.badgeCamera.className = AppState.cameraActive ? 'stat-badge on' : 'stat-badge off';
    }

    // AI
    if (AppState.aiReady !== this._prevState.aiReady) {
      this._elements.statAI.textContent = AppState.aiReady ? 'Ready' : 'Loading…';
      this._elements.badgeAI.textContent = AppState.aiReady ? 'ON' : '...';
      this._elements.badgeAI.className = AppState.aiReady ? 'stat-badge on' : 'stat-badge';
    }

    // Faces
    if (AppState.faceCount !== this._prevState.faceCount) {
      this._elements.statFaces.textContent = AppState.faceCount;
      this._elements.badgeFaces.textContent = AppState.faceCount > 0 ? 'LIVE' : '—';
      this._elements.badgeFaces.className = AppState.faceCount > 0 ? 'stat-badge on' : 'stat-badge';
    }

    // Motion
    if (AppState.motionDetected !== this._prevState.motionDetected || AppState.motionIntensity !== this._prevState.motionIntensity) {
      this._elements.statMotion.textContent = AppState.motionDetected ? `${AppState.motionIntensity}%` : 'No Motion';
      this._elements.badgeMotion.textContent = AppState.motionDetected ? 'ACTIVE' : '—';
      this._elements.badgeMotion.className = AppState.motionDetected ? 'stat-badge warn' : 'stat-badge';

      this._elements.motionIndicator.classList.toggle('active', AppState.motionDetected);
      this._elements.motionLabel.textContent = AppState.motionDetected ? 'Motion Detected' : 'No Motion';
      this._elements.intensityBar.style.width = `${AppState.motionIntensity}%`;
      this._elements.intensityVal.textContent = `${AppState.motionIntensity}%`;
    }

    // Pose
    if (AppState.poseDetected !== this._prevState.poseDetected) {
      this._elements.statPose.textContent = AppState.poseDetected ? 'Detected' : 'None';
      this._elements.badgePose.textContent = AppState.poseDetected ? 'ON' : '—';
      this._elements.badgePose.className = AppState.poseDetected ? 'stat-badge on' : 'stat-badge';
    }

    // Hands
    if (AppState.handCount !== this._prevState.handCount) {
      this._elements.statHands.textContent = AppState.handCount;
      this._elements.badgeHands.textContent = AppState.handCount > 0 ? 'LIVE' : '—';
      this._elements.badgeHands.className = AppState.handCount > 0 ? 'stat-badge on' : 'stat-badge';
    }

    // FPS
    if (AppState.fps !== this._prevState.fps) {
      this._elements.infoFps.textContent = AppState.fps || '—';
      if (AppState.settings.showFps) {
        this._elements.fpsCounter.textContent = `${AppState.fps || 0} FPS`;
        this._elements.fpsCounter.classList.add('visible');
      } else {
        this._elements.fpsCounter.classList.remove('visible');
      }
    }

    this._prevState = { ...AppState };
    requestAnimationFrame(() => this._updateLoop());
  }

  /** Update system info (called once or when changed) */
  updateSystemInfo(res, cpu, browser) {
    if (res) this._elements.infoRes.textContent = res;
    if (cpu !== undefined) this._elements.infoCpu.textContent = `${cpu}%`;
    if (browser) this._elements.infoBrowser.textContent = browser;
  }

  /** Set system status pill */
  setStatus(text, state = 'active') {
    this._elements.statusText.textContent = text;
    this._elements.statusDot.className = `status-dot ${state}`;
  }
}

// ============================================================
// MAIN APPLICATION CLASS
// ============================================================
class App {
  constructor() {
    this.camera     = new CameraManager();
    this.detector   = new DetectorOrchestrator();
    this.screenshot = new ScreenshotManager();
    this.recording  = new RecordingManager();
    this.logger     = new Logger('log-body');
    this.uiUpdater  = new UIUpdater();
    this.cpuMonitor = new CPUMonitor();
    this.bgRenderer = new BackgroundRenderer('bg-canvas');

    this._bindButtons();
    this._bindSettings();
    this._bindEvents();
    this._setupClock();
    this._initSystemInfo();

    this.logger.log('System initialized. Waiting for camera…', 'info');
    this.uiUpdater.setStatus('Initializing…', '');

    // Start background animation
    this.bgRenderer.start();
  }

  // ──────────────────────────────────────────────────────────
  // INITIALIZATION
  // ──────────────────────────────────────────────────────────

  async init() {
    this.logger.log('Loading AI models…', 'info');
    this.uiUpdater.setStatus('Loading AI…', '');
    $('footer-model-status').textContent = 'Model: Loading…';

    const success = await this.detector.init();

    if (success) {
      this.logger.log('All AI models ready', 'success');
      $('footer-model-status').textContent = 'Model: MediaPipe Ready';
    } else {
      this.logger.log('Some AI models failed to load', 'warn');
      $('footer-model-status').textContent = 'Model: Partial';
    }

    this.uiUpdater.setStatus('Ready — Start Camera', '');
    this._enableButtons();
  }

  // ──────────────────────────────────────────────────────────
  // BUTTON BINDINGS
  // ──────────────────────────────────────────────────────────

  _bindButtons() {
    // Start camera
    $('btn-start-camera').addEventListener('click', () => this._startCamera());

    // Stop camera
    $('btn-stop-camera').addEventListener('click', () => this._stopCamera());

    // Switch camera
    $('btn-switch-cam').addEventListener('click', () => this.camera.switchCamera());

    // Mirror
    $('btn-mirror').addEventListener('click', () => {
      this.camera.toggleMirror();
      this.logger.log(`Mirror: ${AppState.mirrored ? 'ON' : 'OFF'}`, 'info');
    });

    // Zoom
    $('btn-zoom-in').addEventListener('click', () => this.camera.zoomIn());
    $('btn-zoom-out').addEventListener('click', () => this.camera.zoomOut());

    // Camera fullscreen
    $('btn-cam-fullscreen').addEventListener('click', () => this.camera.toggleFullscreen());

    // App fullscreen
    $('btn-fullscreen').addEventListener('click', () => this._toggleFullscreen());

    // Screenshot
    $('btn-screenshot').addEventListener('click', () => {
      this.screenshot.capture(this.camera.video, this.detector.canvas);
      this.logger.log('Screenshot captured', 'success');
    });

    // Recording
    $('btn-record').addEventListener('click', () => this._toggleRecording());
    $('btn-start-rec').addEventListener('click', () => this._toggleRecording());
    $('btn-stop-rec').addEventListener('click', () => this._toggleRecording());

    // Settings
    $('btn-settings').addEventListener('click', () => this._openSettings());
    $('close-settings').addEventListener('click', () => this._closeSettings());
    $('settings-overlay').addEventListener('click', () => this._closeSettings());

    // Clear log
    $('btn-clear-log').addEventListener('click', () => this.logger.clear());

    // ── SKELETON MODE BUTTONS ──
    ['none', 'hands', 'full'].forEach(mode => {
      $(`mode-${mode}`).addEventListener('click', () => this._setSkeletonMode(mode));
    });

    // ── PERSON COUNT BUTTONS ──
    [1, 2, 3].forEach(n => {
      $(`count-${n}`).addEventListener('click', () => this._setPersonCount(n));
    });
    $('count-all').addEventListener('click', () => this._setPersonCount(Infinity));
  }

  _enableButtons() {
    // Enable camera-dependent buttons after AI ready
  }

  // ──────────────────────────────────────────────────────────
  // SETTINGS BINDINGS
  // ──────────────────────────────────────────────────────────

  _bindSettings() {
    // Detection toggles
    $('toggle-face').addEventListener('change', e => {
      AppState.settings.faceDetection = e.target.checked;
      this.logger.log(`Face Detection: ${e.target.checked ? 'ON' : 'OFF'}`, 'info');
    });

    $('toggle-pose').addEventListener('change', e => {
      AppState.settings.poseDetection = e.target.checked;
      this.logger.log(`Pose Detection: ${e.target.checked ? 'ON' : 'OFF'}`, 'info');
    });

    $('toggle-hands').addEventListener('change', e => {
      AppState.settings.handTracking = e.target.checked;
      this.logger.log(`Hand Tracking: ${e.target.checked ? 'ON' : 'OFF'}`, 'info');
    });

    $('toggle-motion').addEventListener('change', e => {
      AppState.settings.motionDetection = e.target.checked;
      this.logger.log(`Motion Detection: ${e.target.checked ? 'ON' : 'OFF'}`, 'info');
    });

    // Overlay toggles
    $('toggle-bbox').addEventListener('change', e => {
      AppState.settings.boundingBoxes = e.target.checked;
    });

    $('toggle-landmarks').addEventListener('change', e => {
      AppState.settings.landmarks = e.target.checked;
    });

    $('toggle-skeleton').addEventListener('change', e => {
      AppState.settings.skeleton = e.target.checked;
    });

    $('toggle-fps').addEventListener('change', e => {
      AppState.settings.showFps = e.target.checked;
    });

    // Camera toggles
    $('toggle-mirror').addEventListener('change', e => {
      AppState.settings.mirror = e.target.checked;
      this.camera.setMirror(e.target.checked);
    });

    $('toggle-notify').addEventListener('change', e => {
      AppState.settings.notifications = e.target.checked;
      Notifications.setEnabled(e.target.checked);
      this.logger.log(`Notifications: ${e.target.checked ? 'ON' : 'OFF'}`, 'info');
    });

    $('toggle-theme').addEventListener('change', e => {
      AppState.settings.darkTheme = e.target.checked;
      document.body.classList.toggle('dark-theme', e.target.checked);
      document.body.classList.toggle('light-theme', !e.target.checked);
      this.logger.log(`Theme: ${e.target.checked ? 'Dark' : 'Light'}`, 'info');
    });

    // Confidence slider
    const slider = $('confidence-slider');
    const valEl  = $('confidence-val');
    slider.addEventListener('input', debounce(e => {
      const val = parseFloat(e.target.value);
      AppState.settings.confidence = val;
      valEl.textContent = val.toFixed(2);
      EventBus.emit('settings:confidence', { value: val });
    }, 300));
  }

  // ──────────────────────────────────────────────────────────
  // EVENT LISTENERS
  // ──────────────────────────────────────────────────────────

  _bindEvents() {
    // Camera events
    EventBus.on('camera:started', () => {
      this.logger.log('Camera started successfully', 'success');
      this.uiUpdater.setStatus('Camera Active', 'active');
      $('btn-stop-camera').disabled = false;
      $('btn-screenshot').disabled = false;
      $('btn-record').disabled = false;
      $('btn-start-rec').disabled = false;
      $('start-overlay').classList.add('hidden');

      // Start detector
      this.detector.start();
      this.logger.log('AI detection loop started', 'success');

      // Update resolution info
      const v = this.camera.video;
      const res = `${v.videoWidth}×${v.videoHeight}`;
      this.uiUpdater.updateSystemInfo(res, undefined, undefined);
    });

    EventBus.on('camera:stopped', () => {
      this.logger.log('Camera stopped', 'info');
      this.uiUpdater.setStatus('Camera Offline', 'error');
      $('btn-stop-camera').disabled = true;
      $('btn-screenshot').disabled = true;
      $('btn-record').disabled = true;
      $('btn-start-rec').disabled = true;
      this.detector.stop();
      $('start-overlay').classList.remove('hidden');
    });

    EventBus.on('camera:error', ({ error }) => {
      this.logger.log(`Camera error: ${error.message}`, 'error');
    });

    // Face events
    EventBus.on('face:detected', ({ count }) => {
      this.logger.log(`Face detected (${count})`, 'detect');
      if (AppState.settings.notifications) Notifications.success('Face Detected', `${count} face(s) in frame`);
    });

    EventBus.on('face:lost', () => {
      this.logger.log('Face lost', 'info');
      this._clearFaceAnalysis();
    });

    EventBus.on('face:count', () => {
      this._updateFaceAnalysis();
    });

    // Pose events
    EventBus.on('pose:detected', () => {
      this.logger.log('Full body pose detected', 'detect');
    });

    EventBus.on('pose:lost', () => {
      this.logger.log('Body pose lost', 'info');
    });

    // Hand events
    EventBus.on('hands:update', ({ count, hands }) => {
      this.logger.log(`Hands detected: ${count}`, 'detect');
      this._updateHandStatus(hands);
    });

    // Motion events
    EventBus.on('motion:detected', ({ intensity }) => {
      this.logger.log(`Motion detected (${intensity}%)`, 'detect');
      this._updateMotionHistory();
    });

    EventBus.on('motion:stopped', () => {
      this.logger.log('Motion stopped', 'info');
    });

    // FPS updates
    EventBus.on('fps:update', ({ fps }) => {
      // Updated via UIUpdater
    });

    // AI events
    EventBus.on('ai:loading', () => {
      this.logger.log('Loading AI models from CDN…', 'info');
    });

    EventBus.on('ai:ready', () => {
      this.logger.log('All AI models ready', 'success');
    });

    EventBus.on('ai:partial', ({ failed }) => {
      this.logger.log(`AI models partially loaded. Failed: ${failed.join(', ')}`, 'warn');
    });

    // Recording events
    EventBus.on('recording:started', () => {
      this.logger.log('Recording started', 'success');
    });

    EventBus.on('recording:stopped', () => {
      this.logger.log('Recording stopped', 'info');
    });

    EventBus.on('recording:saved', ({ filename }) => {
      this.logger.log(`Recording saved: ${filename}`, 'success');
    });

    // Screenshot events
    EventBus.on('screenshot:taken', ({ filename }) => {
      this.logger.log(`Screenshot: ${filename}`, 'success');
    });
  }

  // ──────────────────────────────────────────────────────────
  // CAMERA ACTIONS
  // ──────────────────────────────────────────────────────────

  async _startCamera() {
    const success = await this.camera.start();
    if (success && AppState.aiReady) {
      // Camera started event will trigger detector
    }
  }

  _stopCamera() {
    this.camera.stop();
    if (this.recording.isRecording) {
      this.recording.stop();
    }
  }

  // ──────────────────────────────────────────────────────────
  // SKELETON MODE
  // ──────────────────────────────────────────────────────────

  _setSkeletonMode(mode) {
    this.detector.skeletonMode = mode;

    // Update button active states
    ['none', 'hands', 'full'].forEach(m => {
      $(`mode-${m}`).classList.toggle('active', m === mode);
    });

    // Update chip on video
    const chip = $('mode-chip');
    const labels = { none: null, hands: '✋ Hands', full: '⬟ Full Body' };
    if (mode === 'none') {
      chip.classList.add('hidden');
    } else {
      chip.classList.remove('hidden');
      chip.textContent = labels[mode];
      chip.className = `mode-chip mode-${mode}`;
    }

    AppState.settings.skeleton = (mode !== 'none');
    AppState.settings.poseDetection = (mode !== 'none');
    this.logger.log(`Skeleton mode: ${mode}`, 'info');
  }

  // ──────────────────────────────────────────────────────────
  // PERSON COUNT
  // ──────────────────────────────────────────────────────────

  _setPersonCount(n) {
    this.detector.maxPersons = n;

    // Update button active states
    [1, 2, 3].forEach(i => {
      $(`count-${i}`).classList.toggle('active', n === i);
    });
    $('count-all').classList.toggle('active', n === Infinity);

    // Update label
    const label = n === Infinity ? 'persons (all)' : n === 1 ? 'person' : 'persons';
    $('person-track-label').textContent = label;

    const display = n === Infinity ? 'All' : n;
    this.logger.log(`Tracking: ${display} ${label}`, 'info');
  }

  // ──────────────────────────────────────────────────────────

  _toggleRecording() {
    if (this.recording.isRecording) {
      this.recording.stop();
    } else {
      this.recording.start(this.camera.video, this.detector.canvas, this.camera.stream);
    }
  }

  // ──────────────────────────────────────────────────────────
  // SETTINGS PANEL
  // ──────────────────────────────────────────────────────────

  _openSettings() {
    $('settings-panel').classList.add('open');
    $('settings-overlay').classList.remove('hidden');
  }

  _closeSettings() {
    $('settings-panel').classList.remove('open');
    $('settings-overlay').classList.add('hidden');
  }

  // ──────────────────────────────────────────────────────────
  // FULLSCREEN
  // ──────────────────────────────────────────────────────────

  _toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err =>
        this.logger.log(`Fullscreen error: ${err.message}`, 'error')
      );
    } else {
      document.exitFullscreen();
    }
  }

  // ──────────────────────────────────────────────────────────
  // DYNAMIC UI UPDATES
  // ──────────────────────────────────────────────────────────

  _updateFaceAnalysis() {
    const container = $('face-analysis-content');
    const noData    = $('face-no-data');
    const faces     = this.detector.faceResults;

    if (faces.length === 0) {
      noData.classList.remove('hidden');
      Array.from(container.querySelectorAll('.face-entry')).forEach(el => el.remove());
      return;
    }

    noData.classList.add('hidden');

    // Remove old entries
    Array.from(container.querySelectorAll('.face-entry')).forEach(el => el.remove());

    // Add new entries
    faces.forEach(face => {
      const entry = document.createElement('div');
      entry.className = 'face-entry';
      const arrow = face.direction.includes('Left') ? '←'
                  : face.direction.includes('Right') ? '→'
                  : face.direction.includes('Up') ? '↑'
                  : face.direction.includes('Down') ? '↓' : '⊙';
      entry.innerHTML = `
        <div class="face-entry-header">
          <span class="face-id">FACE ${face.id}</span>
          <span class="face-confidence">${Math.round(face.confidence * 100)}%</span>
        </div>
        <div class="face-props">
          <div class="face-prop"><span class="face-prop-key">Center:</span> <span class="face-prop-val">${face.center.x},${face.center.y}</span></div>
          <div class="face-prop"><span class="face-prop-key">Size:</span> <span class="face-prop-val">${face.size.w}×${face.size.h}</span></div>
          <div class="face-prop"><span class="face-prop-key">Direction:</span> <span class="direction-badge">${arrow} ${face.direction}</span></div>
          <div class="face-prop"><span class="face-prop-key">Status:</span> <span class="face-prop-val">Tracking</span></div>
        </div>
      `;
      container.appendChild(entry);
    });
  }

  _clearFaceAnalysis() {
    const container = $('face-analysis-content');
    const noData    = $('face-no-data');
    noData.classList.remove('hidden');
    Array.from(container.querySelectorAll('.face-entry')).forEach(el => el.remove());
  }

  _updateHandStatus(hands) {
    const leftEl  = $('hand-left');
    const rightEl = $('hand-right');
    const leftState  = $('hand-left-state');
    const rightState = $('hand-right-state');

    const leftHand  = hands.find(h => h.handedness === 'Left');
    const rightHand = hands.find(h => h.handedness === 'Right');

    if (leftHand) {
      leftEl.classList.add('active');
      leftState.textContent = leftHand.gesture || 'Detected';
    } else {
      leftEl.classList.remove('active');
      leftState.textContent = 'Not Detected';
    }

    if (rightHand) {
      rightEl.classList.add('active');
      rightState.textContent = rightHand.gesture || 'Detected';
    } else {
      rightEl.classList.remove('active');
      rightState.textContent = 'Not Detected';
    }
  }

  _updateMotionHistory() {
    const historyEl = $('motion-history');
    const history   = this.detector.motionHistory;

    historyEl.innerHTML = '';
    history.forEach(val => {
      const bar = document.createElement('div');
      bar.className = 'motion-bar';
      const h = Math.min(100, val);
      bar.style.height = `${Math.max(4, h)}%`;
      if (h > 50)      bar.classList.add('high');
      else if (h > 20) bar.classList.add('med');
      historyEl.appendChild(bar);
    });
  }

  // ──────────────────────────────────────────────────────────
  // CLOCK & SYSTEM INFO
  // ──────────────────────────────────────────────────────────

  _setupClock() {
    const updateClock = () => {
      $('live-clock').textContent = formatTime();
      $('live-date').textContent  = formatDate();
    };
    updateClock();
    setInterval(updateClock, 1000);
  }

  _initSystemInfo() {
    const browser = detectBrowser();
    this.uiUpdater.updateSystemInfo('—', 0, browser);

    // CPU monitor
    setInterval(() => {
      this.uiUpdater.updateSystemInfo(undefined, this.cpuMonitor.usage, undefined);
    }, 2000);
  }
}

// ============================================================
// APPLICATION ENTRY POINT
// ============================================================
const app = new App();
app.init();
