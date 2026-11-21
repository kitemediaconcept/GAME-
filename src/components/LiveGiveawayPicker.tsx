import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Phone,
  RotateCw,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CampaignSettings, RankedParticipant } from '../types.ts';
import { IStoreLogo } from './IStoreLogo.tsx';

interface LiveGiveawayPickerProps {
  participants: RankedParticipant[];
  settings: CampaignSettings;
  onConfirmWinner: (participant: RankedParticipant, note: string) => Promise<void>;
}

const SLICE_PALETTE = [
  { bg: '#0c2233', text: '#f8fafc' },
  { bg: '#133548', text: '#d9ff70' },
  { bg: '#0f2c3d', text: '#ffffff' },
  { bg: '#164e3f', text: '#ecfdf5' },
  { bg: '#1c3b4f', text: '#d9ff70' },
  { bg: '#0b1d2b', text: '#e2e8f0' },
];

function maskPhoneNumber(phone: string): string {
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return cleaned;
  const keepHead = Math.min(4, Math.max(2, cleaned.length - 5));
  const keepTail = 2;
  const maskedLen = Math.max(2, cleaned.length - keepHead - keepTail);
  return `${cleaned.slice(0, keepHead)}${'•'.repeat(maskedLen)}${cleaned.slice(-keepTail)}`;
}

function cryptoRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const arr = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  let r = 0;
  do {
    crypto.getRandomValues(arr);
    r = arr[0];
  } while (r >= limit);
  return r % maxExclusive;
}

function playPickerTone(type: 'tick' | 'win', muted: boolean) {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'tick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.032);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
      window.setTimeout(() => ctx.close().catch(() => undefined), 120);
    } else {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const start = now + idx * 0.08;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.46);
      });
      window.setTimeout(() => ctx.close().catch(() => undefined), 950);
    }
  } catch {
    // Ignore browser audio autoplay restrictions
  }
}

export function LiveGiveawayPicker({
  participants,
  settings,
  onConfirmWinner,
}: LiveGiveawayPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const confettiFrameRef = useRef<number>(0);
  const rotationRef = useRef<number>(0);
  const lastSliceIdxRef = useRef<number>(-1);

  const [qualifiedOnly, setQualifiedOnly] = useState(true);
  const [excludeConfirmed, setExcludeConfirmed] = useState(true);
  const [maskPhone, setMaskPhone] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [spinning, setSpinning] = useState(false);
  const [tickerName, setTickerName] = useState<string>('');
  const [drawnWinner, setDrawnWinner] = useState<RankedParticipant | null>(null);
  const [savingWinner, setSavingWinner] = useState(false);
  const [savedWinnerIds, setSavedWinnerIds] = useState<string[]>([]);
  const [prizeLabel, setPrizeLabel] = useState<string>('Live Giveaway Draw Winner');
  const [sessionWinners, setSessionWinners] = useState<RankedParticipant[]>([]);

  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const eligiblePool = useMemo(() => {
    return participants.filter((p) => {
      if (p.winnerStatus === 'removed') return false;
      if (qualifiedOnly && !p.qualified) return false;
      if (excludeConfirmed && p.winnerStatus === 'confirmed') return false;
      return true;
    });
  }, [participants, qualifiedOnly, excludeConfirmed]);

  // Keep a crisp wheel display of up to 24 slices while still sampling fairly from 1,000+ entries
  const [wheelEntries, setWheelEntries] = useState<RankedParticipant[]>([]);

  useEffect(() => {
    if (spinning) return;
    if (eligiblePool.length <= 24) {
      setWheelEntries(eligiblePool);
    } else {
      // Evenly spread 24 preview names across the large pool
      const step = eligiblePool.length / 24;
      const sample: RankedParticipant[] = [];
      for (let i = 0; i < 24; i++) {
        sample.push(eligiblePool[Math.floor(i * step)]);
      }
      setWheelEntries(sample);
    }
  }, [eligiblePool, spinning]);

  const drawWheel = useCallback((entries: RankedParticipant[], angleRad: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.455;

    ctx.clearRect(0, 0, size, size);

    // Outer metallic ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 12, 0, Math.PI * 2);
    ctx.fillStyle = '#07131d';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(217, 255, 112, 0.45)';
    ctx.stroke();
    ctx.restore();

    const count = Math.max(1, entries.length);
    const sliceArc = (Math.PI * 2) / count;

    if (entries.length === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#0d2231';
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 22px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No eligible entries', cx, cy);
      return;
    }

    for (let i = 0; i < count; i++) {
      const start = angleRad + i * sliceArc;
      const end = start + sliceArc;
      const theme = SLICE_PALETTE[i % SLICE_PALETTE.length];

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = theme.bg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.stroke();

      // Radial label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceArc / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = theme.text;
      const fontSize = count <= 8 ? 22 : count <= 14 ? 17 : 13;
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      const rawName = entries[i].name.trim();
      const maxChars = count <= 8 ? 18 : count <= 14 ? 15 : 13;
      const label = rawName.length > maxChars ? `${rawName.slice(0, maxChars - 1)}…` : rawName;
      ctx.fillText(label, radius - 26, 0);
      ctx.restore();

      // Rim peg dot
      const pegX = cx + Math.cos(start) * (radius + 4);
      const pegY = cy + Math.sin(start) * (radius + 4);
      ctx.beginPath();
      ctx.arc(pegX, pegY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#d9ff70' : '#ffffff';
      ctx.fill();
    }

    // Center hub cap
    ctx.beginPath();
    ctx.arc(cx, cy, 48, 0, Math.PI * 2);
    ctx.fillStyle = '#081722';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#d9ff70';
    ctx.stroke();

    ctx.fillStyle = '#d9ff70';
    ctx.font = '800 16px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', cx, cy);
  }, []);

  useEffect(() => {
    drawWheel(wheelEntries, rotationRef.current);
  }, [wheelEntries, drawWheel, fullscreen]);

  const launchConfetti = useCallback(() => {
    const canvas = confettiRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = (canvas.width = canvas.offsetWidth || 640);
    const h = (canvas.height = canvas.offsetHeight || 420);
    const colors = ['#d9ff70', '#ffffff', '#38bdf8', '#22c55e', '#fbbf24'];

    const pieces = Array.from({ length: 75 }, () => ({
      x: w * 0.5 + (Math.random() - 0.5) * 140,
      y: h * 0.35 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 11,
      vy: -5 - Math.random() * 8,
      size: 6 + Math.random() * 6,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.25,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    }));

    cancelAnimationFrame(confettiFrameRef.current);

    const step = () => {
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of pieces) {
        if (p.life <= 0) continue;
        alive = true;
        p.vy += 0.28;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        p.life -= 0.014;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive) {
        confettiFrameRef.current = requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };
    confettiFrameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      cancelAnimationFrame(confettiFrameRef.current);
    };
  }, []);

  const handleSpin = useCallback(() => {
    if (spinning || eligiblePool.length === 0) return;

    // 1. Cryptographically pick 1 winner fairly from the ENTIRE eligible pool (supports 1,000+ entries)
    const winnerGlobalIdx = cryptoRandomInt(eligiblePool.length);
    const chosenWinner = eligiblePool[winnerGlobalIdx];

    // 2. Construct active display slices (max 24) guaranteed to include the chosen winner
    let displaySlices: RankedParticipant[];
    let winnerSliceIdx: number;

    if (eligiblePool.length <= 24) {
      displaySlices = [...eligiblePool];
      winnerSliceIdx = winnerGlobalIdx;
    } else {
      const others = eligiblePool.filter((p) => p.id !== chosenWinner.id);
      const picked: RankedParticipant[] = [];
      const used = new Set<number>();
      while (picked.length < 23 && used.size < others.length) {
        const idx = cryptoRandomInt(others.length);
        if (!used.has(idx)) {
          used.add(idx);
          picked.push(others[idx]);
        }
      }
      winnerSliceIdx = cryptoRandomInt(picked.length + 1);
      displaySlices = [
        ...picked.slice(0, winnerSliceIdx),
        chosenWinner,
        ...picked.slice(winnerSliceIdx),
      ];
    }

    setWheelEntries(displaySlices);
    setSpinning(true);
    setDrawnWinner(null);

    const sliceArc = (Math.PI * 2) / displaySlices.length;
    // Pointer sits at top (-Math.PI / 2). Align winnerSliceIdx center directly under pointer.
    const desiredCenter = -Math.PI / 2;
    const jitter = (Math.random() - 0.5) * sliceArc * 0.58;
    const targetMod =
      desiredCenter - (winnerSliceIdx + 0.5) * sliceArc + jitter;

    const currentRot = rotationRef.current;
    const fullTurns = 6 + cryptoRandomInt(3); // 6..8 dramatic revolutions
    const normalizedCurrent = ((currentRot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const normalizedTarget = ((targetMod % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let delta = normalizedTarget - normalizedCurrent;
    if (delta <= 0) delta += Math.PI * 2;
    const endRot = currentRot + fullTurns * Math.PI * 2 + delta;

    const durationMs = 4600;
    const startTime = performance.now();
    lastSliceIdxRef.current = -1;

    cancelAnimationFrame(animFrameRef.current);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      // Quintic ease-out for authentic wheel friction deceleration
      const eased = 1 - Math.pow(1 - t, 4.2);
      const angle = currentRot + (endRot - currentRot) * eased;
      rotationRef.current = angle;

      drawWheel(displaySlices, angle);

      // Compute which slice is currently under the top pointer (-PI/2)
      const rel = ((-Math.PI / 2 - angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const activeIdx = Math.floor(rel / sliceArc) % displaySlices.length;
      if (activeIdx !== lastSliceIdxRef.current) {
        lastSliceIdxRef.current = activeIdx;
        setTickerName(displaySlices[activeIdx]?.name || '');
        if (t < 0.995) {
          playPickerTone('tick', mutedRef.current);
        }
      }

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        setDrawnWinner(chosenWinner);
        setTickerName(chosenWinner.name);
        setSessionWinners((prev) =>
          prev.some((w) => w.id === chosenWinner.id) ? prev : [chosenWinner, ...prev]
        );
        playPickerTone('win', mutedRef.current);
        launchConfetti();
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, [spinning, eligiblePool, drawWheel, launchConfetti]);

  const handleSaveWinner = async () => {
    if (!drawnWinner || savingWinner) return;
    setSavingWinner(true);
    try {
      await onConfirmWinner(drawnWinner, prizeLabel.trim() || 'Live Giveaway Draw Winner');
      setSavedWinnerIds((prev) =>
        prev.includes(drawnWinner.id) ? prev : [...prev, drawnWinner.id]
      );
    } finally {
      setSavingWinner(false);
    }
  };

  const isDrawnAlreadyConfirmed =
    drawnWinner !== null &&
    (drawnWinner.winnerStatus === 'confirmed' || savedWinnerIds.includes(drawnWinner.id));

  const wrapperClass = fullscreen
    ? 'fixed inset-0 z-50 overflow-y-auto bg-[#07131d] p-4 sm:p-8 text-white'
    : 'relative overflow-hidden rounded-2xl border border-slate-200 bg-[#081722] p-5 sm:p-7 text-white';

  return (
    <section className={wrapperClass} aria-label="Live Giveaway Winner Picker">
      <canvas
        ref={confettiRef}
        className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      />

      {/* Top Toolbar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          {fullscreen && <IStoreLogo variant="light" size="sm" />}
          <div>
            <div className="text-xs font-medium text-[#d9ff70]">
              Live Giveaway Wheel · {eligiblePool.length} Eligible{' '}
              {eligiblePool.length === 1 ? 'Entry' : 'Entries'}
            </div>
            <h2 className="font-[var(--font-display)] text-2xl font-extrabold uppercase tracking-tight text-white sm:text-3xl">
              Interactive Winner Picker
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMaskPhone((v) => !v)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 whitespace-nowrap"
          >
            {maskPhone ? <EyeOff className="h-3.5 w-3.5 text-[#d9ff70]" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{maskPhone ? 'Phone Masked' : 'Hide Phone (Live)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setMuted((v) => !v)}
            aria-label={muted ? 'Unmute wheel sound' : 'Mute wheel sound'}
            className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-[#d9ff70]" />}
          </button>

          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 whitespace-nowrap"
          >
            {fullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5 text-[#d9ff70]" />
                <span>Exit Stage</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5 text-[#d9ff70]" />
                <span>Fullscreen Stage</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main 2-Column Picker Layout */}
      <div
        className={`relative z-10 mt-6 grid grid-cols-1 items-center gap-8 lg:grid-cols-12 ${
          fullscreen ? 'mx-auto max-w-6xl pt-4' : ''
        }`}
      >
        {/* Left: Spin Wheel Canvas */}
        <div className="flex flex-col items-center lg:col-span-6">
          <div className="relative flex items-center justify-center w-full max-w-[420px]">
            {/* Top Pointer Arrow */}
            <div
              className="pointer-events-none absolute -top-2.5 left-1/2 z-10 -translate-x-1/2"
              aria-hidden="true"
            >
              <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
                <path
                  d="M17 32L4 5C3.5 4 4.2 3 5.3 3H28.7C29.8 3 30.5 4 30 5L17 32Z"
                  fill="#d9ff70"
                  stroke="#07131d"
                  strokeWidth="2.5"
                />
              </svg>
            </div>

            <button
              type="button"
              onClick={handleSpin}
              disabled={spinning || eligiblePool.length === 0}
              aria-label="Spin giveaway wheel"
              className="relative block w-full max-w-[390px] aspect-square rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d9ff70] disabled:cursor-not-allowed"
            >
              <canvas
                ref={canvasRef}
                width={560}
                height={560}
                className="h-full w-full"
              />
            </button>
          </div>

          {/* Live Pointer Readout */}
          <div className="mt-4 min-h-[28px] text-center">
            {spinning ? (
              <p className="font-[var(--font-display)] text-2xl font-extrabold tracking-wide text-[#d9ff70]">
                {tickerName || 'Spinning...'}
              </p>
            ) : eligiblePool.length > 24 ? (
              <p className="text-xs text-slate-400">
                Showing 24 wheel slices · Fairly draws from all{' '}
                <span className="font-mono font-semibold text-white tabular-nums">
                  {eligiblePool.length}
                </span>{' '}
                eligible entries
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Tap the wheel or press Spin to pick a random winner
              </p>
            )}
          </div>
        </div>

        {/* Right: Controls & Winner Reveal Stage */}
        <div className="space-y-5 lg:col-span-6">
          {/* Pool Filter Options */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 text-xs text-slate-200">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={qualifiedOnly}
                disabled={spinning}
                onChange={(e) => setQualifiedOnly(e.target.checked)}
                className="h-4 w-4 accent-[#d9ff70]"
              />
              <span>
                Qualified only ({settings.qualificationThreshold}/{settings.totalAttempts}+ goals)
              </span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeConfirmed}
                disabled={spinning}
                onChange={(e) => setExcludeConfirmed(e.target.checked)}
                className="h-4 w-4 accent-[#d9ff70]"
              />
              <span>Exclude confirmed winners</span>
            </label>
          </div>

          {/* Winner Reveal Display */}
          <div className="rounded-2xl border border-white/12 bg-[#0c2130] p-6">
            {drawnWinner ? (
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#d9ff70]">
                  <Trophy className="h-4 w-4" />
                  <span>
                    {isDrawnAlreadyConfirmed ? 'Official Confirmed Winner' : 'Selected Winner'}
                  </span>
                </div>

                <div className="mt-2 font-[var(--font-display)] text-4xl font-extrabold uppercase leading-tight tracking-tight text-white sm:text-5xl">
                  {drawnWinner.name}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <a
                    href={`tel:${drawnWinner.phone.replace(/[^+\d]/g, '')}`}
                    className="inline-flex items-center gap-2 font-mono text-lg font-bold text-[#d9ff70] hover:underline tabular-nums"
                  >
                    <Phone className="h-4 w-4" />
                    <span>
                      {maskPhone ? maskPhoneNumber(drawnWinner.phone) : drawnWinner.phone}
                    </span>
                  </a>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="font-mono font-semibold tabular-nums">
                    Score {drawnWinner.score}/{settings.totalAttempts}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {drawnWinner.team === 'iphone'
                      ? 'Team iPhone'
                      : drawnWinner.team === 'android'
                        ? 'Team Android'
                        : 'No Team'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-400">{drawnWinner.entryNumber}</span>
                </div>

                {/* Prize Note & Confirm Winner Action */}
                <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
                  <label className="block">
                    <span className="text-[11px] font-medium text-slate-400">
                      Winner Label / Prize Tier (saved to Audit Log)
                    </span>
                    <input
                      type="text"
                      value={prizeLabel}
                      onChange={(e) => setPrizeLabel(e.target.value)}
                      placeholder="e.g. 1st Prize — iPhone Winner"
                      className="mt-1 h-10 w-full rounded-xl border border-white/15 bg-[#081722] px-3 text-xs text-white placeholder:text-slate-500 focus:border-[#d9ff70] focus:outline-none"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={savingWinner || isDrawnAlreadyConfirmed}
                      onClick={handleSaveWinner}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#d9ff70] px-4 py-2.5 text-xs font-extrabold text-[#081722] hover:bg-[#e7ff9c] disabled:opacity-60 whitespace-nowrap"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        {isDrawnAlreadyConfirmed
                          ? 'Saved as Official Winner'
                          : savingWinner
                            ? 'Saving Winner...'
                            : 'Confirm & Save Official Winner'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={spinning || eligiblePool.length === 0}
                      onClick={handleSpin}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50 whitespace-nowrap"
                    >
                      <RotateCw className="h-4 w-4" />
                      <span>Spin Again</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-4">
                <div className="text-xs font-semibold text-slate-400">
                  {spinning ? 'Selecting Random Winner...' : 'Ready to Pick Winner'}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-200">
                  {eligiblePool.length > 0
                    ? `All ${eligiblePool.length} eligible participants are loaded from your live database. Press Spin to pick a winner with cryptographic randomness.`
                    : 'No eligible participants match the current filters yet.'}
                </p>

                <button
                  type="button"
                  disabled={spinning || eligiblePool.length === 0}
                  onClick={handleSpin}
                  className="mt-5 inline-flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#d9ff70] px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-[#081722] hover:bg-[#e7ff9c] active:scale-[0.99] disabled:opacity-50 transition-all"
                >
                  <RotateCw className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
                  <span>{spinning ? 'Spinning Wheel...' : 'Spin & Pick Winner'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Drawn in This Session */}
          {sessionWinners.length > 0 && (
            <div className="border-t border-white/10 pt-4">
              <div className="text-xs font-semibold text-slate-400">
                Drawn in This Session ({sessionWinners.length})
              </div>
              <div className="mt-2 divide-y divide-white/10">
                {sessionWinners.slice(0, 6).map((w, idx) => {
                  const confirmed =
                    w.winnerStatus === 'confirmed' || savedWinnerIds.includes(w.id);
                  return (
                    <div
                      key={w.id}
                      className="flex items-center justify-between gap-3 py-2 text-xs"
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-mono text-slate-400 mr-2">#{sessionWinners.length - idx}</span>
                        <span className="font-semibold text-white">{w.name}</span>
                        <span className="mx-2 text-slate-500">·</span>
                        <span className="font-mono text-slate-300 tabular-nums">
                          {maskPhone ? maskPhoneNumber(w.phone) : w.phone}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 font-semibold ${
                          confirmed ? 'text-[#d9ff70]' : 'text-slate-400'
                        }`}
                      >
                        {confirmed ? 'Confirmed' : 'Drawn'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
