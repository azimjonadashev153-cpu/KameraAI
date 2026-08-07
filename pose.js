/**
 * pose.js — Realistic anatomical skeleton renderer
 * Bone ivory/cream color like X-ray, 3D depth with shadow+highlight
 * Modes: head | hands | full — only shown when user activates a mode
 * Multi-person: 1 / 2 / 3
 */

import { AppState, EventBus } from './utils.js';

export const SkeletonMode = {
  NONE:  'none',
  HEAD:  'head',
  HANDS: 'hands',
  FULL:  'full'
};

// Bone color palette — ivory/cream like real X-ray
const BONE_MAIN   = 'rgba(245, 240, 215, 0.95)';
const BONE_BRIGHT = 'rgba(255, 252, 235, 1.0)';
const BONE_DIM    = 'rgba(200, 195, 168, 0.8)';
const BONE_GLOW   = 'rgba(255, 245, 200, 0.12)';
const BONE_SHADOW = 'rgba(0, 0, 0, 0.55)';

// Full body bone connections
const FULL_CONNECTIONS = [
  [11,12],[11,23],[12,24],[23,24],           // torso
  [11,13],[13,15],[15,17],[15,21],[17,19],   // left arm
  [12,14],[14,16],[16,18],[16,22],[18,20],   // right arm
  [23,25],[25,27],[27,29],[27,31],[29,31],   // left leg
  [24,26],[26,28],[28,30],[28,32],[30,32],   // right leg
];

const HEAD_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,7],
  [0,4],[4,5],[5,6],[6,8],
  [9,10],
  [11,12],
];

const HAND_CONNECTIONS = [
  [11,13],[13,15],[15,17],[15,21],
  [12,14],[14,16],[16,18],[16,22],
];

const HEAD_JOINTS  = [0,1,2,3,4,5,6,7,8,9,10,11,12];
const HAND_JOINTS  = [11,12,13,14,15,16,17,18,19,20,21,22];
const FULL_JOINTS  = [11,12,13,14,15,16,23,24,25,26,27,28];

class Smoother {
  constructor(alpha = 0.3) { this._a = alpha; this._p = null; }
  smooth(lm) {
    if (!lm) { this._p = null; return null; }
    if (!this._p) { this._p = lm.map(p => ({...p})); return this._p; }
    this._p = lm.map((p,i) => {
      const q = this._p[i] || p;
      return { x: q.x+this._a*(p.x-q.x), y: q.y+this._a*(p.y-q.y), z: (q.z||0)+this._a*((p.z||0)-(q.z||0)), visibility: p.visibility };
    });
    return this._p;
  }
  reset() { this._p = null; }
}

export class PoseRenderer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._phase  = 0;
    this._smoothers = [new Smoother(0.3), new Smoother(0.3), new Smoother(0.3)];
  }

  render(allLandmarks, mode, maxPersons = 1) {
    if (!allLandmarks || mode === SkeletonMode.NONE) return;
    this._phase = (this._phase + 0.04) % (Math.PI * 2);
    const pulse = 0.8 + 0.2 * Math.sin(this._phase);
    const count = Math.min(allLandmarks.length, maxPersons);
    for (let i = 0; i < count; i++) {
      const lm = this._smoothers[i]?.smooth(allLandmarks[i]);
      if (lm) this._drawSkeleton(lm, mode, pulse, i);
    }
    for (let i = count; i < 3; i++) this._smoothers[i]?.reset();
  }

  _drawSkeleton(lm, mode, pulse, idx) {
    const ctx = this._ctx;
    const cw  = this._canvas.width;
    const ch  = this._canvas.height;
    const xy  = l => ({ x: l.x * cw, y: l.y * ch, v: l.visibility ?? 1 });

    const conns  = mode === SkeletonMode.HEAD ? HEAD_CONNECTIONS
                 : mode === SkeletonMode.HANDS ? HAND_CONNECTIONS
                 : FULL_CONNECTIONS;
    const joints = mode === SkeletonMode.HEAD ? HEAD_JOINTS
                 : mode === SkeletonMode.HANDS ? HAND_JOINTS
                 : FULL_JOINTS;

    // Draw bones
    conns.forEach(([a, b]) => {
      const la = lm[a], lb = lm[b];
      if (!la || !lb) return;
      const va = la.visibility ?? 1, vb = lb.visibility ?? 1;
      if (va < 0.2 || vb < 0.2) return;
      const pa = xy(la), pb = xy(lb);
      const al = Math.min(va, vb) * pulse;
      const thick = this._thick(a, b);

      // Drop shadow
      ctx.save();
      ctx.beginPath(); ctx.moveTo(pa.x+2, pa.y+2); ctx.lineTo(pb.x+2, pb.y+2);
      ctx.strokeStyle = BONE_SHADOW; ctx.lineWidth = thick+3; ctx.lineCap = 'round';
      ctx.filter = 'blur(3px)'; ctx.stroke(); ctx.restore();

      // Warm glow
      ctx.save();
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = `rgba(255,245,200,${0.12*al})`; ctx.lineWidth = thick+7;
      ctx.lineCap = 'round'; ctx.filter = 'blur(6px)'; ctx.stroke(); ctx.restore();

      // Main bone with gradient
      const g = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
      g.addColorStop(0,   `rgba(200,195,168,${al})`);
      g.addColorStop(0.3, `rgba(245,240,215,${al})`);
      g.addColorStop(0.5, `rgba(255,252,235,${al})`);
      g.addColorStop(0.7, `rgba(245,240,215,${al})`);
      g.addColorStop(1,   `rgba(200,195,168,${al})`);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = g; ctx.lineWidth = thick; ctx.lineCap = 'round';
      ctx.filter = 'none'; ctx.stroke(); ctx.restore();
    });

    // Draw joints
    joints.forEach(i => {
      const l = lm[i];
      if (!l || (l.visibility ?? 1) < 0.25) return;
      const p = xy(l);
      const r = this._radius(i);
      const al = (l.visibility ?? 1) * pulse;

      // Shadow ring
      ctx.beginPath(); ctx.arc(p.x+1, p.y+1, r+1, 0, Math.PI*2);
      ctx.fillStyle = `rgba(0,0,0,${0.5*al})`; ctx.fill();

      // 3D sphere gradient
      const sg = ctx.createRadialGradient(p.x-r*0.3, p.y-r*0.35, r*0.05, p.x, p.y, r);
      sg.addColorStop(0,   `rgba(255,255,245,${al})`);
      sg.addColorStop(0.4, `rgba(245,240,215,${al})`);
      sg.addColorStop(0.8, `rgba(220,215,185,${al*0.9})`);
      sg.addColorStop(1,   `rgba(170,165,140,${al*0.7})`);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fillStyle = sg; ctx.fill();

      // Specular highlight
      ctx.beginPath(); ctx.arc(p.x-r*0.28, p.y-r*0.28, r*0.28, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${0.45*al})`; ctx.fill();
    });

    // Person number label (only if multi-person)
    if (idx > 0) {
      const nose = lm[0];
      if (nose && (nose.visibility??1) > 0.3) {
        const p = xy(nose);
        ctx.save(); ctx.font = 'bold 11px Inter,sans-serif';
        ctx.fillStyle = `rgba(245,240,215,0.9)`; ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
        ctx.fillText(`#${idx+1}`, p.x, p.y - 20); ctx.restore();
      }
    }
  }

  _thick(a, b) {
    if ([11,12,23,24].includes(a) && [11,12,23,24].includes(b)) return 5;
    if ([11,12,23,24].includes(a) || [11,12,23,24].includes(b)) return 4;
    if ([13,14,25,26].includes(a) || [13,14,25,26].includes(b)) return 3.5;
    return 2.5;
  }

  _radius(idx) {
    if ([11,12,23,24].includes(idx)) return 7;
    if ([13,14,25,26].includes(idx)) return 5.5;
    if ([15,16,27,28].includes(idx)) return 4.5;
    return 3;
  }
}

export class PoseDetector {
  constructor() {
    this._pose = null; this._ready = false;
    this._results = []; this._prevDetected = false;
  }

  async init() {
    return new Promise(resolve => {
      try {
        const pose = new window.Pose({
          locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${f}`
        });
        pose.setOptions({
          modelComplexity: 1, smoothLandmarks: true,
          enableSegmentation: false, smoothSegmentation: false,
          minDetectionConfidence: AppState.settings.confidence,
          minTrackingConfidence: 0.5
        });
        pose.onResults(r => this._onResults(r));
        pose.initialize()
          .then(() => { this._pose = pose; this._ready = true; resolve(true); })
          .catch(e => { console.warn('Pose init failed:', e); resolve(false); });
      } catch(e) { console.warn('Pose unavailable:', e); resolve(false); }
    });
  }

  async detect(video) {
    if (!this._ready || !this._pose) return [];
    try { await this._pose.send({ image: video }); } catch {}
    return this._results;
  }

  _onResults(r) {
    const lm = r.poseLandmarks;
    if (lm?.length) {
      this._results = [lm]; AppState.poseDetected = true;
      if (!this._prevDetected) { EventBus.emit('pose:detected'); this._prevDetected = true; }
    } else {
      this._results = []; AppState.poseDetected = false;
      if (this._prevDetected) { EventBus.emit('pose:lost'); this._prevDetected = false; }
    }
  }

  get isReady()    { return this._ready; }
  get lastResults(){ return this._results; }
  destroy() { this._pose?.close?.(); this._pose = null; this._ready = false; }
}
