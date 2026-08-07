/**
 * pose.js — Realistic anatomical skeleton using TensorFlow.js MoveNet
 * Bone ivory/cream color, 3D depth, smooth interpolation
 * Modes: head | hands | full | none
 * Multi-person: 1 / 2 / 3
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus } from './utils.js';

export const SkeletonMode = {
  NONE:  'none',
  HEAD:  'head',
  HANDS: 'hands',
  FULL:  'full'
};

// MoveNet 17 keypoints:
// 0:nose, 1:left_eye, 2:right_eye, 3:left_ear, 4:right_ear
// 5:left_shoulder, 6:right_shoulder, 7:left_elbow, 8:right_elbow
// 9:left_wrist, 10:right_wrist, 11:left_hip, 12:right_hip
// 13:left_knee, 14:right_knee, 15:left_ankle, 16:right_ankle

const FULL_CONNECTIONS = [
  [5,6],[5,7],[7,9],[6,8],[8,10],
  [5,11],[6,12],[11,12],
  [11,13],[13,15],[12,14],[14,16],
];

const HEAD_CONNECTIONS = [
  [0,1],[0,2],[1,3],[2,4],[5,6],
];

const HAND_CONNECTIONS = [
  [5,7],[7,9],[6,8],[8,10],[5,6],
];

const HEAD_JOINTS  = [0,1,2,3,4,5,6];
const HAND_JOINTS  = [5,6,7,8,9,10];
const FULL_JOINTS  = [5,6,7,8,9,10,11,12,13,14,15,16];

function boneThick(a, b) {
  if ([5,6,11,12].includes(a) && [5,6,11,12].includes(b)) return 5;
  if ([5,6,11,12].includes(a) || [5,6,11,12].includes(b)) return 4;
  if ([7,8,13,14].includes(a) || [7,8,13,14].includes(b)) return 3;
  return 2.5;
}

function jointRadius(idx) {
  if ([5,6,11,12].includes(idx)) return 7;
  if ([7,8,13,14].includes(idx)) return 5.5;
  if ([9,10,15,16].includes(idx)) return 4.5;
  return 3.5;
}

class Smoother {
  constructor(a = 0.3) { this._a = a; this._p = null; }
  smooth(kps) {
    if (!kps) { this._p = null; return null; }
    if (!this._p) { this._p = kps.map(k => ({...k})); return this._p; }
    this._p = kps.map((k, i) => {
      const q = this._p[i] || k;
      return { ...k, x: q.x + this._a*(k.x-q.x), y: q.y + this._a*(k.y-q.y) };
    });
    return this._p;
  }
  reset() { this._p = null; }
}

export class PoseRenderer {
  constructor(canvas) {
    this._canvas   = canvas;
    this._ctx      = canvas.getContext('2d');
    this._phase    = 0;
    this._smoothers = [new Smoother(0.3), new Smoother(0.3), new Smoother(0.3)];
    this._inputW   = 0;
    this._inputH   = 0;
  }

  setInputSize(w, h) { this._inputW = w; this._inputH = h; }

  render(allPoses, mode, maxPersons) {
    if (!allPoses || mode === SkeletonMode.NONE) return;
    this._phase = (this._phase + 0.04) % (Math.PI * 2);
    const pulse = 0.8 + 0.2 * Math.sin(this._phase);
    const count = Math.min(allPoses.length, maxPersons || 1);

    for (let i = 0; i < count; i++) {
      const kps = allPoses[i]?.keypoints;
      if (!kps) continue;
      const smooth = this._smoothers[i]?.smooth(kps);
      if (smooth) this._draw(smooth, mode, pulse, i);
    }
    for (let i = count; i < 3; i++) this._smoothers[i]?.reset();
  }

  _draw(kps, mode, pulse, personIdx) {
    const ctx = this._ctx;
    const cw  = this._canvas.width;
    const ch  = this._canvas.height;

    // MoveNet returns pixel coords in model input space — scale to canvas
    const scaleX = this._inputW > 0 ? cw / this._inputW : 1;
    const scaleY = this._inputH > 0 ? ch / this._inputH : 1;
    const xy = k => ({ x: k.x * scaleX, y: k.y * scaleY, s: k.score ?? 1 });

    const conns  = mode === SkeletonMode.HEAD  ? HEAD_CONNECTIONS
                 : mode === SkeletonMode.HANDS ? HAND_CONNECTIONS
                 : FULL_CONNECTIONS;
    const joints = mode === SkeletonMode.HEAD  ? HEAD_JOINTS
                 : mode === SkeletonMode.HANDS ? HAND_JOINTS
                 : FULL_JOINTS;

    // Draw bones
    conns.forEach(([a, b]) => {
      const ka = kps[a], kb = kps[b];
      if (!ka || !kb) return;
      if ((ka.score ?? 1) < 0.25 || (kb.score ?? 1) < 0.25) return;
      const pa = xy(ka), pb = xy(kb);
      const al = Math.min(pa.s, pb.s) * pulse;
      const t  = boneThick(a, b);

      // Shadow
      ctx.save();
      ctx.beginPath(); ctx.moveTo(pa.x+2, pa.y+2); ctx.lineTo(pb.x+2, pb.y+2);
      ctx.strokeStyle = `rgba(0,0,0,${0.5*al})`; ctx.lineWidth = t+3;
      ctx.lineCap = 'round'; ctx.filter = 'blur(3px)'; ctx.stroke(); ctx.restore();

      // Glow
      ctx.save();
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = `rgba(255,245,200,${0.1*al})`; ctx.lineWidth = t+8;
      ctx.lineCap = 'round'; ctx.filter = 'blur(6px)'; ctx.stroke(); ctx.restore();

      // Bone gradient
      const g = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
      g.addColorStop(0,   `rgba(190,185,158,${al})`);
      g.addColorStop(0.35,`rgba(245,240,215,${al})`);
      g.addColorStop(0.5, `rgba(255,252,235,${al})`);
      g.addColorStop(0.65,`rgba(245,240,215,${al})`);
      g.addColorStop(1,   `rgba(190,185,158,${al})`);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = g; ctx.lineWidth = t; ctx.lineCap = 'round';
      ctx.filter = 'none'; ctx.stroke(); ctx.restore();
    });

    // Draw joints
    joints.forEach(i => {
      const k = kps[i];
      if (!k || (k.score ?? 1) < 0.25) return;
      const p  = xy(k);
      const r  = jointRadius(i);
      const al = (k.score ?? 1) * pulse;

      // Shadow ring
      ctx.beginPath(); ctx.arc(p.x+1, p.y+1, r+1, 0, Math.PI*2);
      ctx.fillStyle = `rgba(0,0,0,${0.5*al})`; ctx.fill();

      // 3D sphere radial gradient
      const sg = ctx.createRadialGradient(
        p.x - r*0.3, p.y - r*0.35, r*0.05,
        p.x, p.y, r
      );
      sg.addColorStop(0,   `rgba(255,255,245,${al})`);
      sg.addColorStop(0.4, `rgba(245,240,215,${al})`);
      sg.addColorStop(0.8, `rgba(215,210,185,${al*0.9})`);
      sg.addColorStop(1,   `rgba(165,160,135,${al*0.7})`);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fillStyle = sg; ctx.fill();

      // Specular highlight
      ctx.beginPath(); ctx.arc(p.x - r*0.28, p.y - r*0.3, r*0.28, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${0.5*al})`; ctx.fill();
    });

    // Person number label (only 2nd+ person)
    if (personIdx > 0) {
      const nose = kps[0];
      if (nose && (nose.score ?? 1) > 0.3) {
        const p = xy(nose);
        ctx.save();
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillStyle = 'rgba(245,240,215,0.9)';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 8;
        ctx.fillText(`#${personIdx + 1}`, p.x, p.y - 20);
        ctx.restore();
      }
    }
  }
}

// ============================================================
// POSE DETECTOR — TensorFlow.js MoveNet
// ============================================================
export class PoseDetector {
  constructor() {
    this._detector     = null;
    this._ready        = false;
    this._results      = [];
    this._prevDetected = false;
  }

  async init() {
    try {
      if (!window.poseDetection || !window.tf) {
        console.warn('TF.js or poseDetection not loaded');
        return false;
      }

      // Try MultiPose first (supports up to 6 people)
      try {
        this._detector = await window.poseDetection.createDetector(
          window.poseDetection.SupportedModels.MoveNet,
          {
            modelType: window.poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
            enableTracking: true,
            trackerType: window.poseDetection.TrackerType.BoundingBox,
            minPoseScore: AppState.settings.confidence
          }
        );
      } catch {
        // Fallback to SinglePose
        this._detector = await window.poseDetection.createDetector(
          window.poseDetection.SupportedModels.MoveNet,
          { modelType: window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
        );
      }

      this._ready = true;
      return true;
    } catch (e) {
      console.warn('MoveNet init failed:', e);
      return false;
    }
  }

  async detect(video) {
    if (!this._ready || !this._detector) return [];
    if (!video || video.readyState < 2) return [];
    try {
      const poses = await this._detector.estimatePoses(video, {
        maxPoses: 3,
        flipHorizontal: false
      });
      this._results = poses || [];
      const detected = this._results.length > 0;
      AppState.poseDetected = detected;

      if (detected && !this._prevDetected) {
        EventBus.emit('pose:detected');
        this._prevDetected = true;
      } else if (!detected && this._prevDetected) {
        EventBus.emit('pose:lost');
        this._prevDetected = false;
      }
    } catch { /* skip frame */ }
    return this._results;
  }

  get isReady()    { return this._ready; }
  get lastResults(){ return this._results; }

  destroy() {
    this._detector?.dispose?.();
    this._detector = null;
    this._ready    = false;
  }
}
