import type { ShotOutcome } from '../types.ts';

// Core pitch & goal geometry preserved from the user's Three.js game code
export const GOAL_W = 12;
export const GOAL_H = 4;
export const GOAL_D = 2.5;
export const GOAL_Z = -15;
export const BACK_Z = GOAL_Z - GOAL_D;
export const AIM_RANGE = GOAL_W / 2 + 2.5; // ±8.5
export const CURVE_WINDOW_LOW = 0.45;
export const CURVE_WINDOW_HIGH = 0.55;

/**
 * Computes AI goalkeeper save coverage half-width for a given difficulty level (1..10).
 * Identical for both Team iPhone and Team Android — visual team choice never affects odds.
 */
export function getGoalieHalfWidth(difficulty: number, isCampaignMode = true): number {
  const clamped = Math.max(1, Math.min(10, difficulty));
  if (isCampaignMode) {
    // Fair progressive 5-shot shootout curve:
    // Lvl 1: ±2.65u (leaves ~3.1u corner pockets on each side)
    // Lvl 5: ±4.05u (tighter corners, still rewards accurate corner kicks & curve sweet spot)
    return Number((2.65 + (clamped - 1) * 0.35).toFixed(3));
  }
  const t = (clamped - 1) / 9;
  return Number((3.6 + t * 2.28).toFixed(3));
}

export interface EvaluatedShot {
  aimValue: number;
  power: number;
  finalX: number;
  finalY: number;
  rawAimX: number;
  curveFactor: number;
  goalieHalfWidth: number;
  outcome: ShotOutcome;
  accuracyScore: number;
}

/**
 * Deterministic penalty shot evaluator shared by server-side authoritative validation
 * and client-side trajectory playback.
 */
export function evaluatePenaltyShot(
  rawAimValue: number,
  rawPower: number,
  difficulty: number,
  isCampaignMode = true
): EvaluatedShot {
  const aimValue = Math.max(-1, Math.min(1, Number(rawAimValue) || 0));
  const power = Math.max(0, Math.min(100, Number(rawPower) || 0));
  const pf = power / 100;

  // Preserved parabolic height mapping from the user's JS code
  const finalY = 0.2 + 7.5 * pf * (1 - 0.52 * pf);

  // Preserved curve sweet spot (0.45..0.55)
  let curveFactor = 0;
  if (pf >= CURVE_WINDOW_LOW && pf <= CURVE_WINDOW_HIGH) {
    curveFactor = Math.sin(
      (Math.PI * (pf - CURVE_WINDOW_LOW)) / (CURVE_WINDOW_HIGH - CURVE_WINDOW_LOW)
    );
  }

  const rawAimX = aimValue * AIM_RANGE;
  const finalX = rawAimX - rawAimX * 0.75 * curveFactor;
  const goalieHalfWidth = getGoalieHalfWidth(difficulty, isCampaignMode);

  const inX = finalX > -(GOAL_W / 2 - 0.25) && finalX < GOAL_W / 2 - 0.25;
  const inY = finalY >= 0.3 && finalY <= GOAL_H - 0.15;

  let outcome: ShotOutcome;
  if (!inX || !inY) {
    outcome = 'MISS';
  } else if (Math.abs(finalX) < goalieHalfWidth && finalY < GOAL_H - 0.65) {
    // High top-corner rockets above keeper reach can still beat a diving keeper
    outcome = 'SAVE';
  } else if (Math.abs(finalX) < goalieHalfWidth * 0.85) {
    outcome = 'SAVE';
  } else {
    outcome = 'GOAL';
  }

  // Corner precision accuracy score (0..100) for optional accuracy tie-breaker
  let accuracyScore = 0;
  if (outcome === 'GOAL') {
    const cornerRatioX = Math.min(1, Math.abs(finalX) / (GOAL_W / 2 - 0.3));
    const heightBonusY = Math.min(1, finalY / (GOAL_H - 0.25));
    const sweetSpotBonus = curveFactor * 15;
    accuracyScore = Math.round(
      Math.min(100, 45 + cornerRatioX * 28 + heightBonusY * 18 + sweetSpotBonus)
    );
  } else if (outcome === 'SAVE') {
    accuracyScore = Math.round(Math.min(35, (Math.abs(finalX) / (GOAL_W / 2)) * 30));
  }

  return {
    aimValue: Number(aimValue.toFixed(4)),
    power: Number(power.toFixed(2)),
    finalX: Number(finalX.toFixed(3)),
    finalY: Number(finalY.toFixed(3)),
    rawAimX: Number(rawAimX.toFixed(3)),
    curveFactor: Number(curveFactor.toFixed(4)),
    goalieHalfWidth,
    outcome,
    accuracyScore,
  };
}

export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, '').replace(/^00/, '+');
}
