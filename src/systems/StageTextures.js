import * as THREE from 'three';

// ============================================================================
// StageTextures — small canvas-drawn textures shared across Arena's structural
// meshes (obstacles/platform/ramp/walls) and StageDecor's background/prop
// meshes. Centralized here so every consumer reuses the same handful of
// small CanvasTextures instead of each building its own: keeps texture
// memory and draw-call/material count low on mobile GPUs.
//
// Every texture is intentionally tiny (64-256px) and cheap to generate once
// at startup; none of them are re-drawn per frame.
// ============================================================================

function hex(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')];
}

function finish(canvas, repeat = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Sci-fi "hull panel" texture used for obstacles: navy base, a colored accent
 * stripe, bolt dots and a couple of vent slats. Returns { map, emissiveMap } —
 * emissiveMap is black except thin edge/accent lines, so a low-cost
 * MeshStandardMaterial({map, emissiveMap, emissive}) reads as neon-trimmed
 * without any extra dynamic lights.
 */
export function createPanelTexture(accentHex, baseHex = 0x232f4d) {
  const size = 128;
  const [mapCanvas, mctx] = makeCanvas(size);
  const [glowCanvas, gctx] = makeCanvas(size);

  mctx.fillStyle = hex(baseHex);
  mctx.fillRect(0, 0, size, size);

  // Panel seam border
  mctx.strokeStyle = 'rgba(0,0,0,0.35)';
  mctx.lineWidth = 3;
  mctx.strokeRect(1.5, 1.5, size - 3, size - 3);

  // Accent stripe band across the middle third
  mctx.fillStyle = hex(accentHex);
  mctx.globalAlpha = 0.85;
  mctx.fillRect(0, size * 0.42, size, size * 0.14);
  mctx.globalAlpha = 1;

  // Warning diagonal ticks near one edge
  mctx.strokeStyle = 'rgba(255,255,255,0.5)';
  mctx.lineWidth = 4;
  for (let i = -1; i < 6; i++) {
    mctx.beginPath();
    mctx.moveTo(i * 24, size);
    mctx.lineTo(i * 24 + 14, size - 14);
    mctx.stroke();
  }

  // Bolts
  mctx.fillStyle = 'rgba(10,15,25,0.8)';
  const boltPositions = [[10, 10], [size - 10, 10], [10, size - 10], [size - 10, size - 10]];
  for (const [bx, by] of boltPositions) {
    mctx.beginPath();
    mctx.arc(bx, by, 3.2, 0, Math.PI * 2);
    mctx.fill();
  }

  // Vent slats (upper third)
  mctx.strokeStyle = 'rgba(0,0,0,0.4)';
  mctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const y = 20 + i * 6;
    mctx.beginPath();
    mctx.moveTo(size * 0.6, y);
    mctx.lineTo(size * 0.92, y);
    mctx.stroke();
  }

  // Emissive map: bright edge frame + accent stripe glow only
  gctx.fillStyle = '#000000';
  gctx.fillRect(0, 0, size, size);
  gctx.strokeStyle = hex(accentHex);
  gctx.lineWidth = 3;
  gctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  gctx.fillStyle = hex(accentHex);
  gctx.fillRect(0, size * 0.42, size, size * 0.14);

  return { map: finish(mapCanvas), emissiveMap: finish(glowCanvas) };
}

/** Navy "hull metal" texture for platform sides / ramp / perimeter walls: subtle panel grid + rivets + glowing seam. */
export function createMetalTexture(baseHex, glowHex) {
  const size = 128;
  const [mapCanvas, mctx] = makeCanvas(size);
  const [glowCanvas, gctx] = makeCanvas(size);

  mctx.fillStyle = hex(baseHex);
  mctx.fillRect(0, 0, size, size);
  const grad = mctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(255,255,255,0.05)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  mctx.fillStyle = grad;
  mctx.fillRect(0, 0, size, size);

  mctx.strokeStyle = 'rgba(0,0,0,0.4)';
  mctx.lineWidth = 2;
  mctx.strokeRect(1, 1, size - 2, size - 2);

  mctx.fillStyle = 'rgba(10,15,25,0.85)';
  for (const [bx, by] of [[8, 8], [size - 8, 8], [8, size - 8], [size - 8, size - 8]]) {
    mctx.beginPath();
    mctx.arc(bx, by, 2.6, 0, Math.PI * 2);
    mctx.fill();
  }

  gctx.fillStyle = '#000000';
  gctx.fillRect(0, 0, size, size);
  gctx.strokeStyle = hex(glowHex);
  gctx.lineWidth = 2.4;
  gctx.strokeRect(1.2, 1.2, size - 2.4, size - 2.4);

  return { map: finish(mapCanvas), emissiveMap: finish(glowCanvas) };
}

/** Yellow/black diagonal hazard stripes, used on ramp flanks. */
export function createHazardStripeTexture() {
  const size = 64;
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = '#15120a';
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(Math.PI / 4);
  ctx.translate(-size / 2, -size / 2);
  ctx.fillStyle = hex(0xffd94a);
  for (let x = -size; x < size * 2; x += 18) {
    ctx.fillRect(x, -size, 9, size * 3);
  }
  ctx.restore();
  return finish(canvas);
}

/** Big backlit signage panel (arena logo / display board) for platform + wall faces. */
export function createSignTexture(lines, accentHex = 0x35e6ff) {
  const w = 256, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#050912';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = hex(accentHex);
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  ctx.fillStyle = hex(accentHex);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 40px sans-serif';
  ctx.fillText(lines[0] ?? '', w / 2, h * 0.42);
  if (lines[1]) {
    ctx.font = '700 18px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(lines[1], w / 2, h * 0.74);
  }
  const tex = finish(canvas, false);
  return tex;
}

/** Soft round alpha sprite for clouds / glow dots (radial gradient, transparent edges). */
export function createSoftDotTexture(colorHex = 0xffffff) {
  const size = 64;
  const [canvas, ctx] = makeCanvas(size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const c = hex(colorHex);
  grad.addColorStop(0, `${c}ee`);
  grad.addColorStop(0.5, `${c}66`);
  grad.addColorStop(1, `${c}00`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return finish(canvas, false);
}

/** Tileable water texture: soft bands + sparkle flecks, meant to be UV-scrolled for cheap "moving sea" shimmer. */
export function createWaterTexture(baseHex, highlightHex) {
  const size = 128;
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = hex(baseHex);
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = `${hex(highlightHex)}55`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const y = (i / 6) * size + Math.sin(i) * 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.1 + i) * 4);
    }
    ctx.stroke();
  }

  ctx.fillStyle = `${hex(highlightHex)}aa`;
  for (let i = 0; i < 24; i++) {
    const x = (i * 37) % size;
    const y = (i * 53) % size;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  return finish(canvas);
}
