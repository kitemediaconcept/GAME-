import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { Volume2, VolumeX, ArrowLeft, Shield, ChevronsUp } from 'lucide-react';
import type {
  AttemptRecord,
  CampaignSettings,
  ParticipantSessionState,
  ShotOutcome,
  TeamId,
} from '../types.ts';
import {
  AIM_RANGE,
  BACK_Z,
  CURVE_WINDOW_HIGH,
  CURVE_WINDOW_LOW,
  evaluatePenaltyShot,
  GOAL_D,
  GOAL_H,
  GOAL_W,
  GOAL_Z,
} from '../lib/physics.ts';
import {
  createGoalNetTexture,
  createPerimeterBoardTexture,
  createPitchTexture,
} from '../lib/jerseyTextures.ts';
import { createGoalkeeperRig } from '../lib/goalkeeperModel.ts';
import { createPhoneCrowd } from '../lib/phoneCrowd.ts';
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  submitShotFirestore,
} from '../lib/firestoreCampaign.ts';

interface PenaltyGame3DProps {
  mode: 'campaign' | 'practice';
  team: TeamId;
  totalAttempts?: number;
  settings?: CampaignSettings;
  session?: ParticipantSessionState | null;
  onTeamChangePractice?: (team: TeamId) => void;
  onSessionUpdate?: (session: ParticipantSessionState) => void;
  onCampaignComplete?: (session: ParticipantSessionState) => void;
  onExit: () => void;
}

const CAM_KICKER = { px: 0, py: 3.15, pz: 7.5, lx: 0, ly: 1.45, lz: -13.5 };
const CAM_GK = { px: 0, py: 6.4, pz: -20.5, lx: 0, ly: 1.1, lz: -6 };
const GK_CURSOR_LIFETIME_MS = 1000;

function playSynthSound(
  type: 'kick' | 'goal' | 'save' | 'miss' | 'target',
  muted: boolean
) {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'kick') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(175, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (type === 'goal') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.09);
      osc.frequency.setValueAtTime(783.99, now + 0.18);
      osc.frequency.setValueAtTime(1046.5, now + 0.28);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.start(now);
      osc.stop(now + 0.66);
    } else if (type === 'target') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.26);
    } else if (type === 'save') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.22);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(270, now);
      osc.frequency.exponentialRampToValueAtTime(130, now + 0.26);
      gain.gain.setValueAtTime(0.13, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.29);
    }
    setTimeout(() => ctx.close().catch(() => undefined), 750);
  } catch {
    // Ignore autoplay blocks
  }
}

export function PenaltyGame3D({
  mode,
  team,
  totalAttempts = 5,
  settings = DEFAULT_CAMPAIGN_SETTINGS,
  session,
  onTeamChangePractice,
  onSessionUpdate,
  onCampaignComplete,
  onExit,
}: PenaltyGame3DProps) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const powerRingRef = useRef<HTMLDivElement | null>(null);
  const messageRef = useRef<HTMLDivElement | null>(null);

  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  const [webglError, setWebglError] = useState<string | null>(null);
  const [practiceRole, setPracticeRole] = useState<'KICKER' | 'GOALKEEPER'>('KICKER');
  const [practiceGoals, setPracticeGoals] = useState(0);
  const [practiceSaves, setPracticeSaves] = useState(0);
  const [practiceLevel, setPracticeLevel] = useState(1);
  const [actionLabel, setActionLabel] = useState('HOLD');
  const [isCharging, setIsCharging] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState<{
    text: string;
    subtext?: string;
    color: string;
  }>({
    text: 'GOAL!',
    color: '#d9ff70',
  });
  const [showSwipeCue, setShowSwipeCue] = useState(true);

  // Synced refs so Three.js mounts once and never tears down on UI updates
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const teamRef = useRef(team);
  teamRef.current = team;

  const sessionRef = useRef(session ?? null);
  sessionRef.current = session ?? null;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const totalAttemptsRef = useRef(totalAttempts);
  totalAttemptsRef.current = totalAttempts;

  const onSessionUpdateRef = useRef(onSessionUpdate);
  onSessionUpdateRef.current = onSessionUpdate;

  const onCampaignCompleteRef = useRef(onCampaignComplete);
  onCampaignCompleteRef.current = onCampaignComplete;

  const engineRef = useRef<{
    startPowering: () => void;
    commitKick: () => void;
    gkAction: () => void;
    switchPracticeRole: (role: 'KICKER' | 'GOALKEEPER') => void;
    updateJersey: (t: TeamId) => void;
    beginSwipe: (clientX: number, clientY: number) => void;
    moveSwipe: (clientX: number, clientY: number) => void;
    endSwipe: (clientX: number, clientY: number) => void;
    cancelSwipe: () => void;
  } | null>(null);

  useEffect(() => {
    engineRef.current?.updateJersey(team);
  }, [team]);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL is unavailable on this browser.');
      return;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // ─── SCENE & ENVIRONMENT ──────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x091a28);
    scene.fog = new THREE.FogExp2(0x091a28, 0.011);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camRig = {
      px: CAM_KICKER.px,
      py: CAM_KICKER.py,
      pz: CAM_KICKER.pz,
      lx: CAM_KICKER.lx,
      ly: CAM_KICKER.ly,
      lz: CAM_KICKER.lz,
      fovOffset: 0,
    };
    let baseFov = 62;
    let cameraShake = 0;

    const camera = new THREE.PerspectiveCamera(baseFov, width / height, 0.1, 220);
    camera.position.set(camRig.px, camRig.py, camRig.pz);
    camera.lookAt(camRig.lx, camRig.ly, camRig.lz);

    // Three-point floodlit stadium lights
    scene.add(new THREE.HemisphereLight(0xc2dcff, 0x163d1e, 0.68));

    const keyLight = new THREE.DirectionalLight(0xfff5e4, 1.38);
    keyLight.position.set(10, 24, 14);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(2048, 2048);
    Object.assign(keyLight.shadow.camera, {
      near: 0.5,
      far: 70,
      left: -26,
      right: 26,
      top: 26,
      bottom: -26,
    });
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x84ccff, 0.58);
    rimLight.position.set(-12, 16, -24);
    scene.add(rimLight);

    // Goal-celebration floodlight flash
    const celebrationLight = new THREE.PointLight(0xd9ff70, 0, 32);
    celebrationLight.position.set(0, 6.5, -13);
    scene.add(celebrationLight);

    // ─── PITCH & PERIMETER BOARDS ─────────────────────────────
    const pitchTexture = createPitchTexture(maxAniso);
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(56, 56),
      new THREE.MeshStandardMaterial({ map: pitchTexture, roughness: 0.9, metalness: 0 })
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(0, 0, -6);
    pitch.receiveShadow = true;
    scene.add(pitch);

    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 180),
      new THREE.MeshStandardMaterial({ color: 0x0d2817, roughness: 0.96, metalness: 0 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, -0.04, -10);
    scene.add(apron);

    const boardTex = createPerimeterBoardTexture(maxAniso);
    const boardMat = new THREE.MeshStandardMaterial({
      map: boardTex,
      emissiveMap: boardTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.4,
      roughness: 0.35,
      metalness: 0.1,
    });
    const backBoard = new THREE.Mesh(new THREE.BoxGeometry(52, 1.1, 0.26), boardMat);
    backBoard.position.set(0, 0.55, -19.2);
    scene.add(backBoard);

    // ─── GOALPOSTS & DEFORMABLE NET ───────────────────────────
    const goalGroup = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.24,
      metalness: 0.38,
    });
    const addCylinderPost = (
      radius: number,
      len: number,
      x: number,
      y: number,
      z: number,
      rx = 0,
      rz = 0
    ) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 16), postMat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      m.castShadow = m.receiveShadow = true;
      goalGroup.add(m);
    };
    addCylinderPost(0.11, GOAL_H, -GOAL_W / 2, GOAL_H / 2, GOAL_Z);
    addCylinderPost(0.11, GOAL_H, GOAL_W / 2, GOAL_H / 2, GOAL_Z);
    addCylinderPost(0.11, GOAL_W + 0.22, 0, GOAL_H, GOAL_Z, 0, Math.PI / 2);
    addCylinderPost(0.06, GOAL_H, -GOAL_W / 2, GOAL_H / 2, BACK_Z);
    addCylinderPost(0.06, GOAL_H, GOAL_W / 2, GOAL_H / 2, BACK_Z);
    addCylinderPost(0.06, GOAL_W, 0, GOAL_H, BACK_Z, 0, Math.PI / 2);
    addCylinderPost(0.06, GOAL_D, -GOAL_W / 2, GOAL_H, GOAL_Z - GOAL_D / 2, Math.PI / 2, 0);
    addCylinderPost(0.06, GOAL_D, GOAL_W / 2, GOAL_H, GOAL_Z - GOAL_D / 2, Math.PI / 2, 0);
    addCylinderPost(0.06, GOAL_D, -GOAL_W / 2, 0.06, GOAL_Z - GOAL_D / 2, Math.PI / 2, 0);
    addCylinderPost(0.06, GOAL_D, GOAL_W / 2, 0.06, GOAL_Z - GOAL_D / 2, Math.PI / 2, 0);

    const backNetTex = createGoalNetTexture(maxAniso);
    backNetTex.repeat.set(28, 10);
    const sideNetTex = createGoalNetTexture(maxAniso);
    sideNetTex.repeat.set(7, 10);
    const topNetTex = createGoalNetTexture(maxAniso);
    topNetTex.repeat.set(28, 7);

    const makeNetMat = (map: THREE.CanvasTexture) =>
      new THREE.MeshStandardMaterial({
        map,
        color: 0xf1f5f9,
        transparent: true,
        opacity: 0.72,
        alphaTest: 0.06,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 0.85,
      });

    const backNetMat = makeNetMat(backNetTex);
    const sideNetMat = makeNetMat(sideNetTex);
    const topNetMat = makeNetMat(topNetTex);

    const backNetGeometry = new THREE.PlaneGeometry(GOAL_W, GOAL_H, 28, 14);
    const backNetMesh = new THREE.Mesh(backNetGeometry, backNetMat);
    backNetMesh.position.set(0, GOAL_H / 2, BACK_Z);
    goalGroup.add(backNetMesh);

    [
      [Math.PI / 2, -GOAL_W / 2],
      [-Math.PI / 2, GOAL_W / 2],
    ].forEach(([ry, px]) => {
      const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, GOAL_H, 8, 10), sideNetMat);
      sideNet.rotation.y = ry;
      sideNet.position.set(px, GOAL_H / 2, GOAL_Z - GOAL_D / 2);
      goalGroup.add(sideNet);
    });
    const topNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, GOAL_D, 20, 8), topNetMat);
    topNet.rotation.x = Math.PI / 2;
    topNet.position.set(0, GOAL_H, GOAL_Z - GOAL_D / 2);
    goalGroup.add(topNet);
    scene.add(goalGroup);

    // ─── DRIMIFY-STYLE CORNER TARGET BULLSEYES INSIDE THE GOAL ─
    const makeCornerTarget = (x: number, y: number) => {
      const g = new THREE.Group();
      const outer = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.78, 32),
        new THREE.MeshBasicMaterial({
          color: 0xd9ff70,
          transparent: true,
          opacity: 0.62,
          side: THREE.DoubleSide,
        })
      );
      const inner = new THREE.Mesh(
        new THREE.RingGeometry(0.26, 0.38, 28),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
        })
      );
      const center = new THREE.Mesh(
        new THREE.CircleGeometry(0.12, 20),
        new THREE.MeshBasicMaterial({
          color: 0xd9ff70,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        })
      );
      g.add(outer, inner, center);
      g.position.set(x, y, GOAL_Z - 0.12);
      scene.add(g);
      return g;
    };
    const leftTarget = makeCornerTarget(-4.65, 2.95);
    const rightTarget = makeCornerTarget(4.65, 2.95);

    const flashCornerTarget = (targetGroup: THREE.Group) => {
      playSynthSound('target', mutedRef.current);
      gsap.fromTo(
        targetGroup.scale,
        { x: 1, y: 1, z: 1 },
        {
          x: 1.75,
          y: 1.75,
          z: 1.75,
          duration: 0.28,
          ease: 'power2.out',
          yoyo: true,
          repeat: 1,
        }
      );
    };

    // ─── STADIUM STANDS, FLOODLIGHTS & INSTANCED CROWD ────────
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x16202a,
      roughness: 0.85,
      metalness: 0.1,
    });
    for (let tier = 0; tier < 5; tier++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(58 - tier * 1.4, 1.3, 2.2), standMat);
      s.position.set(0, 1.6 + tier * 1.85, -21 - tier * 2.1);
      scene.add(s);
    }
    for (let side = -1; side <= 1; side += 2) {
      for (let tier = 0; tier < 4; tier++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 56 - tier * 2), standMat);
        s.position.set(side * (27 + tier * 2.1), 1.6 + tier * 1.85, -8);
        scene.add(s);
      }
    }
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(62, 0.55, 9),
      new THREE.MeshStandardMaterial({ color: 0x0e161f, roughness: 0.6, metalness: 0.35 })
    );
    roof.position.set(0, 13.2, -27);
    scene.add(roof);

    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x4b5563,
      roughness: 0.45,
      metalness: 0.7,
    });
    const floodMat = new THREE.MeshBasicMaterial({ color: 0xfffce8 });
    [
      [-23, -23],
      [23, -23],
      [-23, 5],
      [23, 5],
    ].forEach(([px, pz]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 14, 10), pylonMat);
      pole.position.set(px, 7, pz);
      scene.add(pole);
      const bank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.75, 0.7), floodMat);
      bank.position.set(px, 14.1, pz);
      bank.lookAt(0, 0, -10);
      scene.add(bank);
    });

    // Animated iPhone vs Android Smartphone Audience Gallery
    const phoneCrowd = createPhoneCrowd(maxAniso);
    scene.add(phoneCrowd.group);

    // ─── SOCCER BALL + CONTACT SHADOW + STRIKE SHOCKWAVE RING ─
    const ball = new THREE.Group();
    (function buildSoccerBall() {
      const whiteMat = new THREE.MeshStandardMaterial({
        color: 0xf7f7f4,
        roughness: 0.38,
        metalness: 0.06,
      });
      const blackMat = new THREE.MeshStandardMaterial({
        color: 0x16191d,
        roughness: 0.62,
        metalness: 0.05,
      });
      const s = 0.104;
      const lw = 0.007;
      const phi = (1 + Math.sqrt(5)) / 2;
      const ba = 0,
        bb = s,
        bc = 2 * s,
        bd = phi * s,
        be = 3 * bd,
        bf = (1 + 2 * phi) * s,
        bg = (2 + phi) * s,
        bh = 2 * phi * s;
      const cords = [
        [+ba, +bb, +be], [+ba, +bb, -be], [+ba, -bb, +be], [+ba, -bb, -be], [+bb, +be, +ba], [+bb, -be, +ba],
        [-bb, +be, +ba], [-bb, -be, +ba], [+be, +ba, +bb], [-be, +ba, +bb], [+be, +ba, -bb], [-be, +ba, -bb],
        [+bc, +bf, +bd], [+bc, +bf, -bd], [+bc, -bf, +bd], [-bc, +bf, +bd], [+bc, -bf, -bd], [-bc, +bf, -bd],
        [-bc, -bf, +bd], [-bc, -bf, -bd], [+bf, +bd, +bc], [+bf, -bd, +bc], [-bf, +bd, +bc], [+bf, +bd, -bc],
        [-bf, -bd, +bc], [+bf, -bd, -bc], [-bf, +bd, -bc], [-bf, -bd, -bc], [+bd, +bc, +bf], [-bd, +bc, +bf],
        [+bd, +bc, -bf], [+bd, -bc, +bf], [-bd, +bc, -bf], [-bd, -bc, +bf], [+bd, -bc, -bf], [-bd, -bc, -bf],
        [+bb, +bg, +bh], [+bb, +bg, -bh], [+bb, -bg, +bh], [-bb, +bg, +bh], [+bb, -bg, -bh], [-bb, +bg, -bh],
        [-bb, -bg, +bh], [-bb, -bg, -bh], [+bg, +bh, +bb], [+bg, -bh, +bb], [-bg, +bh, +bb], [+bg, +bh, -bb],
        [-bg, -bh, +bb], [+bg, -bh, -bb], [-bg, +bh, -bb], [-bg, -bh, -bb], [+bh, +bb, +bg], [-bh, +bb, +bg],
        [+bh, +bb, -bg], [+bh, -bb, +bg], [-bh, +bb, -bg], [-bh, -bb, +bg], [+bh, -bb, -bg], [-bh, -bb, -bg],
      ];
      const p0 = new THREE.Vector3(0, 0, 0);
      const radius = new THREE.Vector3(...cords[0]).distanceTo(p0);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.985, 36, 36), whiteMat);
      sphere.castShadow = true;
      ball.add(sphere);

      const fc = [
        [0, 28, 36, 39, 29], [1, 32, 41, 37, 30], [2, 33, 42, 38, 31], [3, 34, 40, 43, 35],
        [4, 12, 44, 47, 13], [5, 16, 49, 45, 14], [6, 17, 50, 46, 15], [7, 18, 48, 51, 19],
        [8, 20, 52, 55, 21], [9, 24, 57, 53, 22], [10, 25, 58, 54, 23], [11, 26, 56, 59, 27],
      ];
      const idx: number[] = [];
      fc.forEach((f) => {
        for (let j = 0; j < f.length - 2; j++) idx.push(f[0], f[j + 1], f[j + 2]);
      });
      const pentagons = new THREE.Mesh(
        new THREE.PolyhedronGeometry(cords.flat(), idx, radius * 1.002, 2),
        blackMat
      );
      pentagons.castShadow = true;
      ball.add(pentagons);

      for (let i = 0; i < cords.length; i++) {
        for (let j = i + 1; j < cords.length; j++) {
          const p1 = new THREE.Vector3(...cords[i]);
          const p2 = new THREE.Vector3(...cords[j]);
          if (p1.distanceTo(p2) > bc * 1.1) continue;
          const mid = p1.clone().add(p2).multiplyScalar(0.5);
          const sc = p1.distanceTo(p0) / mid.distanceTo(p0);
          const curve = new THREE.QuadraticBezierCurve3(p1, mid.multiplyScalar(sc * sc), p2);
          ball.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 4, lw, 4, false), blackMat));
        }
      }
    })();
    ball.position.set(0, 0.5, 0);
    scene.add(ball);

    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), shadowMat);
    ballShadow.rotation.x = -Math.PI / 2;
    ballShadow.position.y = 0.02;
    scene.add(ballShadow);

    // Expanding turf shockwave ring on kick impact
    const shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0xd9ff70,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const shockwaveRing = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.62, 32), shockwaveMat);
    shockwaveRing.rotation.x = -Math.PI / 2;
    shockwaveRing.position.set(0, 0.035, 0);
    scene.add(shockwaveRing);

    const triggerKickShockwave = () => {
      shockwaveRing.scale.setScalar(0.5);
      shockwaveMat.opacity = 0.9;
      gsap.to(shockwaveRing.scale, { x: 3.4, y: 3.4, z: 3.4, duration: 0.42, ease: 'power2.out' });
      gsap.to(shockwaveMat, { opacity: 0, duration: 0.42, ease: 'power2.out' });
    };

    const updateBallShadow = () => {
      const h = Math.max(0, ball.position.y - 0.5);
      const hf = Math.max(0, 1 - h / 5);
      ballShadow.position.x = ball.position.x - h * 0.25;
      ballShadow.position.z = ball.position.z - h * 0.18;
      ballShadow.scale.setScalar(0.52 + hf * 0.48);
      shadowMat.opacity = 0.05 + hf * 0.35;
    };

    // ─── LIVE SWIPE 3D TRAJECTORY DOTS (Drimify Aim Arc!) ─────
    const ARC_DOT_COUNT = 16;
    const arcDots: THREE.Mesh[] = [];
    const arcDotGeo = new THREE.SphereGeometry(0.11, 10, 10);
    for (let i = 0; i < ARC_DOT_COUNT; i++) {
      const t = (i + 1) / ARC_DOT_COUNT;
      const mat = new THREE.MeshBasicMaterial({
        color: i > ARC_DOT_COUNT - 4 ? 0xffffff : 0xd9ff70,
        transparent: true,
        opacity: 0.9 - t * 0.35,
      });
      const dot = new THREE.Mesh(arcDotGeo, mat);
      dot.visible = false;
      scene.add(dot);
      arcDots.push(dot);
    }

    const updateTrajectoryArc = (aimVal: number, pwr: number, visible: boolean) => {
      if (!visible) {
        for (let i = 0; i < ARC_DOT_COUNT; i++) arcDots[i].visible = false;
        return;
      }
      const pf = Math.max(0.08, Math.min(1, pwr / 100));
      const finalY = 0.2 + 7.5 * pf * (1 - 0.52 * pf);
      let curveFactor = 0;
      if (pf >= CURVE_WINDOW_LOW && pf <= CURVE_WINDOW_HIGH) {
        curveFactor = Math.sin(
          (Math.PI * (pf - CURVE_WINDOW_LOW)) / (CURVE_WINDOW_HIGH - CURVE_WINDOW_LOW)
        );
      }
      const rawAimX = aimVal * AIM_RANGE;
      const finalX = rawAimX - rawAimX * 0.75 * curveFactor;
      const ctrlBow = curveFactor * (rawAimX - finalX) * 0.9;
      const arcH = 1.0 + pf * 4.8;

      const startX = 0,
        startY = 0.5,
        startZ = 0;
      const ctrlX = finalX + ctrlBow,
        ctrlY = finalY + arcH,
        ctrlZ = -8;
      const endX = finalX,
        endY = finalY,
        endZ = -15.2;

      for (let i = 0; i < ARC_DOT_COUNT; i++) {
        const t = (i + 1) / (ARC_DOT_COUNT + 1);
        const u = 1 - t;
        const dot = arcDots[i];
        dot.position.set(
          u * u * startX + 2 * u * t * ctrlX + t * t * endX,
          Math.max(0.15, u * u * startY + 2 * u * t * ctrlY + t * t * endY),
          u * u * startZ + 2 * u * t * ctrlZ + t * t * endZ
        );
        dot.scale.setScalar(1.15 - t * 0.45);
        dot.visible = true;
      }
    };

    // ─── POOLED SPARKLE TRAIL & GOAL CONFETTI / TURF PARTICLES ─
    const SPARKLE_POOL = 34;
    const sparkleGeo = new THREE.SphereGeometry(0.09, 6, 6);
    const sparkles: Array<{ mesh: THREE.Mesh; life: number }> = [];
    for (let i = 0; i < SPARKLE_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xd9ff70, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(sparkleGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      sparkles.push({ mesh, life: 0 });
    }
    let sparkleCursor = 0;
    const spawnSparkle = (x: number, y: number, z: number) => {
      const sp = sparkles[sparkleCursor % SPARKLE_POOL];
      sparkleCursor++;
      sp.mesh.position.set(x, y, z);
      sp.mesh.scale.setScalar(1.05);
      sp.mesh.visible = true;
      (sp.mesh.material as THREE.MeshBasicMaterial).opacity = 0.92;
      sp.life = 1;
    };

    // Celebration confetti + turf splash particle pool (zero per-frame allocations)
    const PARTICLE_POOL = 90;
    const particleGeo = new THREE.BoxGeometry(0.14, 0.14, 0.04);
    const particles: Array<{
      mesh: THREE.Mesh;
      vx: number;
      vy: number;
      vz: number;
      vrx: number;
      vry: number;
      life: number;
    }> = [];
    const CONFETTI_COLORS = [0xd9ff70, 0xffffff, 0x38bdf8, 0x22c55e, 0xfbbf24];
    for (let i = 0; i < PARTICLE_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(particleGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      particles.push({ mesh, vx: 0, vy: 0, vz: 0, vrx: 0, vry: 0, life: 0 });
    }
    let particleCursor = 0;

    const spawnBurst = (
      x: number,
      y: number,
      z: number,
      count: number,
      colorOverride?: number,
      spread = 5.5,
      upward = 6.5
    ) => {
      for (let i = 0; i < count; i++) {
        const p = particles[particleCursor % PARTICLE_POOL];
        particleCursor++;
        p.mesh.position.set(x, y, z);
        p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        p.mesh.scale.setScalar(colorOverride ? 0.7 : 1.15);
        p.mesh.visible = true;
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.color.setHex(
          colorOverride ?? CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
        );
        mat.opacity = 1;
        p.vx = (Math.random() - 0.5) * spread;
        p.vy = 1.8 + Math.random() * upward;
        p.vz = (Math.random() - 0.5) * spread;
        p.vrx = (Math.random() - 0.5) * 10;
        p.vry = (Math.random() - 0.5) * 10;
        p.life = 1.1 + Math.random() * 0.65;
      }
    };

    // ─── CURSORS ──────────────────────────────────────────────
    const makeCursorGroup = (dotColor: number) => {
      const g = new THREE.Group();
      g.add(
        new THREE.Mesh(
          new THREE.CircleGeometry(0.38, 32),
          new THREE.MeshBasicMaterial({ color: dotColor, side: THREE.DoubleSide })
        )
      );
      g.add(
        new THREE.Mesh(
          new THREE.RingGeometry(0.38, 0.48, 32),
          new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        )
      );
      return g;
    };

    const aimCursor = makeCursorGroup(0xef4444);
    aimCursor.position.set(0, GOAL_H / 2, BACK_Z + 0.08);
    scene.add(aimCursor);

    const catchCursor = makeCursorGroup(0xd9ff70);
    catchCursor.visible = false;
    scene.add(catchCursor);

    // ─── SCULPTED ATHLETIC 3D GOALKEEPER RIG ──────────────────
    const goalieRig = createGoalkeeperRig(teamRef.current, maxAniso);
    const goalieGroup = goalieRig.root;
    goalieGroup.scale.setScalar(1.16);
    goalieGroup.position.set(0, 0, -14.45);
    scene.add(goalieGroup);

    const updateJersey = (t: TeamId) => {
      goalieRig.updateJersey(t);
    };

    // ─── AI KICKER FIGURE (Practice GK Mode) ──────────────────
    const kickerGroup = new THREE.Group();
    const kickerTorso = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 1.1, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.7 })
    );
    kickerTorso.position.set(0, 1.5, 0);
    kickerTorso.castShadow = true;
    kickerGroup.add(kickerTorso);
    const kickerSkinMat = new THREE.MeshStandardMaterial({ color: 0xc88446, roughness: 0.72 });
    const kickerHead = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 14), kickerSkinMat);
    kickerHead.position.set(0, 2.28, 0);
    kickerGroup.add(kickerHead);
    kickerGroup.rotation.y = Math.PI;
    kickerGroup.visible = false;
    scene.add(kickerGroup);

    // ─── INTERNAL ENGINE STATE ────────────────────────────────
    let currentRole: 'KICKER' | 'GOALKEEPER' = 'KICKER';
    let kickerState: 'AIMING' | 'POWERING' | 'SWIPING' | 'KICKING' = 'AIMING';
    let gkState: 'GK_IDLE' | 'GK_PENDING' | 'GK_REACTING' | 'GK_ANIMATING' | 'GK_RESULT' = 'GK_IDLE';

    let aimValue = 0;
    let aimDirection = 1;
    let power = 0;
    let powerDirection = 1;
    let practiceDiffKicker = 1;
    let practiceDiffGk = 1;
    let practiceConsecSaves = 0;
    let practiceConsecMisses = 0;

    // Swipe gesture tracking
    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeStartTime = 0;
    let swipeAim = 0;
    let swipePower = 50;

    let gkFinalX = 0;
    let gkFinalY = 0;
    let gkRevealTime = 0;

    let flightTween: gsap.core.Tween | null = null;
    let goalieTimeline: gsap.core.Timeline | null = null;
    let cameraTween: gsap.core.Tween | null = null;
    let gkReactTimeout = 0;
    let gkCountdownTimeout = 0;
    let resetTimeout = 0;
    let cheerBoost = 0;
    let disposed = false;

    const setPowerRing = (p: number) => {
      const ring = powerRingRef.current;
      if (!ring) return;
      const t = p / 100;
      const inSweet = t >= CURVE_WINDOW_LOW && t <= CURVE_WINDOW_HIGH;
      let r: number;
      let g: number;
      let b = 45;
      if (inSweet) {
        r = 217;
        g = 255;
        b = 112;
      } else if (t < CURVE_WINDOW_LOW) {
        r = Math.round(70 + t * 220);
        g = Math.round(220 - t * 40);
      } else {
        r = Math.round(235 + (t - 0.55) * 40);
        g = Math.round(165 - (t - 0.55) * 280);
      }
      ring.style.transform = `scale(${(0.6 + t * 0.42).toFixed(3)})`;
      ring.style.opacity = (0.14 + t * 0.78).toFixed(3);
      ring.style.background = `radial-gradient(circle, transparent 30%, rgba(${r},${Math.max(30, g)},${b},0.88) 30%)`;
    };

    const showOverlay = (result: ShotOutcome, isTopCorner = false) => {
      const text = result === 'GOAL' ? 'GOAL!' : result === 'SAVE' ? 'SAVED!' : 'MISS!';
      const subtext =
        result === 'GOAL' && isTopCorner
          ? 'TOP CORNER BEAUTY'
          : result === 'GOAL'
            ? 'BACK OF THE NET'
            : result === 'SAVE'
              ? 'KEEPER PARRY'
              : 'OFF TARGET';
      const color = result === 'GOAL' ? '#d9ff70' : result === 'SAVE' ? '#fbbf24' : '#f87171';
      setOverlayText({ text, subtext, color });
      const el = messageRef.current;
      if (!el) return;
      gsap.killTweensOf(el);
      gsap.fromTo(
        el,
        { opacity: 0, scale: 0.45, y: 18 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.36,
          ease: 'back.out(2.1)',
          onComplete: () => {
            gsap.to(el, { opacity: 0, scale: 0.92, duration: 0.32, delay: 1.05 });
          },
        }
      );
    };

    const animateNetRipple = (hitX: number, hitY: number) => {
      const pos = backNetGeometry.attributes.position;
      const n = pos.count;
      const oz = Array.from({ length: n }, (_, i) => pos.getZ(i));
      const lhx = hitX;
      const lhy = hitY - GOAL_H / 2;
      const d = Array.from({ length: n }, (_, i) =>
        Math.hypot(pos.getX(i) - lhx, pos.getY(i) - lhy)
      );
      const proxy = { t: 0 };
      gsap.to(proxy, {
        t: 1,
        duration: 1.5,
        ease: 'none',
        onUpdate: () => {
          for (let i = 0; i < n; i++) {
            const di = d[i];
            if (di > 6.5) {
              pos.setZ(i, oz[i]);
              continue;
            }
            const ib = Math.max(0, (2.3 - di) / 2.3) * 2.75 * Math.max(0, 1 - proxy.t * 2.6);
            const env = Math.max(0, 1 - di / 6.5);
            const rip =
              Math.sin(di * 2.9 - proxy.t * 5.8 * 2.9) *
              env *
              Math.max(0, 1 - proxy.t * 0.85) *
              1.75;
            pos.setZ(i, oz[i] - ib - (di < proxy.t * 5.8 + 0.5 ? rip : 0));
          }
          pos.needsUpdate = true;
        },
        onComplete: () => {
          for (let i = 0; i < n; i++) pos.setZ(i, oz[i]);
          pos.needsUpdate = true;
        },
      });
    };

    const goalieAnimTargets = [
      goalieGroup.position,
      goalieRig.body.position,
      goalieRig.body.rotation,
      goalieRig.headPivot.rotation,
      goalieRig.leftArmPivot.rotation,
      goalieRig.leftElbowPivot.rotation,
      goalieRig.rightArmPivot.rotation,
      goalieRig.rightElbowPivot.rotation,
      goalieRig.leftHipPivot.rotation,
      goalieRig.leftKneePivot.rotation,
      goalieRig.rightHipPivot.rotation,
      goalieRig.rightKneePivot.rotation,
    ];

    const resetGoalie = () => {
      goalieTimeline?.kill();
      gsap.killTweensOf(goalieAnimTargets);
      gsap.to(goalieGroup.position, { x: 0, y: 0, duration: 0.55, ease: 'power2.out' });
      gsap.to(goalieRig.body.position, { y: 1.055, duration: 0.45, ease: 'power2.out' });
      gsap.to(goalieRig.body.rotation, { x: 0.1, y: 0, z: 0, duration: 0.45, ease: 'power2.out' });
      gsap.to(goalieRig.headPivot.rotation, { x: -0.08, y: 0, z: 0, duration: 0.4 });
      gsap.to(goalieRig.leftArmPivot.rotation, { x: -0.12, y: 0.12, z: -0.42, duration: 0.4 });
      gsap.to(goalieRig.leftElbowPivot.rotation, { x: -0.62, y: 0, z: 0.28, duration: 0.4 });
      gsap.to(goalieRig.rightArmPivot.rotation, { x: -0.12, y: -0.12, z: 0.42, duration: 0.4 });
      gsap.to(goalieRig.rightElbowPivot.rotation, { x: -0.62, y: 0, z: -0.28, duration: 0.4 });
      gsap.to(goalieRig.leftHipPivot.rotation, { x: -0.34, y: 0, z: -0.27, duration: 0.4 });
      gsap.to(goalieRig.leftKneePivot.rotation, { x: 0.42, y: 0, z: 0.25, duration: 0.4 });
      gsap.to(goalieRig.rightHipPivot.rotation, { x: -0.34, y: 0, z: 0.27, duration: 0.4 });
      gsap.to(goalieRig.rightKneePivot.rotation, { x: 0.42, y: 0, z: -0.25, duration: 0.4 });
    };

    // Expressive Drimify-style full-extension horizontal goalkeeper Superman dive!
    const triggerGoalieDive = (finalX: number, finalY: number, isSave: boolean, diff: number) => {
      goalieTimeline?.kill();
      gsap.killTweensOf(goalieAnimTargets);

      const clampedTarget = Math.max(-GOAL_W / 2 + 0.45, Math.min(GOAL_W / 2 - 0.45, finalX));
      const diveX = isSave ? clampedTarget : clampedTarget * 0.64;
      const dir = diveX === 0 ? 1 : diveX > 0 ? 1 : -1;
      const diveMagnitude = Math.min(1, Math.abs(diveX) / 4.2);

      const t = (Math.min(10, Math.max(1, diff)) - 1) / 9;
      const airDur = isSave ? 0.48 - t * 0.1 : 0.6 - t * 0.12;
      const peakHeight = Math.max(0.35, Math.min(1.85, (finalY - 0.85) * 0.82));
      const fullRoll = -dir * (0.45 + diveMagnitude * 0.92); // up to ~78 deg full horizontal dive!

      const tl = gsap.timeline();
      goalieTimeline = tl;

      // 1. Explosive crouch & launch horizontally
      tl.to(goalieRig.body.position, { y: 0.84, duration: 0.08, ease: 'power2.in' }, 0);
      tl.to(
        goalieGroup.position,
        { x: diveX, duration: airDur + 0.14, ease: 'power2.out' },
        0.06
      );

      // 2. Airborne Superman extension arc
      tl.to(
        goalieGroup.position,
        {
          y: peakHeight,
          duration: airDur * 0.56,
          ease: 'power2.out',
        },
        0.07
      );
      tl.to(
        goalieRig.body.rotation,
        {
          z: fullRoll,
          x: 0.18,
          duration: airDur * 0.72,
          ease: 'power2.out',
        },
        0.07
      );
      tl.to(
        goalieRig.headPivot.rotation,
        { x: -0.15, y: dir * 0.28, duration: airDur * 0.5 },
        0.07
      );
      // Both arms & elbows stretch straight toward the diving direction!
      tl.to(
        goalieRig.leftArmPivot.rotation,
        { z: dir < 0 ? -2.75 : -2.2, x: -0.22, y: 0, duration: airDur * 0.65, ease: 'power2.out' },
        0.07
      );
      tl.to(
        goalieRig.leftElbowPivot.rotation,
        { x: -0.08, y: 0, z: 0, duration: airDur * 0.55, ease: 'power2.out' },
        0.07
      );
      tl.to(
        goalieRig.rightArmPivot.rotation,
        { z: dir > 0 ? 2.75 : 2.2, x: -0.22, y: 0, duration: airDur * 0.65, ease: 'power2.out' },
        0.07
      );
      tl.to(
        goalieRig.rightElbowPivot.rotation,
        { x: -0.08, y: 0, z: 0, duration: airDur * 0.55, ease: 'power2.out' },
        0.07
      );
      // Trailing legs extend dynamically in mid-air
      tl.to(goalieRig.leftHipPivot.rotation, { z: -dir * 0.25, x: 0.22, duration: airDur * 0.6 }, 0.08);
      tl.to(goalieRig.leftKneePivot.rotation, { x: 0.18, z: 0, duration: airDur * 0.6 }, 0.08);
      tl.to(goalieRig.rightHipPivot.rotation, { z: -dir * 0.14, x: -0.18, duration: airDur * 0.6 }, 0.08);
      tl.to(goalieRig.rightKneePivot.rotation, { x: 0.24, z: 0, duration: airDur * 0.6 }, 0.08);

      // 3. Turf landing slide + grass spray particles
      tl.to(
        goalieGroup.position,
        {
          y: 0,
          duration: 0.32,
          ease: 'power2.in',
          onComplete: () => {
            spawnBurst(goalieGroup.position.x, 0.2, goalieGroup.position.z, 10, 0x22c55e, 2.8, 2.4);
          },
        },
        0.07 + airDur * 0.58
      );
      tl.to(goalieRig.body.position, { y: 0.52, duration: 0.24, ease: 'power2.out' }, 0.07 + airDur * 0.65);

      // 4. Post-shot reaction (fist pump on save, slump on goal)
      if (isSave) {
        tl.to(goalieRig.body.rotation, { z: 0, x: 0.04, duration: 0.38, ease: 'back.out(1.4)' }, '+=0.15');
        tl.to(goalieRig.body.position, { y: 1.055, duration: 0.35 }, '<');
        tl.to(goalieRig.leftHipPivot.rotation, { x: -0.2, z: -0.18, duration: 0.32 }, '<');
        tl.to(goalieRig.leftKneePivot.rotation, { x: 0.26, z: 0.16, duration: 0.32 }, '<');
        tl.to(goalieRig.rightHipPivot.rotation, { x: -0.2, z: 0.18, duration: 0.32 }, '<');
        tl.to(goalieRig.rightKneePivot.rotation, { x: 0.26, z: -0.16, duration: 0.32 }, '<');
        tl.to(goalieRig.leftArmPivot.rotation, { z: -2.4, x: -0.25, duration: 0.25 }, '<0.08');
        tl.to(goalieRig.leftElbowPivot.rotation, { x: -0.75, duration: 0.25 }, '<');
        tl.to(goalieRig.rightArmPivot.rotation, { z: 2.4, x: -0.25, duration: 0.25 }, '<');
        tl.to(goalieRig.rightElbowPivot.rotation, { x: -0.75, duration: 0.25 }, '<');
      }
    };

    const animateCameraForShot = (finalX: number, finalY: number) => {
      if (currentRole !== 'KICKER') return;
      cameraTween?.kill();
      cameraTween = gsap.to(camRig, {
        px: finalX * 0.16,
        py: 2.55 + Math.min(0.6, finalY * 0.12),
        pz: 3.3,
        lx: finalX * 0.42,
        ly: Math.max(1.2, finalY * 0.62),
        lz: -14.8,
        fovOffset: 5.5,
        duration: 0.85,
        ease: 'power2.out',
      });
    };

    const resetCameraToSpot = (immediate = false) => {
      const target = currentRole === 'KICKER' ? CAM_KICKER : CAM_GK;
      cameraTween?.kill();
      if (immediate) {
        Object.assign(camRig, { ...target, fovOffset: 0 });
      } else {
        cameraTween = gsap.to(camRig, {
          ...target,
          fovOffset: 0,
          duration: 0.85,
          ease: 'power2.inOut',
        });
      }
    };

    const resetRound = () => {
      window.clearTimeout(gkReactTimeout);
      window.clearTimeout(gkCountdownTimeout);
      window.clearTimeout(resetTimeout);
      if (flightTween) flightTween.kill();

      ball.position.set(0, 0.5, 0);
      ball.rotation.set(0, 0, 0);
      updateBallShadow();
      updateTrajectoryArc(0, 50, false);

      power = 0;
      powerDirection = 1;
      setPowerRing(0);
      aimValue = 0;
      aimDirection = 1;
      catchCursor.visible = false;
      resetGoalie();
      resetCameraToSpot();

      if (currentRole === 'KICKER') {
        kickerState = 'AIMING';
        aimCursor.visible = true;
        aimCursor.position.x = 0;
        setActionLabel('HOLD');
        setIsCharging(false);
        setIsSwiping(false);
        setIsLocked(false);
      } else {
        gkState = 'GK_IDLE';
        kickerGroup.position.set(0, 0, 1.8);
        kickerGroup.rotation.set(0, Math.PI, 0);
        setActionLabel('KICK OFF');
        setIsLocked(false);
      }
    };

    const handleShotImpact = (
      outcome: ShotOutcome,
      hitX: number,
      hitY: number,
      updatedSession?: ParticipantSessionState
    ) => {
      if (currentRole === 'GOALKEEPER') gkState = 'GK_RESULT';

      const isTopCorner = outcome === 'GOAL' && Math.abs(hitX) >= 3.55 && hitY >= 2.15;
      showOverlay(outcome, isTopCorner);

      if (outcome === 'GOAL') {
        playSynthSound('goal', mutedRef.current);
        cheerBoost = 3.2;
        cameraShake = 0.22;
        if (isTopCorner) {
          flashCornerTarget(hitX < 0 ? leftTarget : rightTarget);
        }

        // Stadium celebration floodlight pulse + dual goalpost confetti cannons
        gsap.fromTo(
          celebrationLight,
          { intensity: 8 },
          { intensity: 0, duration: 1.1, ease: 'power2.out' }
        );
        spawnBurst(-GOAL_W / 2 + 0.5, 0.6, GOAL_Z + 0.4, 24, undefined, 7.5, 9.5);
        spawnBurst(GOAL_W / 2 - 0.5, 0.6, GOAL_Z + 0.4, 24, undefined, 7.5, 9.5);
        spawnBurst(hitX, hitY, BACK_Z + 0.4, 14, 0xd9ff70, 4.5, 4.5);

        gsap.to(ball.position, {
          z: BACK_Z + 0.35,
          y: Math.min(hitY, GOAL_H - 0.35),
          duration: 0.22,
          ease: 'power2.in',
          onComplete: () => {
            gsap.to(ball.position, { y: 0.5, duration: 0.45, ease: 'bounce.out' });
          },
        });
        animateNetRipple(hitX, hitY);
      } else if (outcome === 'SAVE') {
        playSynthSound('save', mutedRef.current);
        cameraShake = 0.14;
        spawnBurst(hitX, hitY, GOAL_Z + 0.4, 14, 0xfbbf24, 5, 4);
        gsap.to(ball.position, {
          z: -7.8,
          y: 1.75,
          x: ball.position.x + (hitX >= 0 ? 3.8 : -3.8),
          duration: 0.78,
          ease: 'power2.out',
        });
        gsap.to(ball.position, { y: 0.5, duration: 0.42, delay: 0.78, ease: 'bounce.out' });
      } else {
        playSynthSound('miss', mutedRef.current);
        // Subtle post/crossbar clang shake if close to frame
        if (Math.abs(hitX) < GOAL_W / 2 + 1.2 && hitY < GOAL_H + 1.0) {
          cameraShake = 0.12;
        }
        gsap.to(ball.position, {
          z: -24,
          y: 0.5,
          duration: 0.75,
          ease: 'bounce.out',
        });
      }

      if (modeRef.current === 'practice') {
        if (currentRole === 'KICKER') {
          if (outcome === 'GOAL') {
            setPracticeGoals((g) => g + 1);
            practiceConsecSaves = 0;
            practiceDiffKicker = Math.min(10, practiceDiffKicker + 1);
            setPracticeLevel(practiceDiffKicker);
          } else if (outcome === 'SAVE') {
            practiceConsecSaves++;
            if (practiceConsecSaves >= 3) {
              practiceDiffKicker = Math.max(1, practiceDiffKicker - 1);
              practiceConsecSaves = 0;
              setPracticeLevel(practiceDiffKicker);
            }
          } else {
            practiceConsecSaves = 0;
            practiceDiffKicker = Math.max(1, practiceDiffKicker - 1);
            setPracticeLevel(practiceDiffKicker);
          }
        } else {
          if (outcome === 'SAVE') {
            setPracticeSaves((s) => s + 1);
            practiceConsecMisses = 0;
            practiceDiffGk = Math.min(10, practiceDiffGk + 1);
            setPracticeLevel(practiceDiffGk);
          } else {
            practiceConsecMisses++;
            if (practiceConsecMisses >= 3) {
              practiceDiffGk = Math.max(1, practiceDiffGk - 1);
              practiceConsecMisses = 0;
              setPracticeLevel(practiceDiffGk);
            }
          }
        }
        resetTimeout = window.setTimeout(() => {
          if (!disposed) resetRound();
        }, 2150);
        return;
      }

      if (updatedSession) {
        onSessionUpdateRef.current?.(updatedSession);
        if (
          updatedSession.status === 'completed' ||
          updatedSession.attempts.length >= totalAttemptsRef.current
        ) {
          resetTimeout = window.setTimeout(() => {
            if (!disposed) onCampaignCompleteRef.current?.(updatedSession);
          }, 2000);
          return;
        }
      }

      resetTimeout = window.setTimeout(() => {
        if (!disposed) resetRound();
      }, 2100);
    };

    const launchBallFlight = (
      finalX: number,
      finalY: number,
      pf: number,
      rawAimX: number,
      curveFactor: number,
      outcome: ShotOutcome,
      updatedSession?: ParticipantSessionState
    ) => {
      playSynthSound('kick', mutedRef.current);
      triggerKickShockwave();
      spawnBurst(0, 0.15, 0, 8, 0xffffff, 2.2, 2.0);
      animateCameraForShot(finalX, finalY);

      const ctrlBow = curveFactor * (rawAimX - finalX) * 0.9;
      const arcH = 1.0 + pf * 4.8;

      const startP = { x: 0, y: 0.5, z: 0 };
      const ctrlP = { x: finalX + ctrlBow, y: finalY + arcH, z: -8 };
      const endP = { x: finalX, y: finalY, z: -15.4 };
      const flightDuration = 0.76 + pf * 0.28;

      const fi = { t: 0 };
      let savedTriggered = false;

      flightTween = gsap.to(fi, {
        t: 1,
        duration: flightDuration,
        ease: 'power1.inOut',
        onUpdate: () => {
          const t = fi.t;
          const u = 1 - t;
          ball.position.x = u * u * startP.x + 2 * u * t * ctrlP.x + t * t * endP.x;
          ball.position.y = u * u * startP.y + 2 * u * t * ctrlP.y + t * t * endP.y;
          ball.position.z = u * u * startP.z + 2 * u * t * ctrlP.z + t * t * endP.z;
          updateBallShadow();
          spawnSparkle(ball.position.x, ball.position.y, ball.position.z);

          if (
            !savedTriggered &&
            outcome === 'SAVE' &&
            ball.position.z < -13.9 &&
            ball.position.z > -15.1
          ) {
            savedTriggered = true;
            flightTween?.kill();
            gsap.killTweensOf(ball.rotation);
            handleShotImpact('SAVE', ball.position.x, ball.position.y, updatedSession);
          }
        },
        onComplete: () => {
          if (!savedTriggered) {
            handleShotImpact(outcome, finalX, finalY, updatedSession);
          }
        },
      });

      gsap.to(ball.rotation, {
        x: -Math.PI * 7,
        y: (finalX / AIM_RANGE) * Math.PI * 5,
        duration: flightDuration,
        ease: 'none',
      });
    };

    const executeKick = async (snapshotAim: number, snapshotPower: number) => {
      kickerState = 'KICKING';
      setIsCharging(false);
      setIsSwiping(false);
      setIsLocked(true);
      setActionLabel('...');
      aimCursor.visible = false;
      updateTrajectoryArc(0, 50, false);

      if (modeRef.current === 'campaign') {
        const currentSession = sessionRef.current;
        if (!currentSession) {
          resetRound();
          return;
        }
        const idempotencyKey = `${currentSession.id}-kick-${currentSession.attempts.length + 1}-${Date.now()}`;
        try {
          const res = await submitShotFirestore(currentSession, settingsRef.current, {
            aimValue: snapshotAim,
            power: snapshotPower,
            idempotencyKey,
          });
          if (disposed) return;
          const a = res.attempt;
          triggerGoalieDive(a.finalX, a.finalY, a.outcome === 'SAVE', a.difficulty);
          launchBallFlight(
            a.finalX,
            a.finalY,
            a.power / 100,
            a.aimValue * AIM_RANGE,
            a.curveFactor,
            a.outcome,
            res.session
          );
        } catch (err) {
          if (disposed) return;
          setShotError(err instanceof Error ? err.message : 'Unable to save shot.');
          resetRound();
        }
      } else {
        const evaluated = evaluatePenaltyShot(
          snapshotAim,
          snapshotPower,
          practiceDiffKicker,
          false
        );
        triggerGoalieDive(
          evaluated.finalX,
          evaluated.finalY,
          evaluated.outcome === 'SAVE',
          practiceDiffKicker
        );
        launchBallFlight(
          evaluated.finalX,
          evaluated.finalY,
          evaluated.power / 100,
          evaluated.rawAimX,
          evaluated.curveFactor,
          evaluated.outcome
        );
      }
    };

    const startPowering = () => {
      if (currentRole !== 'KICKER' || kickerState !== 'AIMING') return;
      if (modeRef.current === 'campaign') {
        const s = sessionRef.current;
        if (!s || s.status === 'completed' || s.attempts.length >= totalAttemptsRef.current) return;
      }
      setShotError(null);
      setShowSwipeCue(false);
      kickerState = 'POWERING';
      setIsCharging(true);
      setActionLabel('RELEASE');
    };

    const commitKick = () => {
      if (currentRole !== 'KICKER' || kickerState !== 'POWERING') return;
      executeKick(aimValue, power);
    };

    // ─── DRIMIFY SWIPE-TO-SHOOT GESTURE HANDLERS ──────────────
    const canKickNow = () => {
      if (currentRole !== 'KICKER' || kickerState !== 'AIMING') return false;
      if (modeRef.current === 'campaign') {
        const s = sessionRef.current;
        if (!s || s.status === 'completed' || s.attempts.length >= totalAttemptsRef.current) {
          return false;
        }
      }
      return true;
    };

    const beginSwipe = (clientX: number, clientY: number) => {
      if (!canKickNow()) return;
      setShotError(null);
      setShowSwipeCue(false);
      kickerState = 'SWIPING';
      setIsSwiping(true);
      swipeStartX = clientX;
      swipeStartY = clientY;
      swipeStartTime = performance.now();
      swipeAim = aimValue;
      swipePower = 48;
      updateTrajectoryArc(swipeAim, swipePower, true);
    };

    const moveSwipe = (clientX: number, clientY: number) => {
      if (kickerState !== 'SWIPING') return;
      const dx = clientX - swipeStartX;
      const dy = swipeStartY - clientY; // upward swipe is positive
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;

      // Map horizontal swipe angle cleanly to goalmouth aim (-0.95..0.95)
      swipeAim = Math.max(-0.98, Math.min(0.98, (dx / (w * 0.28))));
      // Map upward swipe distance to shot power (18..88%, centered near the 45-55% sweet spot!)
      const distRatio = Math.max(0, Math.min(1, dy / (h * 0.34)));
      swipePower = Math.max(15, Math.min(92, 16 + distRatio * 74));

      aimValue = swipeAim;
      aimCursor.position.x = swipeAim * AIM_RANGE;
      setPowerRing(swipePower);
      updateTrajectoryArc(swipeAim, swipePower, dy > 16);
    };

    const endSwipe = (clientX: number, clientY: number) => {
      if (kickerState !== 'SWIPING') return;
      const dy = swipeStartY - clientY;
      const dx = clientX - swipeStartX;
      const dtMs = Math.max(40, performance.now() - swipeStartTime);

      if (dy < 36) {
        // Too short — cancel swipe gracefully back to aiming
        kickerState = 'AIMING';
        setIsSwiping(false);
        setPowerRing(0);
        updateTrajectoryArc(0, 50, false);
        return;
      }

      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const finalAim = Math.max(-0.98, Math.min(0.98, dx / (w * 0.28)));
      // Blend distance + flick velocity so quick crisp flicks feel super responsive!
      const distNorm = Math.min(1, dy / (h * 0.34));
      const speedBonus = Math.min(14, (dy / dtMs) * 7.5);
      const finalPower = Math.max(22, Math.min(92, 20 + distNorm * 60 + speedBonus));

      executeKick(finalAim, finalPower);
    };

    const cancelSwipe = () => {
      if (kickerState !== 'SWIPING') return;
      kickerState = 'AIMING';
      setIsSwiping(false);
      setPowerRing(0);
      updateTrajectoryArc(0, 50, false);
    };

    // ─── PRACTICE GK MODE ─────────────────────────────────────
    const gkSaveWindowMs = () => {
      const t = (practiceDiffGk - 1) / 9;
      return 900 - t * t * 820;
    };

    const gkStartRound = () => {
      if (gkState !== 'GK_IDLE') return;
      gkState = 'GK_PENDING';
      setShowSwipeCue(false);
      setActionLabel('WAIT...');

      gkFinalX = (Math.random() * 2 - 1) * (GOAL_W / 2 - 0.8);
      gkFinalY = 0.4 + Math.random() * (GOAL_H - 0.7);

      resetGoalie();
      catchCursor.visible = false;
      ball.position.set(0, 0.5, 0);
      kickerGroup.position.set(0, 0, 1.8);
      kickerGroup.rotation.set(0, Math.PI, 0);

      gsap.to(kickerGroup.position, { z: 0.45, duration: 0.9, ease: 'power1.inOut' });

      const revealDelay = 1300 + Math.random() * 1700;
      gkReactTimeout = window.setTimeout(() => {
        if (disposed) return;
        gkState = 'GK_REACTING';
        gkRevealTime = Date.now();
        catchCursor.position.set(gkFinalX, gkFinalY, GOAL_Z + 0.15);
        catchCursor.visible = true;
        gsap.fromTo(
          catchCursor.scale,
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 1, duration: 0.2, ease: 'back.out(2.4)' }
        );
        setActionLabel('DIVE!');
        gkCountdownTimeout = window.setTimeout(() => {
          if (gkState === 'GK_REACTING') gkPlayerReact();
        }, GK_CURSOR_LIFETIME_MS);
      }, revealDelay);
    };

    const gkPlayerReact = () => {
      if (gkState !== 'GK_REACTING') return;
      gkState = 'GK_ANIMATING';
      window.clearTimeout(gkCountdownTimeout);

      const reactionMs = Date.now() - gkRevealTime;
      const isSave = reactionMs <= gkSaveWindowMs();

      catchCursor.visible = false;
      setActionLabel('...');
      setIsLocked(true);

      triggerGoalieDive(gkFinalX, gkFinalY, isSave, practiceDiffGk);
      gsap.to(kickerGroup.rotation, {
        x: 0.45,
        duration: 0.16,
        ease: 'power3.in',
        onComplete: () => {
          gsap.to(kickerGroup.rotation, { x: 0, duration: 0.26, ease: 'power2.out' });
          const pf = 0.45 + Math.random() * 0.4;
          launchBallFlight(gkFinalX, gkFinalY, pf, gkFinalX, 0, isSave ? 'SAVE' : 'GOAL');
        },
      });
    };

    const gkAction = () => {
      if (currentRole !== 'GOALKEEPER') return;
      if (gkState === 'GK_IDLE') gkStartRound();
      else if (gkState === 'GK_REACTING') gkPlayerReact();
    };

    const switchPracticeRole = (role: 'KICKER' | 'GOALKEEPER') => {
      if (modeRef.current !== 'practice') return;
      currentRole = role;
      setPracticeRole(role);
      kickerGroup.visible = role === 'GOALKEEPER';
      aimCursor.visible = role === 'KICKER';
      leftTarget.visible = role === 'KICKER';
      rightTarget.visible = role === 'KICKER';
      catchCursor.visible = false;
      setPracticeLevel(role === 'KICKER' ? practiceDiffKicker : practiceDiffGk);
      setShowSwipeCue(true);
      resetRound();
    };

    engineRef.current = {
      startPowering,
      commitKick,
      gkAction,
      switchPracticeRole,
      updateJersey,
      beginSwipe,
      moveSwipe,
      endSwipe,
      cancelSwipe,
    };

    // Keyboard support
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      if (currentRole === 'KICKER') startPowering();
      else gkAction();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (currentRole === 'KICKER') commitKick();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      baseFov = w / h < 0.72 ? 74 : w / h < 1.0 ? 68 : 60;
      camera.fov = baseFov + camRig.fovOffset;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('3D graphics context paused. Reload to resume.');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // ─── RENDER LOOP (with Software WebGL afterDraw pacing) ───
    let frameId = 0;
    const clock = new THREE.Clock();
    let elapsed = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(0.05, clock.getDelta());
      elapsed += dt;

      // 1. Smartphone crowd wave & goal cheer animation
      if (cheerBoost > 0) cheerBoost = Math.max(0, cheerBoost - dt * 1.35);
      phoneCrowd.update(elapsed, cheerBoost);

      // 2. Pulsing Drimify corner targets
      const targetPulse = 1 + Math.sin(elapsed * 3.8) * 0.07;
      if (leftTarget.visible) {
        leftTarget.rotation.z = elapsed * 0.45;
        rightTarget.rotation.z = -elapsed * 0.45;
        if (!gsap.isTweening(leftTarget.scale)) leftTarget.scale.setScalar(targetPulse);
        if (!gsap.isTweening(rightTarget.scale)) rightTarget.scale.setScalar(targetPulse);
      }

      // 3. Sparkles & celebration confetti physics
      for (let i = 0; i < SPARKLE_POOL; i++) {
        const sp = sparkles[i];
        if (sp.life > 0) {
          sp.life -= dt * 2.0;
          if (sp.life <= 0) {
            sp.mesh.visible = false;
          } else {
            sp.mesh.scale.setScalar(sp.life);
            (sp.mesh.material as THREE.MeshBasicMaterial).opacity = sp.life * 0.9;
          }
        }
      }

      for (let i = 0; i < PARTICLE_POOL; i++) {
        const p = particles[i];
        if (p.life > 0) {
          p.life -= dt;
          if (p.life <= 0) {
            p.mesh.visible = false;
          } else {
            p.vy -= 14.5 * dt;
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
            p.mesh.position.z += p.vz * dt;
            p.mesh.rotation.x += p.vrx * dt;
            p.mesh.rotation.y += p.vry * dt;
            (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.life * 1.2);
          }
        }
      }

      // 4. Expressive Goalkeeper Ready Stance (footwork sway + crouched poised gloves)
      if (kickerState !== 'KICKING' && gkState === 'GK_IDLE') {
        goalieRig.setReadyPose(elapsed, currentRole === 'KICKER');
      }

      // 5. Aim & Power Sweep (paused when user actively swipes!)
      if (currentRole === 'KICKER') {
        if (kickerState === 'AIMING') {
          aimValue += dt * 1.65 * aimDirection;
          if (aimValue >= 1) {
            aimValue = 1;
            aimDirection = -1;
          }
          if (aimValue <= -1) {
            aimValue = -1;
            aimDirection = 1;
          }
          aimCursor.position.x = aimValue * AIM_RANGE;
        } else if (kickerState === 'POWERING') {
          power += dt * 126 * powerDirection;
          if (power >= 100) {
            power = 100;
            powerDirection = -1;
          }
          if (power <= 0) {
            power = 0;
            powerDirection = 1;
          }
          setPowerRing(power);
          updateTrajectoryArc(aimValue, power, true);
        }
      }

      // 6. Broadcast camera sway + impact micro-shake + dynamic FOV
      const idleSwayX = kickerState === 'AIMING' ? Math.sin(elapsed * 0.9) * 0.18 : 0;
      const idleSwayY = kickerState === 'AIMING' ? Math.cos(elapsed * 1.2) * 0.06 : 0;
      let shakeX = 0;
      let shakeY = 0;
      if (cameraShake > 0.002) {
        shakeX = (Math.random() - 0.5) * cameraShake;
        shakeY = (Math.random() - 0.5) * cameraShake;
        cameraShake = Math.max(0, cameraShake - dt * 1.1);
      }

      camera.position.set(
        camRig.px + idleSwayX + shakeX,
        camRig.py + idleSwayY + shakeY,
        camRig.pz
      );
      const targetFov = baseFov + camRig.fovOffset;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
      camera.lookAt(camRig.lx, camRig.ly, camRig.lz);

      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      window.clearTimeout(gkReactTimeout);
      window.clearTimeout(gkCountdownTimeout);
      window.clearTimeout(resetTimeout);
      flightTween?.kill();
      goalieTimeline?.kill();
      cameraTween?.kill();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);

      pitchTexture.dispose();
      boardTex.dispose();
      backNetTex.dispose();
      sideNetTex.dispose();
      topNetTex.dispose();
      backNetMat.dispose();
      sideNetMat.dispose();
      topNetMat.dispose();
      phoneCrowd.dispose();
      goalieRig.dispose();
      envTarget.dispose();
      renderer.dispose();
    };
  }, []);

  const handleButtonPointerDown = useCallback(() => {
    if (isLocked) return;
    if (mode === 'practice' && practiceRole === 'GOALKEEPER') {
      engineRef.current?.gkAction();
    } else {
      engineRef.current?.startPowering();
    }
  }, [isLocked, mode, practiceRole]);

  const handleButtonPointerUp = useCallback(() => {
    if (mode === 'practice' && practiceRole === 'GOALKEEPER') return;
    engineRef.current?.commitKick();
  }, [mode, practiceRole]);

  const attempts: AttemptRecord[] = session?.attempts ?? [];
  const remainingAttempts = Math.max(0, totalAttempts - attempts.length);

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-[#091a28] select-none">
      {/* Isolated WebGL Mount Container with Drimify Swipe-to-Shoot surface */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          if (isLocked) return;
          if (mode === 'practice' && practiceRole === 'GOALKEEPER') return;
          e.currentTarget.setPointerCapture(e.pointerId);
          engineRef.current?.beginSwipe(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!isSwiping) return;
          engineRef.current?.moveSwipe(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (!isSwiping) return;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          engineRef.current?.endSwipe(e.clientX, e.clientY);
        }}
        onPointerCancel={() => engineRef.current?.cancelSwipe()}
      />

      {/* Fallback if WebGL unavailable */}
      {webglError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#081722] p-6 text-center text-white">
          <div className="max-w-sm rounded-2xl border border-white/15 bg-[#0e2233] p-6">
            <p className="text-base font-semibold">{webglError}</p>
            <button
              onClick={onExit}
              className="mt-4 w-full rounded-xl bg-[#d9ff70] py-3 text-sm font-bold text-[#091318]"
            >
              Return to Campaign
            </button>
          </div>
        </div>
      )}

      {/* Compact Stadium Top HUD (solid/translucent dark surface, NO backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 rounded-2xl border border-white/12 bg-[#081621]/92 px-3 py-2.5 text-white shadow-lg sm:px-4">
          <div className="pointer-events-auto flex items-center gap-2.5 min-w-0">
            <button
              onClick={onExit}
              aria-label="Back to campaign"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="font-[var(--font-display)] text-lg font-extrabold tracking-wide uppercase leading-none text-white truncate sm:text-xl">
                iPhone vs Android
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                <span
                  className={
                    team === 'iphone' ? 'text-sky-300 font-semibold' : 'text-[#d9ff70] font-semibold'
                  }
                >
                  {team === 'iphone' ? 'Team iPhone' : 'Team Android'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {mode === 'campaign' ? session?.entryNumber ?? 'Official Run' : 'Practice Pitch'}
                </span>
              </div>
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-3 shrink-0">
            {mode === 'campaign' ? (
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                  <span className="font-bold text-[#d9ff70] text-sm">
                    {session?.score ?? 0}/{totalAttempts}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-200">{remainingAttempts} left</span>
                </div>
                <div
                  className="mt-1 flex items-center gap-1.5"
                  aria-label="Five penalty attempt indicators"
                >
                  {Array.from({ length: totalAttempts }).map((_, idx) => {
                    const shot = attempts[idx];
                    const isCurrent = idx === attempts.length && remainingAttempts > 0;
                    let cls = 'bg-white/15 border-white/25 text-white/50';
                    let symbol = String(idx + 1);
                    if (shot?.outcome === 'GOAL') {
                      cls = 'bg-[#d9ff70] border-[#d9ff70] text-[#091318]';
                      symbol = '✓';
                    } else if (shot?.outcome === 'SAVE') {
                      cls = 'bg-amber-400 border-amber-400 text-[#091318]';
                      symbol = 'S';
                    } else if (shot?.outcome === 'MISS') {
                      cls = 'bg-rose-500 border-rose-500 text-white';
                      symbol = '✕';
                    } else if (isCurrent) {
                      cls = 'bg-white/25 border-[#d9ff70] text-white';
                    }
                    return (
                      <div
                        key={idx}
                        title={shot ? `Kick ${idx + 1}: ${shot.outcome}` : `Kick ${idx + 1}`}
                        className={`flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[10px] font-bold transition-colors ${cls}`}
                      >
                        {symbol}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                <span className="text-[#d9ff70] font-bold">
                  {practiceRole === 'KICKER' ? `Goals ${practiceGoals}` : `Saves ${practiceSaves}`}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-200">Lvl {practiceLevel}</span>
              </div>
            )}

            <button
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute stadium sound' : 'Mute stadium sound'}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Practice Mode Team Kit Switcher */}
        {mode === 'practice' && onTeamChangePractice && (
          <div className="pointer-events-auto mx-auto mt-2 flex max-w-xs items-center justify-center gap-1 rounded-xl border border-white/12 bg-[#081621]/92 p-1">
            <button
              onClick={() => onTeamChangePractice('iphone')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                team === 'iphone' ? 'bg-white text-[#091318]' : 'text-slate-300 hover:text-white'
              }`}
            >
              iPhone Kit
            </button>
            <button
              onClick={() => onTeamChangePractice('android')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                team === 'android'
                  ? 'bg-[#d9ff70] text-[#091318]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Android Kit
            </button>
          </div>
        )}
      </div>

      {/* Animated Broadcast Goal / Saved / Miss Callout */}
      <div
        ref={messageRef}
        style={{ color: overlayText.color, opacity: 0 }}
        className="pointer-events-none absolute inset-x-0 top-[24%] z-20 text-center"
      >
        <div className="font-[var(--font-display)] text-6xl font-extrabold tracking-tight drop-shadow-[0_6px_28px_rgba(0,0,0,0.75)] sm:text-8xl leading-none">
          {overlayText.text}
        </div>
        {overlayText.subtext && (
          <div className="mt-1.5 font-[var(--font-display)] text-lg font-bold tracking-[0.22em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] uppercase sm:text-xl">
            {overlayText.subtext}
          </div>
        )}
      </div>

      {/* Drimify-style Animated Swipe-Up Cue above the ball before first kick */}
      {showSwipeCue && !isLocked && !(mode === 'practice' && practiceRole === 'GOALKEEPER') && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[210px] z-10 flex flex-col items-center">
          <div className="animate-swipe-cue flex flex-col items-center text-[#d9ff70] drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
            <ChevronsUp className="h-8 w-8 stroke-[2.5]" />
            <span className="mt-0.5 font-[var(--font-display)] text-sm font-extrabold tracking-widest uppercase text-white">
              Swipe Up to Shoot
            </span>
          </div>
        </div>
      )}

      {/* Server Error Toast */}
      {shotError && (
        <div className="absolute inset-x-4 top-24 z-30 mx-auto max-w-md rounded-xl border border-rose-400/40 bg-[#1f0d12]/95 px-4 py-2.5 text-center text-xs font-medium text-rose-200">
          {shotError}
        </div>
      )}

      {/* Bottom Ergonomic Thumb-Zone Controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex flex-col items-center gap-2.5 px-4 sm:bottom-7">
        <p className="max-w-xs rounded-xl bg-[#081621]/88 px-3.5 py-1.5 text-center text-xs font-medium text-slate-200">
          {mode === 'practice' && practiceRole === 'GOALKEEPER'
            ? 'Tap KICK OFF, watch the lime target, and tap DIVE fast to block!'
            : 'Swipe pitch toward corners · or Hold button to power & release'}
        </p>

        <div className="pointer-events-auto power-ring-wrap">
          <div
            ref={powerRingRef}
            className="power-ring"
            style={{
              display: mode === 'practice' && practiceRole === 'GOALKEEPER' ? 'none' : 'block',
            }}
          />
          <button
            type="button"
            disabled={isLocked}
            onPointerDown={handleButtonPointerDown}
            onPointerUp={handleButtonPointerUp}
            onPointerCancel={handleButtonPointerUp}
            onContextMenu={(e) => e.preventDefault()}
            className={`btn-action-ring ${isCharging || isSwiping ? 'is-active' : ''}`}
          >
            {isSwiping ? 'AIMING' : actionLabel}
          </button>
        </div>

        {mode === 'campaign' ? (
          <div className="flex items-center gap-1.5 rounded-xl bg-[#081621]/88 px-3.5 py-1.5 text-[11px] font-medium text-slate-300">
            <Shield className="h-3.5 w-3.5 text-[#d9ff70]" />
            <span>
              Server-verified kick {Math.min(totalAttempts, attempts.length + 1)} of {totalAttempts}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              engineRef.current?.switchPracticeRole(
                practiceRole === 'KICKER' ? 'GOALKEEPER' : 'KICKER'
              )
            }
            className="pointer-events-auto min-h-[40px] rounded-xl border border-white/15 bg-[#081621]/92 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15 transition-colors whitespace-nowrap"
          >
            {practiceRole === 'KICKER' ? 'Switch to Keeper Mode' : 'Switch to Kicker Mode'}
          </button>
        )}
      </div>
    </div>
  );
}
