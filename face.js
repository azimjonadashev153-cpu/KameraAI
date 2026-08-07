/**
 * face.js — stub (detection handled by motion trails)
 */
import { AppState, EventBus, roundRect, drawLabel, clamp } from './utils.js';
export class FaceRenderer { constructor(canvas){} render(){} }
export class FaceDetector {
  constructor(){ this._ready=false; this._lastResults=[]; }
  async init(){ return false; }
  async detect(){ return []; }
  updateConfidence(){}
  get isReady(){ return false; }
  get lastResults(){ return this._lastResults; }
  destroy(){}
}
 * No WASM conflict — pure TF.js WebGL backend
 * AI Human Tracker · Infinity Intelligence
 */

import { AppState, EventBus, roundRect, drawLabel, clamp } from './utils.js';

// Simplified mesh contours for rendering
const FACE_OVAL  = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const LEFT_EYE   = [33,7,163,144,145,153,154,155,133,246,161,160,159,158,157,173];
const RIGHT_EYE  = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398];
const LIPS       = [61,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95];

function detectDirection(lm) {
  if (!lm || lm.length < 400) return 'Straight';
  const nose    = lm[1];
  const leftEar = lm[234];
  const rightEar= lm[454];
  const chin    = lm[152];
  const fore    = lm[10];
  if (!nose || !leftEar || !rightEar) return 'Straight';
  const cx = (leftEar.x + rightEar.x) / 2;
  const cy = (fore.y + chin.y) / 2;
  const dx = nose.x - cx;
  const dy = nose.y - cy;
  if      (dx < -0.04) return 'Left';
  else if (dx >  0.04) return 'Right';
  else if (dy < -0.03) return 'Up';
  else if (dy >  0.03) return 'Down';
  return 'Straight';
}

const DIR_ARROW = { Left:'←', Right:'→', Up:'↑', Down:'↓', Straight:'⊙' };

// ── RENDERER ─────────────────────────────────────────────────
export class FaceRenderer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._phase  = 0;
  }

  render(faces, showBbox, showLandmarks) {
    this._phase = (this._phase + 0.05) % (Math.PI * 2);
    const pulse = 0.6 + 0.4 * Math.sin(this._phase);

    faces.forEach((face, i) => {
      if (showBbox && face.boundingBox) this._drawBBox(face, i, pulse);
      if (showLandmarks && face.landmarks) this._drawMesh(face.landmarks);
      if (face.boundingBox) this._drawDir(face.direction, face.boundingBox);
    });
  }

  _drawBBox(face, idx, pulse) {
    const ctx   = this._ctx;
    const { x, y, w, h } = face.boundingBox;
    const alpha = clamp(pulse, 0.4, 1);

    ctx.save();
    ctx.shadowColor = `rgba(0,212,255,${alpha * 0.8})`;
    ctx.shadowBlur  = 18;
    ctx.strokeStyle = `rgba(0,212,255,${alpha})`;
    ctx.lineWidth   = 2;
    roundRect(ctx, x, y, w, h, 8);
    ctx.stroke();
    ctx.restore();

    // Corners
    const CL = 18;
    ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 2.5;
    [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]].forEach(([cx,cy,sx,sy]) => {
      ctx.beginPath();
      ctx.moveTo(cx+sx*CL, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy+sy*CL);
      ctx.stroke();
    });

    drawLabel(ctx, `FACE ${idx+1}  ${Math.round(face.confidence*100)}%`, x, y-2, 'rgba(0,212,255,0.85)', '#fff');
  }

  _drawMesh(lm) {
    const ctx = this._ctx;
    const cw  = this._canvas.width;
    const ch  = this._canvas.height;
    const px  = l => ({ x: l.x * cw, y: l.y * ch });

    const drawLoop = (indices, color, lw = 0.8) => {
      ctx.beginPath();
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      const s = px(lm[indices[0]]);
      ctx.moveTo(s.x, s.y);
      for (let i = 1; i < indices.length; i++) {
        const p = px(lm[indices[i]]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath(); ctx.stroke();
    };

    drawLoop(FACE_OVAL, 'rgba(0,212,255,0.3)', 1);
    drawLoop(LEFT_EYE,  'rgba(168,85,247,0.55)', 1);
    drawLoop(RIGHT_EYE, 'rgba(168,85,247,0.55)', 1);
    drawLoop(LIPS,      'rgba(255,100,150,0.5)', 1);

    ctx.fillStyle = 'rgba(0,212,255,0.6)';
    for (let i = 0; i < lm.length; i += 6) {
      const p = px(lm[i]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 1, 0, Math.PI*2); ctx.fill();
    }
  }

  _drawDir(dir, bb) {
    const ctx   = this._ctx;
    const arrow = DIR_ARROW[dir] || '⊙';
    ctx.save();
    ctx.font      = 'bold 13px Inter, sans-serif';
    ctx.fillStyle = 'rgba(0,212,255,0.95)';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,212,255,0.6)'; ctx.shadowBlur = 10;
    ctx.fillText(`${arrow} ${dir}`, bb.x + bb.w/2, bb.y + bb.h + 20);
    ctx.restore();
  }
}

// ── DETECTOR ─────────────────────────────────────────────────
export class FaceDetector {
  constructor() {
    this._detector    = null;
    this._ready       = false;
    this._lastResults = [];
    this._prevCount   = 0;
  }

  async init() {
    try {
      if (!window.faceLandmarksDetection || !window.tf) {
        console.warn('face-landmarks-detection not loaded');
        return false;
      }

      const model  = window.faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
      const config = {
        runtime:          'tfjs',
        solutionPath:     'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4',
        refineLandmarks:  false,
        maxFaces:         4,
        minDetectionConfidence: AppState.settings.confidence,
        minTrackingConfidence:  0.5,
      };

      this._detector = await window.faceLandmarksDetection.createDetector(model, config);
      this._ready    = true;
      return true;
    } catch (e) {
      console.warn('Face detector init failed:', e);
      return false;
    }
  }

  async detect(video) {
    if (!this._ready || !this._detector) return [];
    if (!video || video.readyState < 2)    return [];
    try {
      const faces = await this._detector.estimateFaces(video);
      const cw    = video.videoWidth  || 640;
      const ch    = video.videoHeight || 480;

      this._lastResults = (faces || []).map((f, i) => {
        const lm  = f.keypoints || [];
        // Normalize landmarks 0-1
        const normLm = lm.map(k => ({ x: k.x / cw, y: k.y / ch, z: k.z || 0 }));

        // Bounding box from landmarks
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        normLm.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        });

        const pad = 0.02;
        const canvasEl = document.getElementById('overlay-canvas');
        const W = canvasEl?.width  || cw;
        const H = canvasEl?.height || ch;

        return {
          id:          i + 1,
          landmarks:   normLm,
          boundingBox: {
            x: (minX - pad) * W,
            y: (minY - pad) * H,
            w: (maxX - minX + pad*2) * W,
            h: (maxY - minY + pad*2) * H,
          },
          direction:   detectDirection(normLm),
          confidence:  f.score ?? 0.9,
          center: { x: Math.round((minX+maxX)/2*W), y: Math.round((minY+maxY)/2*H) },
          size:   { w: Math.round((maxX-minX)*W), h: Math.round((maxY-minY)*H) },
        };
      });

      const count = this._lastResults.length;
      AppState.faceCount = count;

      if (count > 0 && this._prevCount === 0) EventBus.emit('face:detected', { count });
      if (count === 0 && this._prevCount > 0) EventBus.emit('face:lost');
      if (count !== this._prevCount)          EventBus.emit('face:count', { count });
      this._prevCount = count;

    } catch (e) { /* skip frame */ }
    return this._lastResults;
  }

  updateConfidence(val) { AppState.settings.confidence = val; }

  get isReady()    { return this._ready; }
  get lastResults(){ return this._lastResults; }

  destroy() {
    this._detector?.dispose?.();
    this._detector = null;
    this._ready    = false;
  }
}
