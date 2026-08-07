/**
 * notifications.js — Beautiful toast notification system
 * AI Human Tracker · Infinity Intelligence
 */

import { $ } from './utils.js';

// ============================================================
// NOTIFICATION TYPES
// ============================================================
export const NotifType = {
  SUCCESS: 'success',
  INFO:    'info',
  WARN:    'warn',
  ERROR:   'error'
};

// Icon map per type
const ICONS = {
  success: '✓',
  info:    'ℹ',
  warn:    '⚠',
  error:   '✕'
};

// ============================================================
// TOAST MANAGER
// ============================================================
class ToastManager {
  constructor() {
    this._container = $('toast-container');
    this._queue     = [];
    this._active    = 0;
    this._maxActive = 4;
    this._enabled   = true;
  }

  /** Enable or disable notifications */
  setEnabled(val) { this._enabled = val; }

  /**
   * Show a toast notification.
   * @param {string} title    - Short headline
   * @param {string} message  - Optional body text
   * @param {string} type     - NotifType value
   * @param {number} duration - Auto-dismiss ms (default 3500)
   */
  show(title, message = '', type = NotifType.INFO, duration = 3500) {
    if (!this._enabled) return;

    // Queue if too many active
    if (this._active >= this._maxActive) {
      this._queue.push({ title, message, type, duration });
      return;
    }

    this._create(title, message, type, duration);
  }

  _create(title, message, type, duration) {
    this._active++;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'status');
    toast.style.position = 'relative';
    toast.style.overflow = 'hidden';

    toast.innerHTML = `
      <span class="toast-icon">${ICONS[type] || 'ℹ'}</span>
      <div class="toast-content">
        <div class="toast-title">${this._escape(title)}</div>
        ${message ? `<div class="toast-msg">${this._escape(message)}</div>` : ''}
      </div>
      <div class="toast-bar" style="width:100%; animation: toast-bar ${duration}ms linear forwards;"></div>
    `;

    // Add bar shrink keyframe dynamically
    this._ensureBarKeyframe();

    this._container.appendChild(toast);

    // Auto-dismiss
    const dismiss = () => this._dismiss(toast);
    const timer = setTimeout(dismiss, duration);

    // Click to dismiss
    toast.addEventListener('click', () => {
      clearTimeout(timer);
      dismiss();
    });
  }

  _dismiss(toast) {
    if (!toast.parentNode) return;
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
      this._active = Math.max(0, this._active - 1);
      // Process queue
      if (this._queue.length > 0) {
        const next = this._queue.shift();
        this._create(next.title, next.message, next.type, next.duration);
      }
    }, { once: true });
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _ensureBarKeyframe() {
    if (document.getElementById('toast-bar-style')) return;
    const style = document.createElement('style');
    style.id = 'toast-bar-style';
    style.textContent = `
      @keyframes toast-bar {
        from { width: 100%; }
        to   { width: 0%;   }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Convenience shortcuts ──
  success(title, msg, duration) { this.show(title, msg, NotifType.SUCCESS, duration); }
  info   (title, msg, duration) { this.show(title, msg, NotifType.INFO,    duration); }
  warn   (title, msg, duration) { this.show(title, msg, NotifType.WARN,    duration); }
  error  (title, msg, duration) { this.show(title, msg, NotifType.ERROR,   duration || 5000); }
}

// Singleton export
export const Notifications = new ToastManager();
