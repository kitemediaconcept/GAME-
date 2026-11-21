import * as THREE from 'three';

const IPHONE_FILES = [
  'iPhone_16_Plus_Ultramarine-Photoroom_4e9d7503.png',
  'iPhone_16_Plus_Pink-Photoroom_c242e09d.png',
  'download_-_2026-11-21T163223.136-Photoroom_92a0f43a.png',
  'download_-_2026-11-21T163243.825-Photoroom_5bba63d8.png',
  'download_-_2026-11-21T163236.116-Photoroom_b4018d9c.png',
  'download_-_2026-11-21T163208.172-Photoroom_ebafc690.png',
  'download_-_2026-11-21T163122.800-Photoroom_80b62673.png',
  '-_leManoosh-Photoroom_7ede329d.png',
] as const;

const ANDROID_FILES = [
  'Samsung_Galaxy_S26_Ultra__Neues_Renderbild_soll_Design_zeigen-Photoroom_a33fddf4.png',
  'download_-_2026-11-21T163526.324-Photoroom_e15faede.png',
  'Shop_the_latest_Pixel_10_smartphones__Pixel_10__Pixel_10_Pro___Pixel_10_Pro_Fold__Enjoy_new_features_every_few_months_with_your_Google_Pixel_smartphone_-Photoroom_fee5ee58.png',
  'download_-_2026-11-21T163153.039-Photoroom_d80228d6.png',
  'OnePlus_12___oneplus_12_unboxing-Photoroom_c9386fbb.png',
  'download_-_2026-11-21T163304.366-Photoroom_e6823f91.png',
  'omg_poco__-Photoroom_bfb00e84.png',
] as const;

const ALL_PHONE_FILES = [...IPHONE_FILES, ...ANDROID_FILES];
const IPHONE_COUNT = IPHONE_FILES.length;
const ANDROID_COUNT = ANDROID_FILES.length;

interface PhoneFanSpec {
  x: number;
  baseY: number;
  z: number;
  rotY: number;
  phase: number;
  amp: number;
  swayAmp: number;
  scale: number;
}

export interface PhoneCrowdSystem {
  group: THREE.Group;
  update: (elapsed: number, cheerBoost: number) => void;
  dispose: () => void;
}

const _dummy = new THREE.Object3D();

function getAssetBase(): string {
  const rawBase = import.meta.env.BASE_URL || '/';
  return rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
}

function drawPhoneFallback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  isIphone: boolean
) {
  ctx.clearRect(0, 0, w, h);
  const padX = 28;
  const padY = 26;
  const rw = w - padX * 2;
  const rh = h - padY * 2;
  const r = 34;

  ctx.fillStyle = isIphone ? '#3b82f6' : '#10b981';
  ctx.beginPath();
  ctx.roundRect(padX, padY, rw, rh, r);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Camera module placeholder
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(padX + 20, padY + 22, 56, 94, 18);
  ctx.fill();
}

/**
 * Loads a transparent smartphone PNG, scans its non-transparent alpha bounds,
 * and redraws it normalized & bottom-aligned into a crisp 256x512 CanvasTexture
 * so every phone model has uniform physical size in the stadium stands.
 */
function createNormalizedPhoneTexture(
  filename: string,
  isIphone: boolean,
  maxAniso: number
): THREE.CanvasTexture {
  const W = 256;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  drawPhoneFallback(ctx, W, H, isIphone);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAniso);
  texture.needsUpdate = true;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) return;

    // Fast alpha bounding-box probe on a small offscreen canvas
    const probeSize = 128;
    const probe = document.createElement('canvas');
    probe.width = probeSize;
    probe.height = probeSize;
    const pCtx = probe.getContext('2d', { willReadFrequently: true });

    let sx = 0;
    let sy = 0;
    let sw = natW;
    let sh = natH;

    if (pCtx) {
      pCtx.clearRect(0, 0, probeSize, probeSize);
      pCtx.drawImage(img, 0, 0, probeSize, probeSize);
      try {
        const { data } = pCtx.getImageData(0, 0, probeSize, probeSize);
        let minX = probeSize;
        let minY = probeSize;
        let maxX = -1;
        let maxY = -1;

        for (let py = 0; py < probeSize; py++) {
          const rowOff = py * probeSize * 4;
          for (let px = 0; px < probeSize; px++) {
            if (data[rowOff + px * 4 + 3] > 24) {
              if (px < minX) minX = px;
              if (px > maxX) maxX = px;
              if (py < minY) minY = py;
              if (py > maxY) maxY = py;
            }
          }
        }

        if (maxX > minX && maxY > minY) {
          // Slight 1px safety margin on probe so rounded corners never clip
          const pad = 1;
          const x0 = Math.max(0, minX - pad) / probeSize;
          const y0 = Math.max(0, minY - pad) / probeSize;
          const x1 = Math.min(probeSize, maxX + 1 + pad) / probeSize;
          const y1 = Math.min(probeSize, maxY + 1 + pad) / probeSize;
          sx = x0 * natW;
          sy = y0 * natH;
          sw = Math.max(1, (x1 - x0) * natW);
          sh = Math.max(1, (y1 - y0) * natH);
        }
      } catch {
        // Fallback to full image if tainted
      }
    }

    // Draw cropped phone centered horizontally and bottom-aligned cleanly
    ctx.clearRect(0, 0, W, H);
    const maxDrawW = W - 16;
    const maxDrawH = H - 20;
    const scale = Math.min(maxDrawW / sw, maxDrawH / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (W - dw) / 2;
    const dy = H - dh - 8;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    texture.needsUpdate = true;
  };
  img.src = `${getAssetBase()}assets/aistudio/${filename}`;

  return texture;
}

export function createPhoneCrowd(maxAniso: number): PhoneCrowdSystem {
  const group = new THREE.Group();

  // Bottom-center pivoted phone billboard plane (exact 1:2 aspect matching 256x512)
  const phoneGeo = new THREE.PlaneGeometry(0.76, 1.52);
  phoneGeo.translate(0, 0.76, 0);

  const buckets: PhoneFanSpec[][] = ALL_PHONE_FILES.map(() => []);

  // Deterministic pseudo-random helper so crowd distribution looks organic yet balanced
  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // 1. Back Stadium Gallery (5 tiers behind the goal)
  // Left section (x < 0): Team iPhone fans; Right section (x >= 0): Team Android fans
  for (let tier = 0; tier < 5; tier++) {
    const baseY = 2.24 + tier * 1.85;
    const z = -20.32 - tier * 2.1;
    const cols = 52;
    const span = 50;
    const step = span / (cols - 1);

    for (let i = 0; i < cols; i++) {
      const x = -span / 2 + i * step + (rand() - 0.5) * 0.14;
      const isLeftIphoneSection = x < 0;

      // Pick model index with row stagger so adjacent phones vary in color & silhouette
      const modelIdx = isLeftIphoneSection
        ? (i * 3 + tier * 5 + Math.floor(rand() * 2)) % IPHONE_COUNT
        : IPHONE_COUNT + ((i * 3 + tier * 4 + Math.floor(rand() * 2)) % ANDROID_COUNT);

      buckets[modelIdx].push({
        x,
        baseY,
        z: z + (rand() - 0.5) * 0.18,
        rotY: (rand() - 0.5) * 0.18,
        phase: rand() * Math.PI * 2,
        amp: 0.09 + rand() * 0.08,
        swayAmp: 0.045 + rand() * 0.045,
        scale: 0.92 + rand() * 0.16,
      });
    }
  }

  // 2. Left & Right Side Galleries (3 tiers each)
  for (let side = -1; side <= 1; side += 2) {
    const isIphoneSide = side < 0;
    for (let tier = 0; tier < 3; tier++) {
      const x = side * (26.55 + tier * 2.1);
      const baseY = 2.24 + tier * 1.85;
      for (let i = 0; i < 32; i++) {
        const z = 8 - i * 1.15;
        const modelIdx = isIphoneSide
          ? (i * 3 + tier * 2) % IPHONE_COUNT
          : IPHONE_COUNT + ((i * 3 + tier * 2) % ANDROID_COUNT);

        buckets[modelIdx].push({
          x,
          baseY,
          z,
          rotY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
          phase: rand() * Math.PI * 2,
          amp: 0.08 + rand() * 0.07,
          swayAmp: 0.04 + rand() * 0.04,
          scale: 0.9 + rand() * 0.15,
        });
      }
    }
  }

  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const instancedMeshes: Array<{
    mesh: THREE.InstancedMesh;
    specs: PhoneFanSpec[];
  }> = [];

  ALL_PHONE_FILES.forEach((filename, modelIdx) => {
    const specs = buckets[modelIdx];
    if (specs.length === 0) return;

    const isIphone = modelIdx < IPHONE_COUNT;
    const tex = createNormalizedPhoneTexture(filename, isIphone, maxAniso);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.28,
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.42,
      metalness: 0.08,
    });

    const mesh = new THREE.InstancedMesh(phoneGeo, mat, specs.length);
    mesh.frustumCulled = false;

    for (let i = 0; i < specs.length; i++) {
      const f = specs[i];
      _dummy.position.set(f.x, f.baseY, f.z);
      _dummy.rotation.set(0, f.rotY, 0);
      _dummy.scale.setScalar(f.scale);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    group.add(mesh);
    textures.push(tex);
    materials.push(mat);
    instancedMeshes.push({ mesh, specs });
  });

  const update = (elapsed: number, cheerBoost: number) => {
    const cheerMult = 1 + cheerBoost * 2.5;
    const speedBoost = 1 + cheerBoost * 0.85;

    for (let m = 0; m < instancedMeshes.length; m++) {
      const { mesh, specs } = instancedMeshes[m];
      for (let i = 0; i < specs.length; i++) {
        const f = specs[i];
        // Stadium wave bounce + joyful celebratory hop & side-to-side phone wiggle
        const rawWave = Math.sin(elapsed * 2.8 * speedBoost + f.phase + f.x * 0.14);
        const hop = (rawWave * 0.5 + 0.5) * f.amp * cheerMult;
        const swayZ = Math.sin(elapsed * 3.4 + f.phase) * f.swayAmp * (1 + cheerBoost * 1.4);

        _dummy.position.set(f.x, f.baseY + hop, f.z);
        _dummy.rotation.set(0, f.rotY, swayZ);
        _dummy.scale.setScalar(f.scale);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = () => {
    phoneGeo.dispose();
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    instancedMeshes.forEach(({ mesh }) => mesh.dispose());
  };

  return { group, update, dispose };
}
