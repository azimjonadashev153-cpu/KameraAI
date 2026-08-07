/**
 * utils.js — Shared utility functions and event bus
 * AI Human Tracker · Infinity Intelligence
 */

// ============================================================
// EVENT BUS — lightweight pub/sub for module communication
// ============================================================
export const EventBus = {
  _listeners: {},

  /** Subscribe to an event */
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  },

  /** Unsubscribe from an event */
  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  },

  /** Publish an event with optional payload */
  emit(event, payload) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error(`EventBus error [${event}]:`, e); }
    });
  }
};

// ============================================================
// APP STATE — central reactive state store
// ============================================================
export const AppState = {
  cameraActive: false,
  aiReady: false,
  mirrored: true,
  zoom: 1,
  faceCount: 0,
  handCount: 0,
  motionDetected: false,
  motionIntensity: 0,
  poseDetected: false,
  recording: false,
  fps: 0,
  settings: {
    faceDetection: true,
    poseDetection: true,
    handTracking: true,
    motionDetection: true,
    boundingBoxes: true,
    landmarks: true,
    skeleton: true,
    notifications: true,
    darkTheme: true,
    mirror: true,
    showFps: true,
    confidence: 0.5
  }
};

// ============================================================
// DOM HELPERS
// ============================================================

/** Get element by ID (throws if missing in dev) */
export const $ = id => document.getElementById(id);

/** Query selector */
export const $q = sel => document.querySelector(sel);

/** Create element with optional attrs and children */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  children.forEach(c => {
    if (typeof c === 'string') node.insertAdjacentHTML('beforeend', c);
    else if (c instanceof Node) node.appendChild(c);
  });
  return node;
}

// ============================================================
// TIME & FORMATTING
// ============================================================

/** Format timestamp as HH:MM:SS */
export function formatTime(date = new Date()) {
  return date.toLocaleTimeString('en-US', { hour12: false });
}

/** Format date as "Mon, 01 Jan 2025" */
export function formatDate(date = new Date()) {
  return date.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format seconds as MM:SS */
export function formatDuration(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

/** Generate filename-safe timestamp  e.g. "2025-01-06_14-30-22" */
export function fileTimestamp() {
  const d = new Date();
  const date = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-');
  const time = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join('-');
  return `${date}_${time}`;
}

// ============================================================
// MATH HELPERS
// ============================================================

/** Clamp a value between min and max */
export const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

/** Linear interpolation */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Distance between two points */
export const dist = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);

/** Map a value from one range to another */
export const mapRange = (val, inMin, inMax, outMin, outMax) =>
  ((val - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;

/** Round to N decimal places */
export const round = (val, places = 2) => Math.round(val * 10 ** places) / 10 ** places;

// ============================================================
// CANVAS HELPERS
// ============================================================

/**
 * Resize canvas to match its display size and the video dimensions.
 * Returns true if a resize was performed.
 */
export function syncCanvasToVideo(canvas, video) {
  const w = video.videoWidth  || video.clientWidth;
  const h = video.videoHeight || video.clientHeight;
  if (!w || !h) return false;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
    return true;
  }
  return false;
}

/**
 * Draw a rounded rectangle path on a 2D context.
 */
export function roundRect(ctx, x, y, w, h, r = 6) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Draw text with a pill background — used for bounding box labels.
 */
export function drawLabel(ctx, text, x, y, bgColor = 'rgba(0,212,255,0.8)', textColor = '#fff') {
  ctx.save();
  ctx.font = 'bold 11px JetBrains Mono, monospace';
  const metrics = ctx.measureText(text);
  const pw = metrics.width + 10;
  const ph = 18;
  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y - ph, pw, ph, 4);
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.fillText(text, x + 5, y - 5);
  ctx.restore();
}

// ============================================================
// FPS TRACKER
// ============================================================
export class FPSTracker {
  constructor(sampleSize = 30) {
    this._times = [];
    this._sampleSize = sampleSize;
    this.fps = 0;
  }

  tick() {
    const now = performance.now();
    this._times.push(now);
    if (this._times.length > this._sampleSize) this._times.shift();
    if (this._times.length >= 2) {
      const elapsed = (this._times[this._times.length - 1] - this._times[0]) / 1000;
      this.fps = Math.round((this._times.length - 1) / elapsed);
    }
    return this.fps;
  }
}

// ============================================================
// ESTIMATED CPU USAGE (heuristic via long task timing)
// ============================================================
export class CPUMonitor {
  constructor() {
    this._estimate = 0;
    this._last = performance.now();
    this._interval = setInterval(() => this._sample(), 1000);
  }

  _sample() {
    const now = performance.now();
    const elapsed = now - this._last;
    this._last = now;
    // If the frame took significantly longer than 1s, we're busy
    const overrun = Math.max(0, elapsed - 1000);
    this._estimate = clamp(Math.round((overrun / 100) * 10), 0, 99);
  }

  get usage() { return this._estimate; }

  destroy() { clearInterval(this._interval); }
}

// ============================================================
// BROWSER DETECTION
// ============================================================
export function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/'))    return 'Edge';
  if (ua.includes('OPR/'))    return 'Opera';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/'))return 'Firefox';
  if (ua.includes('Safari/')) return 'Safari';
  return 'Browser';
}

// ============================================================
// DEBOUNCE / THROTTLE
// ============================================================
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function throttle(fn, limit) {
  let last = 0;
  return (...args) => {
    const now = performance.now();
    if (now - last >= limit) { last = now; fn(...args); }
  };
}

// ============================================================
// ANIMATED BACKGROUND CANVAS (particles + grid)
// ============================================================
export class BackgroundRenderer {
  constructor(canvasId) {
    this._canvas = document.getElementById(canvasId);
    this._ctx = this._canvas.getContext('2d');
    this._particles = [];
    this._raf = null;
    this._resize();
    this._init();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this._canvas.width  = window.innerWidth;
    this._canvas.height = window.innerHeight;
    this._init();
  }

  _init() {
    this._particles = Array.from({ length: 60 }, () => this._newParticle());
  }

  _newParticle() {
    return {
      x: Math.random() * this._canvas.width,
      y: Math.random() * this._canvas.height,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1
    };
  }

  _drawGrid(ctx, w, h) {
    const step = 60;
    ctx.strokeStyle = 'rgba(0,212,255,0.04)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x < w; x += step) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += step) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();
  }

  _draw() {
    const { _ctx: ctx, _canvas: c, _particles: pts } = this;
    ctx.clearRect(0, 0, c.width, c.height);

    // Grid
    this._drawGrid(ctx, c.width, c.height);

    // Particles
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > c.width)  p.vx *= -1;
      if (p.y < 0 || p.y > c.height) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,212,255,${p.alpha})`;
      ctx.fill();
    });

    // Connect nearby particles with lines
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = dist(pts[i], pts[j]);
        if (d < 120) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(0,212,255,${0.12 * (1 - d / 120)})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    this._raf = requestAnimationFrame(() => this._draw());
  }

  start() { this._draw(); }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}
