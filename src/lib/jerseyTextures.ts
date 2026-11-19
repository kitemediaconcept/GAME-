import * as THREE from 'three';
import type { TeamId } from '../types.ts';

/**
 * Generates a sharp procedural CanvasTexture for the mowed striped football pitch
 * with crisp white penalty box, 6-yard box, penalty spot, and arc markings.
 */
export function createPitchTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Base emerald turf
  ctx.fillStyle = '#1b5e28';
  ctx.fillRect(0, 0, 1024, 1024);

  // Horizontal mowed grass stripes
  const stripeCount = 14;
  const stripeH = 1024 / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#226d31' : '#195424';
    ctx.fillRect(0, i * stripeH, 1024, stripeH);
  }

  // Subtle organic turf grain
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  for (let i = 0; i < 4000; i++) {
    const x = (i * 197) % 1024;
    const y = (i * 353) % 1024;
    ctx.fillRect(x, y, 2, 4);
  }

  // White pitch markings (goal line sits around z = -15 in a 56x56 plane centered at z=-6)
  // Plane spans z from -34 (top y=0) to +22 (bottom y=1024)
  const zToY = (z: number) => ((z + 34) / 56) * 1024;
  const xToPx = (x: number) => ((x + 28) / 56) * 1024;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 5;

  // Goal line at z = -15
  const goalLineY = zToY(-15);
  ctx.beginPath();
  ctx.moveTo(xToPx(-24), goalLineY);
  ctx.lineTo(xToPx(24), goalLineY);
  ctx.stroke();

  // 6-yard box
  const sixBoxLeft = xToPx(-9.5);
  const sixBoxRight = xToPx(9.5);
  const sixBoxBottom = zToY(-8.5);
  ctx.strokeRect(sixBoxLeft, goalLineY, sixBoxRight - sixBoxLeft, sixBoxBottom - goalLineY);

  // 18-yard penalty area
  const penLeft = xToPx(-18.5);
  const penRight = xToPx(18.5);
  const penBottom = zToY(4.5);
  ctx.strokeRect(penLeft, goalLineY, penRight - penLeft, penBottom - goalLineY);

  // Penalty arc outside the 18-yard box
  const spotX = xToPx(0);
  const spotY = zToY(0);
  ctx.beginPath();
  ctx.arc(spotX, spotY, (8.2 / 56) * 1024, 0.19 * Math.PI, 0.81 * Math.PI);
  ctx.stroke();

  // Penalty spot at (0, 0)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(spotX, spotY, 8, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a high-contrast procedural jersey front texture for Team iPhone or Team Android.
 */
export function createGoalkeeperJerseyTexture(
  team: TeamId,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (team === 'iphone') {
    // Titanium slate & silver athletic goalkeeper kit
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#161a22');
    grad.addColorStop(0.55, '#252c38');
    grad.addColorStop(1, '#10141c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle geometric diagonal athletic weave
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.08)';
    ctx.lineWidth = 10;
    for (let i = -512; i < 1024; i += 44) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 260, 512);
      ctx.stroke();
    }

    // Metallic chest band
    ctx.fillStyle = 'rgba(241, 245, 249, 0.12)';
    ctx.fillRect(0, 145, 512, 132);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, 142, 512, 6);
    ctx.fillRect(0, 277, 512, 6);

    // Collar trim
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(256, 16, 78, 0, Math.PI);
    ctx.fill();

    // Stylized minimalist smartphone emblem
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(232, 82, 48, 72, 10);
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(247, 92, 18, 5);

    // Team label
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 58px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TEAM iPHONE', 256, 232);

    // Squad number
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '800 132px "Barlow Condensed", sans-serif';
    ctx.fillText('01', 256, 420);
  } else {
    // Botanical emerald & acid-lime goalkeeper kit
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#0a4429');
    grad.addColorStop(0.5, '#136b3f');
    grad.addColorStop(1, '#083320');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Dynamic chevron stripes
    ctx.strokeStyle = 'rgba(217, 255, 112, 0.12)';
    ctx.lineWidth = 12;
    for (let y = 40; y < 560; y += 68) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y - 34);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Lime accent chest panel
    ctx.fillStyle = 'rgba(9, 19, 24, 0.42)';
    ctx.fillRect(0, 145, 512, 132);
    ctx.fillStyle = '#d9ff70';
    ctx.fillRect(0, 142, 512, 7);
    ctx.fillRect(0, 277, 512, 7);

    // Collar trim
    ctx.fillStyle = '#d9ff70';
    ctx.beginPath();
    ctx.arc(256, 16, 78, 0, Math.PI);
    ctx.fill();

    // Stylized geometric bot-head dome emblem
    ctx.fillStyle = '#d9ff70';
    ctx.beginPath();
    ctx.arc(256, 128, 30, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d9ff70';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(238, 102);
    ctx.lineTo(226, 84);
    ctx.moveTo(274, 102);
    ctx.lineTo(286, 84);
    ctx.stroke();
    ctx.fillStyle = '#083320';
    ctx.beginPath();
    ctx.arc(244, 118, 4, 0, Math.PI * 2);
    ctx.arc(268, 118, 4, 0, Math.PI * 2);
    ctx.fill();

    // Team label
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 56px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TEAM ANDROID', 256, 232);

    // Squad number
    ctx.fillStyle = '#d9ff70';
    ctx.font = '800 132px "Barlow Condensed", sans-serif';
    ctx.fillText('01', 256, 420);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates an LED stadium perimeter advertising board texture ("iPHONE vs ANDROID • PENALTY SHOOTOUT").
 */
export function createPerimeterBoardTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#09151d';
  ctx.fillRect(0, 0, 1024, 128);

  // Subtle lime top & bottom edge LEDs
  ctx.fillStyle = '#d9ff70';
  ctx.fillRect(0, 0, 1024, 6);
  ctx.fillRect(0, 122, 1024, 6);

  ctx.font = '800 54px "Barlow Condensed", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const items = ['iPHONE vs ANDROID', 'PENALTY SHOOTOUT', '5 KICKS • TOP 10 WIN', 'iPHONE vs ANDROID'];
  items.forEach((label, idx) => {
    const cx = 128 + idx * 256;
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#d9ff70';
    ctx.fillText(label, cx, 66);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a crisp square-mesh stadium goal net CanvasTexture (eliminating harsh
 * diagonal triangle wireframe lines so the goalkeeper stands out clearly).
 */
export function createGoalNetTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.72)';
  ctx.lineWidth = 5;

  // Clean square net mesh cords
  ctx.beginPath();
  ctx.moveTo(0, 2.5);
  ctx.lineTo(128, 2.5);
  ctx.moveTo(2.5, 0);
  ctx.lineTo(2.5, 128);
  ctx.stroke();

  // Subtle knot intersection highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(3, 3, 4.5, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

