import * as THREE from 'three';
import type { TeamId } from '../types.ts';

export interface GoalkeeperRig {
  root: THREE.Group;
  body: THREE.Group;
  headPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  leftElbowPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  rightElbowPivot: THREE.Group;
  leftHipPivot: THREE.Group;
  leftKneePivot: THREE.Group;
  rightHipPivot: THREE.Group;
  rightKneePivot: THREE.Group;
  shadow: THREE.Mesh;
  updateJersey: (team: TeamId) => void;
  setReadyPose: (elapsed: number, activeSway: boolean) => void;
  dispose: () => void;
}

/**
 * Generates an athletic male goalkeeper face texture (tanned skin, focused eyes,
 * sculpted brows, short dark trimmed beard & hairline) mapped onto a SphereGeometry
 * where u=0.5 faces +Z when mesh.rotation.y = -Math.PI / 2.
 */
function createFaceTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base warm tanned athletic skin
  const skinGrad = ctx.createLinearGradient(0, 0, 0, 512);
  skinGrad.addColorStop(0, '#c8894b');
  skinGrad.addColorStop(0.55, '#c68344');
  skinGrad.addColorStop(1, '#a96c35');
  ctx.fillStyle = skinGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle cheekbone & nose shading
  const cx = 256;
  const cheekGrad = ctx.createRadialGradient(cx, 275, 18, cx, 275, 120);
  cheekGrad.addColorStop(0, 'rgba(255, 220, 175, 0.22)');
  cheekGrad.addColorStop(1, 'rgba(130, 75, 30, 0)');
  ctx.fillStyle = cheekGrad;
  ctx.fillRect(100, 170, 312, 220);

  // Top & back cropped dark hair fade
  ctx.fillStyle = '#151517';
  ctx.fillRect(0, 0, 512, 168);
  // Forehead hairline cutout (u around 0.5)
  ctx.fillStyle = '#c8894b';
  ctx.beginPath();
  ctx.roundRect(cx - 64, 134, 128, 72, 24);
  ctx.fill();

  // Side fade temples & back-of-head taper
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 150, 168, 125);
  ctx.fillRect(344, 150, 168, 125);
  const fadeBack = ctx.createLinearGradient(0, 260, 0, 330);
  fadeBack.addColorStop(0, '#18181b');
  fadeBack.addColorStop(1, 'rgba(24,24,27,0)');
  ctx.fillStyle = fadeBack;
  ctx.fillRect(0, 260, 174, 70);
  ctx.fillRect(338, 260, 174, 70);

  // Focused dark eyebrows (slight competitive furrow)
  ctx.strokeStyle = '#141416';
  ctx.lineWidth = 8.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 50, 224);
  ctx.quadraticCurveTo(cx - 32, 217, cx - 14, 229);
  ctx.moveTo(cx + 50, 224);
  ctx.quadraticCurveTo(cx + 32, 217, cx + 14, 229);
  ctx.stroke();

  // Eyes (white sclera + dark iris + crisp highlight)
  [-32, 32].forEach((ox) => {
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(cx + ox, 246, 13, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#181412';
    ctx.beginPath();
    ctx.arc(cx + ox, 246, 5.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + ox + 2, 244, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Upper lash line
    ctx.strokeStyle = '#141210';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx + ox, 245, 13.5, 7.5, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  });

  // Sculpted nose bridge & tip shadow
  ctx.strokeStyle = 'rgba(110, 62, 25, 0.55)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 3, 244);
  ctx.lineTo(cx - 5, 286);
  ctx.quadraticCurveTo(cx, 294, cx + 6, 286);
  ctx.stroke();

  // Full trimmed dark beard & jawline framing (matches second reference figure)
  ctx.fillStyle = '#17171a';
  ctx.beginPath();
  ctx.moveTo(cx - 78, 258);
  ctx.quadraticCurveTo(cx - 72, 338, cx, 366);
  ctx.quadraticCurveTo(cx + 72, 338, cx + 78, 258);
  ctx.lineTo(cx + 62, 256);
  ctx.quadraticCurveTo(cx + 54, 316, cx, 332);
  ctx.quadraticCurveTo(cx - 54, 316, cx - 62, 256);
  ctx.closePath();
  ctx.fill();

  // Chin beard fullness
  ctx.beginPath();
  ctx.ellipse(cx, 344, 42, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mustache
  ctx.beginPath();
  ctx.moveTo(cx - 28, 310);
  ctx.quadraticCurveTo(cx, 296, cx + 28, 310);
  ctx.quadraticCurveTo(cx + 22, 321, cx, 316);
  ctx.quadraticCurveTo(cx - 22, 321, cx - 28, 310);
  ctx.fill();

  // Mouth / determined lips
  ctx.fillStyle = '#9c5c3b';
  ctx.beginPath();
  ctx.ellipse(cx, 322, 13, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a1f14';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 12, 322);
  ctx.lineTo(cx + 12, 322);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates contoured dark pro-athlete goalkeeper jersey textures for Team iPhone
 * and Team Android inspired by the sleek black & neon-accented kit in the reference figure.
 * LatheGeometry wraps u=0..1 around Y; we center the front design at u=0.5 (rotated to +Z)
 * and place the squad number "01" on the back at u=0 / u=1.
 */
function createContouredKitTexture(
  team: TeamId,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const isAndroid = team === 'android';
  const primaryBase = isAndroid ? '#0d1012' : '#12161d';
  const secondaryTone = isAndroid ? '#161b1e' : '#1e2531';
  const accent = isAndroid ? '#a3ff12' : '#38bdf8';
  const accentBright = isAndroid ? '#d9ff70' : '#e2e8f0';

  // Sleek athletic matte-black / obsidian jersey base
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, secondaryTone);
  grad.addColorStop(0.45, primaryBase);
  grad.addColorStop(1, '#090b0d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Subtle vertical pro-jersey mesh panels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  for (let x = 0; x < 1024; x += 48) {
    ctx.fillRect(x, 0, 22, 512);
  }

  // Crew neck collar trim at top edge (v=1 -> y=0)
  ctx.fillStyle = '#262b33';
  ctx.fillRect(0, 0, 1024, 24);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 22, 1024, 4);

  // ─── FRONT CHEST DESIGN (centered around x = 512) ───────────
  const cx = 512;

  // Dynamic curved athletic side-rib flare accents (mirroring the reference jersey!)
  ctx.fillStyle = accent;
  // Left athletic blade
  ctx.beginPath();
  ctx.moveTo(cx - 108, 128);
  ctx.quadraticCurveTo(cx - 78, 195, cx - 94, 305);
  ctx.quadraticCurveTo(cx - 64, 225, cx - 72, 145);
  ctx.closePath();
  ctx.fill();

  // Right athletic blade
  ctx.beginPath();
  ctx.moveTo(cx + 108, 128);
  ctx.quadraticCurveTo(cx + 78, 195, cx + 94, 305);
  ctx.quadraticCurveTo(cx + 64, 225, cx + 72, 145);
  ctx.closePath();
  ctx.fill();

  // Lower kinetic arc accent
  ctx.beginPath();
  ctx.moveTo(cx - 46, 338);
  ctx.quadraticCurveTo(cx, 368, cx + 46, 338);
  ctx.quadraticCurveTo(cx, 352, cx - 46, 338);
  ctx.closePath();
  ctx.fill();

  // Central Team Crest Emblem
  if (isAndroid) {
    // Sleek geometric Android dome emblem + antennae in electric lime
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx, 224, 36, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 18, 196);
    ctx.lineTo(cx - 32, 174);
    ctx.moveTo(cx + 18, 196);
    ctx.lineTo(cx + 32, 174);
    ctx.stroke();

    ctx.fillStyle = '#0b0e10';
    ctx.beginPath();
    ctx.arc(cx - 14, 212, 4.5, 0, Math.PI * 2);
    ctx.arc(cx + 14, 212, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = accentBright;
    ctx.font = '800 36px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ANDROID', cx, 286);
  } else {
    // Sleek minimalist iPhone silhouette crest in titanium silver & sky-cyan
    ctx.strokeStyle = accentBright;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(cx - 24, 166, 48, 76, 11);
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(cx - 10, 176, 20, 6, 3);
    ctx.fill();

    ctx.fillStyle = accentBright;
    ctx.font = '800 38px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('iPHONE', cx, 288);
  }

  // Subtle back squad number "01" (at x = 0 / 1024 seam)
  ctx.fillStyle = accentBright;
  ctx.font = '800 130px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('01', 0, 290);
  ctx.fillText('01', 1024, 290);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds an articulated, anatomically sculpted 3D athletic goalkeeper matching the
 * second reference figure (expressive bearded face, contoured V-taper short-sleeve kit,
 * bent muscular arms with fingered grip gloves, wide crouched stance, high socks, neon cleats).
 */
export function createGoalkeeperRig(
  initialTeam: TeamId,
  maxAnisotropy: number
): GoalkeeperRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  // Center-of-mass pivot (~1.08m above turf) so dives rotate cleanly around torso
  body.position.set(0, 1.08, 0);
  root.add(body);

  const faceTexture = createFaceTexture(maxAnisotropy);
  const kitTextures: Record<TeamId, THREE.CanvasTexture> = {
    iphone: createContouredKitTexture('iphone', maxAnisotropy),
    android: createContouredKitTexture('android', maxAnisotropy),
  };

  // Materials (varied roughness/metalness for crisp stadium PBR shading)
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xc88446,
    roughness: 0.68,
    metalness: 0.02,
  });
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTexture,
    roughness: 0.65,
    metalness: 0.02,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x161618,
    roughness: 0.88,
    metalness: 0.04,
  });
  const torsoMat = new THREE.MeshStandardMaterial({
    map: kitTextures[initialTeam],
    roughness: 0.72,
    metalness: 0.05,
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: initialTeam === 'android' ? 0x0e1113 : 0x151a22,
    roughness: 0.74,
    metalness: 0.05,
  });
  const shortsMat = new THREE.MeshStandardMaterial({
    color: 0x1c1f24,
    roughness: 0.82,
    metalness: 0.04,
  });
  const sockMat = new THREE.MeshStandardMaterial({
    color: 0x101215,
    roughness: 0.84,
    metalness: 0.02,
  });
  const gloveBaseMat = new THREE.MeshStandardMaterial({
    color: 0x181a1e,
    roughness: 0.52,
    metalness: 0.08,
  });
  const accentTrimMat = new THREE.MeshStandardMaterial({
    color: initialTeam === 'android' ? 0xd4ff1a : 0x38bdf8,
    roughness: 0.34,
    metalness: 0.14,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: initialTeam === 'android' ? 0xd9ff1f : 0xe2e8f0,
    roughness: 0.32,
    metalness: 0.18,
  });
  const soleMat = new THREE.MeshStandardMaterial({
    color: 0x111317,
    roughness: 0.55,
    metalness: 0.1,
  });

  // ─── 1. SCULPTED V-TAPER ATHLETIC TORSO (LatheGeometry) ────
  const torsoProfile = [
    new THREE.Vector2(0.01, -0.18),
    new THREE.Vector2(0.24, -0.16), // curved shirt hem
    new THREE.Vector2(0.225, 0.02), // tapered waist
    new THREE.Vector2(0.255, 0.24), // mid ribcage
    new THREE.Vector2(0.305, 0.48), // broad athletic chest
    new THREE.Vector2(0.29, 0.62),  // trapezius/shoulders
    new THREE.Vector2(0.14, 0.68),  // collar opening
    new THREE.Vector2(0.01, 0.68),
  ];
  const torsoGeo = new THREE.LatheGeometry(torsoProfile, 28);
  const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
  // Elliptical chest cross-section & rotate PI so LatheGeometry u=0.5 faces +Z
  torsoMesh.scale.set(1.16, 1.0, 0.66);
  torsoMesh.rotation.y = Math.PI;
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  body.add(torsoMesh);

  // Pelvis / shorts waist block seamlessly tucked beneath jersey hem
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.255, 18, 14), shortsMat);
  pelvis.scale.set(1.18, 0.72, 0.78);
  pelvis.position.set(0, -0.14, 0);
  pelvis.castShadow = true;
  body.add(pelvis);

  // ─── 2. SCULPTED HEAD, FACE, EARS, HAIR & NECK ────────────
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.67, 0.01);
  body.add(headPivot);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.106, 0.16, 16), skinMat);
  neck.position.set(0, 0.06, 0);
  neck.castShadow = true;
  headPivot.add(neck);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.195, 28, 22), faceMat);
  headMesh.scale.set(0.96, 1.12, 0.9);
  headMesh.rotation.y = -Math.PI / 2; // Centers painted face (u=0.5) toward +Z
  headMesh.position.set(0, 0.28, 0.01);
  headMesh.castShadow = true;
  headPivot.add(headMesh);

  // Subtle 3D cropped hair volume cap on crown
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.199, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.45),
    hairMat
  );
  hairCap.scale.set(0.93, 1.06, 0.98);
  hairCap.position.set(0, 0.31, -0.005);
  headPivot.add(hairCap);

  // Sculpted ears
  [-0.175, 0.175].forEach((ex) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 10), skinMat);
    ear.scale.set(0.55, 1.15, 0.75);
    ear.position.set(ex, 0.27, 0.0);
    headPivot.add(ear);
  });

  // ─── 3. ARTICULATED MUSCULAR ARMS + FINGERED GLOVES ────────
  const buildArm = (side: -1 | 1) => {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 0.35, 0.56, 0);
    body.add(shoulderPivot);

    // Rounded deltoid shoulder cap
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), sleeveMat);
    deltoid.scale.set(1.05, 1.0, 0.95);
    deltoid.castShadow = true;
    shoulderPivot.add(deltoid);

    // Short jersey sleeve
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.092, 0.27, 16), sleeveMat);
    sleeve.position.set(0, -0.13, 0);
    sleeve.castShadow = true;
    shoulderPivot.add(sleeve);

    // Exposed athletic bicep
    const bicep = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.13, 8, 14), skinMat);
    bicep.position.set(0, -0.29, 0);
    bicep.castShadow = true;
    shoulderPivot.add(bicep);

    // Elbow pivot for authentic goalkeeper crouch poise
    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.39, 0);
    shoulderPivot.add(elbowPivot);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.066, 0.22, 8, 14), skinMat);
    forearm.position.set(0, -0.14, 0);
    forearm.castShadow = true;
    elbowPivot.add(forearm);

    // Goalkeeper Grip Glove (wrist strap + palm + splayed thumb + 4 fingers)
    const gloveGroup = new THREE.Group();
    gloveGroup.position.set(0, -0.31, 0.02);
    elbowPivot.add(gloveGroup);

    const wristStrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.062, 0.064, 0.05, 12),
      accentTrimMat
    );
    wristStrap.position.set(0, 0.04, 0);
    gloveGroup.add(wristStrap);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.12, 0.055), gloveBaseMat);
    palm.position.set(0, -0.04, 0);
    palm.castShadow = true;
    gloveGroup.add(palm);

    // Splayed thumb pointing inward
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.019, 0.05, 6, 8), gloveBaseMat);
    thumb.position.set(-side * 0.072, -0.035, 0.02);
    thumb.rotation.z = -side * 0.65;
    thumb.rotation.x = 0.2;
    gloveGroup.add(thumb);

    // Four subtly curled goalkeeper fingers
    [-0.042, -0.014, 0.014, 0.042].forEach((fx, fi) => {
      const fLen = fi === 1 || fi === 2 ? 0.062 : 0.052;
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, fLen, 6, 8), gloveBaseMat);
      finger.position.set(fx, -0.125, 0.015);
      finger.rotation.x = 0.25;
      finger.rotation.z = fx * 2.2;
      gloveGroup.add(finger);
    });

    return { shoulderPivot, elbowPivot };
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // ─── 4. WIDE ATHLETIC CROUCH LEGS, HIGH SOCKS & NEON CLEATS ─
  const buildLeg = (side: -1 | 1) => {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.165, -0.16, 0);
    body.add(hipPivot);

    // Flared dark athletic shorts thigh
    const shortsLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.118, 0.34, 16),
      shortsMat
    );
    shortsLeg.position.set(0, -0.16, 0);
    shortsLeg.castShadow = true;
    hipPivot.add(shortsLeg);

    // Tanned muscular lower thigh & knee
    const lowerThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.11, 8, 14), skinMat);
    lowerThigh.position.set(0, -0.35, 0.01);
    lowerThigh.castShadow = true;
    hipPivot.add(lowerThigh);

    // Knee pivot
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.44, 0.01);
    hipPivot.add(kneePivot);

    // High black athletic soccer sock (tapered calf)
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.065, 0.42, 16), sockMat);
    sock.position.set(0, -0.21, 0);
    sock.castShadow = true;
    kneePivot.add(sock);

    // Subtle colored sock cuff band
    const sockBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.094, 0.092, 0.032, 16),
      accentTrimMat
    );
    sockBand.position.set(0, -0.03, 0);
    kneePivot.add(sockBand);

    // Sculpted Football Cleat (neon-lime for Android, titanium-silver for iPhone)
    const bootGroup = new THREE.Group();
    bootGroup.position.set(0, -0.44, 0.055);
    kneePivot.add(bootGroup);

    const bootUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.16, 8, 12), bootMat);
    bootUpper.rotation.x = Math.PI / 2;
    bootUpper.scale.set(1.0, 1.0, 0.78);
    bootUpper.castShadow = true;
    bootGroup.add(bootUpper);

    const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.25), soleMat);
    bootSole.position.set(0, -0.048, 0);
    bootGroup.add(bootSole);

    return { hipPivot, kneePivot };
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  // Ground contact shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.86, 24),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  root.add(shadow);

  // Apply the exact crouched goalkeeper ready stance from the reference image
  const setReadyPose = (elapsed: number, activeSway: boolean) => {
    const bounce = Math.abs(Math.sin(elapsed * 4.2));
    body.position.y = 1.055 + bounce * 0.05;
    body.rotation.x = 0.1;
    body.rotation.z = Math.sin(elapsed * 2.1) * 0.035;

    // Slight head lock on the ball
    headPivot.rotation.x = -0.08;
    headPivot.rotation.y = Math.sin(elapsed * 1.55) * 0.08;

    // Muscular arms bent outward & forward with open catch gloves
    leftArm.shoulderPivot.rotation.set(-0.12, 0.12, -0.42 - bounce * 0.08);
    leftArm.elbowPivot.rotation.set(-0.62, 0, 0.28);

    rightArm.shoulderPivot.rotation.set(-0.12, -0.12, 0.42 + bounce * 0.08);
    rightArm.elbowPivot.rotation.set(-0.62, 0, -0.28);

    // Wide crouched athletic knees
    leftLeg.hipPivot.rotation.set(-0.34, 0, -0.27);
    leftLeg.kneePivot.rotation.set(0.42, 0, 0.25);

    rightLeg.hipPivot.rotation.set(-0.34, 0, 0.27);
    rightLeg.kneePivot.rotation.set(0.42, 0, -0.25);

    if (activeSway) {
      root.position.x = Math.sin(elapsed * 1.55) * 0.62;
    }
  };

  setReadyPose(0, false);

  const updateJersey = (t: TeamId) => {
    torsoMat.map = kitTextures[t];
    torsoMat.needsUpdate = true;
    sleeveMat.color.setHex(t === 'android' ? 0x0e1113 : 0x151a22);
    accentTrimMat.color.setHex(t === 'android' ? 0xd4ff1a : 0x38bdf8);
    bootMat.color.setHex(t === 'android' ? 0xd9ff1f : 0xe2e8f0);
  };

  const dispose = () => {
    faceTexture.dispose();
    kitTextures.iphone.dispose();
    kitTextures.android.dispose();
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
  };

  return {
    root,
    body,
    headPivot,
    leftArmPivot: leftArm.shoulderPivot,
    leftElbowPivot: leftArm.elbowPivot,
    rightArmPivot: rightArm.shoulderPivot,
    rightElbowPivot: rightArm.elbowPivot,
    leftHipPivot: leftLeg.hipPivot,
    leftKneePivot: leftLeg.kneePivot,
    rightHipPivot: rightLeg.hipPivot,
    rightKneePivot: rightLeg.kneePivot,
    shadow,
    updateJersey,
    setReadyPose,
    dispose,
  };
}
