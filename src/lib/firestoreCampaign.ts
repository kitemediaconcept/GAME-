import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import type {
  AttemptRecord,
  AuditLogEntry,
  CampaignSettings,
  ParticipantRecord,
  ParticipantSessionState,
  RankedParticipant,
  TeamId,
  WinnerStatus,
} from '../types.ts';
import { ASSETS } from './assets.ts';
import { evaluatePenaltyShot } from './physics.ts';
import { db, handleFirestoreError, OperationType } from './firebase.ts';

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  title: 'iPhone vs Android',
  headline: 'Score 3 of 5 Penalties. Enter the Flagship Giveaway.',
  subheadline:
    'Enter your Name & Phone Number, pick Team iPhone or Team Android, and take 5 official shots.',
  bannerUrl: ASSETS.campaignBanner,
  prizeNote:
    'Headline prize shown for the grand winner tier. Winners are verified and selected after the giveaway window closes.',
  startDate: '2026-11-19',
  endDate: '2026-12-15',
  totalAttempts: 5,
  qualificationThreshold: 3,
  winnerCount: 10,
  tieBreakerRule: 'earliest_completion',
  participationPolicy: 'one_per_phone',
  rulesLocked: false,
  campaignStatus: 'open',
  prizes: [
    {
      id: 'prize-1',
      tier: '1st Place (Grand Winner)',
      title: 'Flagship iPhone (256 GB)',
      quantity: 1,
      description: 'Top confirmed giveaway winner.',
    },
    {
      id: 'prize-2',
      tier: '2nd – 3rd Place',
      title: 'Flagship Android Smartphone',
      quantity: 2,
      description: 'Runner-up confirmed giveaway winners.',
    },
    {
      id: 'prize-3',
      tier: '4th – 10th Place',
      title: 'Official Match Ball & Wireless Earbuds Pack',
      quantity: 7,
      description: 'Remaining confirmed winners from qualified entries.',
    },
  ],
  privacySummary:
    'Your Name and Phone Number are stored securely for giveaway winner selection and contact only. They are never shown publicly.',
  eligibilitySummary:
    'One official 5-kick entry per phone number. Scoring 3 or more goals out of 5 qualifies you for the giveaway draw.',
};

export class DuplicatePhoneEntryError extends Error {
  readonly code = 'ALREADY_ENTERED';
  constructor(message: string) {
    super(message);
    this.name = 'DuplicatePhoneEntryError';
  }
}

function toIsoString(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

export function normalizeDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, '').slice(0, 20);
}

function generateSessionSecret(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function makeEntryNumber(normalizedDigits: string): string {
  const tail = normalizedDigits.slice(-4).padStart(4, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const rand = chars[bytes[0] % chars.length] + chars[bytes[1] % chars.length];
  return `IVA-${tail}${rand}`;
}

function mapDocToParticipant(id: string, d: DocumentData): ParticipantRecord {
  const teamVal = d.team === 'iphone' || d.team === 'android' ? d.team : null;
  const statusVal: ParticipantRecord['status'] =
    d.status === 'completed'
      ? 'completed'
      : d.status === 'in_progress' || d.status === 'team_selected'
        ? 'in_progress'
        : 'registered';

  return {
    id,
    entryNumber: String(d.entryNumber || `IVA-${id.slice(-6).toUpperCase()}`),
    name: String(d.name || ''),
    phone: String(d.phone || ''),
    normalizedPhone: String(d.normalizedPhone || ''),
    team: teamVal,
    acceptedRules: Boolean(d.rulesAccepted ?? true),
    marketingOptIn: false,
    status: statusVal,
    attempts: Array.isArray(d.attempts) ? (d.attempts as AttemptRecord[]) : [],
    score: Number(d.score || 0),
    totalAccuracy: Number(d.totalAccuracy || 0),
    qualified: Boolean(d.qualified),
    winnerStatus: (['none', 'proposed', 'confirmed', 'removed'].includes(d.winnerStatus)
      ? d.winnerStatus
      : 'none') as WinnerStatus,
    winnerConfirmedAt: d.winnerConfirmedAt ? String(d.winnerConfirmedAt) : null,
    overrideNote: d.overrideNote ? String(d.overrideNote) : null,
    createdAt: toIsoString(d.createdAt),
    completedAt: d.completedAt ? String(d.completedAt) : null,
  };
}

export function rankParticipantsList(
  participants: ParticipantRecord[],
  settings: CampaignSettings
): RankedParticipant[] {
  const eligible = participants
    .filter((p) => p.status === 'completed' && p.qualified && p.winnerStatus !== 'removed')
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (
        settings.tieBreakerRule === 'highest_accuracy_score' &&
        b.totalAccuracy !== a.totalAccuracy
      ) {
        return b.totalAccuracy - a.totalAccuracy;
      }
      const ta = new Date(a.completedAt || a.createdAt).getTime();
      const tb = new Date(b.completedAt || b.createdAt).getTime();
      return ta - tb;
    });

  const rankById = new Map<string, number>();
  eligible.forEach((p, i) => rankById.set(p.id, i + 1));

  return participants.map((p) => ({
    ...p,
    provisionalRank: rankById.get(p.id) ?? null,
  }));
}

export async function fetchCampaignSettingsFirestore(): Promise<CampaignSettings> {
  try {
    const snap = await getDoc(doc(db, 'campaign', 'main'));
    if (!snap.exists()) {
      return DEFAULT_CAMPAIGN_SETTINGS;
    }
    const d = snap.data();
    const tieMap: Record<string, CampaignSettings['tieBreakerRule']> = {
      earliest_completion: 'earliest_completion',
      accuracy_score: 'highest_accuracy_score',
      random_draw: 'verified_random_draw',
    };
    return {
      ...DEFAULT_CAMPAIGN_SETTINGS,
      title: String(d.title || DEFAULT_CAMPAIGN_SETTINGS.title),
      headline: String(d.headline || DEFAULT_CAMPAIGN_SETTINGS.headline),
      subheadline: String(d.subheadline || DEFAULT_CAMPAIGN_SETTINGS.subheadline),
      bannerUrl: String(d.bannerUrl || DEFAULT_CAMPAIGN_SETTINGS.bannerUrl),
      startDate: String(d.startDate || DEFAULT_CAMPAIGN_SETTINGS.startDate),
      endDate: String(d.endDate || DEFAULT_CAMPAIGN_SETTINGS.endDate),
      campaignStatus:
        d.campaignStatus === 'closed' || d.campaignStatus === 'draft' ? d.campaignStatus : 'open',
      totalAttempts: Number(d.totalAttempts || 5),
      qualificationThreshold: Number(d.qualificationThreshold || 3),
      winnerCount: Number(d.winnerCount || 10),
      tieBreakerRule: tieMap[String(d.tieBreakerRule)] || 'earliest_completion',
      prizeNote: String(d.prizeNote ?? DEFAULT_CAMPAIGN_SETTINGS.prizeNote),
      eligibilitySummary: String(d.rulesText || DEFAULT_CAMPAIGN_SETTINGS.eligibilitySummary),
      prizes:
        Array.isArray(d.prizes) && d.prizes.length > 0
          ? d.prizes
          : DEFAULT_CAMPAIGN_SETTINGS.prizes,
    };
  } catch (err) {
    console.warn('Using default campaign settings:', err);
    return DEFAULT_CAMPAIGN_SETTINGS;
  }
}

export async function registerParticipantFirestore(
  payload: {
    name: string;
    phone: string;
    acceptedRules: boolean;
  },
  existingLocalSession?: ParticipantSessionState | null
): Promise<ParticipantSessionState> {
  const cleanName = payload.name.trim().slice(0, 80);
  const cleanPhone = payload.phone.trim().slice(0, 25);
  const normalizedPhone = normalizeDigitsOnly(cleanPhone);

  if (cleanName.length < 2) {
    throw new Error('Please enter your full name (at least 2 characters).');
  }
  if (normalizedPhone.length < 7 || normalizedPhone.length > 20) {
    throw new Error('Please enter a valid phone number (7 to 20 digits).');
  }
  if (!payload.acceptedRules) {
    throw new Error('Please accept the campaign rules to continue.');
  }

  const docId = `p_${normalizedPhone}`;

  // If this device already holds the active session for this phone number, resume smoothly
  if (existingLocalSession && existingLocalSession.id === docId) {
    return existingLocalSession;
  }

  const entryNumber = makeEntryNumber(normalizedPhone);
  const sessionSecret = generateSessionSecret();

  const newRecord = {
    entryNumber,
    name: cleanName,
    phone: cleanPhone,
    normalizedPhone,
    sessionSecret,
    rulesAccepted: true,
    team: 'none',
    status: 'registered',
    attempts: [],
    score: 0,
    totalAccuracy: 0,
    qualified: false,
    winnerStatus: 'none',
    overrideNote: '',
    completedAt: '',
    winnerConfirmedAt: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = doc(db, 'participants', docId);
  const path = `participants/${docId}`;

  try {
    await setDoc(docRef, newRecord);
    return {
      id: docId,
      entryNumber,
      name: cleanName,
      phone: cleanPhone,
      team: null,
      status: 'registered',
      attempts: [],
      score: 0,
      totalAccuracy: 0,
      qualified: false,
      provisionalRank: null,
      qualifiedTotal: 0,
      completedAt: null,
      sessionToken: sessionSecret,
    };
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'permission-denied' || code === 'already-exists') {
      throw new DuplicatePhoneEntryError(
        'This phone number has already entered the giveaway. Only one entry per phone number is allowed.'
      );
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function selectTeamFirestore(
  session: ParticipantSessionState,
  team: TeamId
): Promise<ParticipantSessionState> {
  const docRef = doc(db, 'participants', session.id);
  const path = `participants/${session.id}`;
  try {
    await updateDoc(docRef, {
      team,
      status: 'team_selected',
      updatedAt: serverTimestamp(),
    });
    return {
      ...session,
      team,
      status: 'in_progress',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitShotFirestore(
  session: ParticipantSessionState,
  settings: CampaignSettings,
  payload: { aimValue: number; power: number; idempotencyKey: string }
): Promise<{ attempt: AttemptRecord; session: ParticipantSessionState }> {
  // Idempotent guard
  const dup = session.attempts.find((a) => a.idempotencyKey === payload.idempotencyKey);
  if (dup) {
    return { attempt: dup, session };
  }

  if (session.status === 'completed' || session.attempts.length >= settings.totalAttempts) {
    throw new Error('All official attempts have already been completed.');
  }

  const attemptNumber = session.attempts.length + 1;
  const evalResult = evaluatePenaltyShot(
    payload.aimValue,
    payload.power,
    attemptNumber,
    true
  );

  const nowIso = new Date().toISOString();
  const attempt: AttemptRecord = {
    attemptNumber,
    idempotencyKey: payload.idempotencyKey.slice(0, 64),
    aimValue: evalResult.aimValue,
    power: evalResult.power,
    finalX: evalResult.finalX,
    finalY: evalResult.finalY,
    curveFactor: evalResult.curveFactor,
    difficulty: attemptNumber,
    goalieHalfWidth: evalResult.goalieHalfWidth,
    outcome: evalResult.outcome,
    accuracyScore: evalResult.accuracyScore,
    timestamp: nowIso,
  };

  const nextAttempts = [...session.attempts, attempt];
  const nextScore = session.score + (attempt.outcome === 'GOAL' ? 1 : 0);
  const prevAccuracy =
    typeof session.totalAccuracy === 'number'
      ? session.totalAccuracy
      : session.attempts.reduce((sum, a) => sum + (a.accuracyScore || 0), 0);
  const nextAccuracy = Math.min(1000, prevAccuracy + attempt.accuracyScore);
  const isFinished = nextAttempts.length >= settings.totalAttempts;
  const nextQualified = nextScore >= settings.qualificationThreshold;

  const docRef = doc(db, 'participants', session.id);
  const path = `participants/${session.id}`;

  try {
    await updateDoc(docRef, {
      attempts: nextAttempts,
      score: nextScore,
      totalAccuracy: nextAccuracy,
      qualified: nextQualified,
      status: isFinished ? 'completed' : 'in_progress',
      completedAt: isFinished ? nowIso : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  const updatedSession: ParticipantSessionState = {
    ...session,
    status: isFinished ? 'completed' : 'in_progress',
    attempts: nextAttempts,
    score: nextScore,
    totalAccuracy: nextAccuracy,
    qualified: nextQualified,
    completedAt: isFinished ? nowIso : null,
  };

  return { attempt, session: updatedSession };
}

// ─── ADMIN REAL-TIME SUBSCRIPTIONS & GIVEAWAY OPERATIONS ──────
export function subscribeAdminParticipants(
  onData: (participants: ParticipantRecord[]) => void,
  onErr: (err: Error) => void
): () => void {
  const path = 'participants';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapDocToParticipant(d.id, d.data()));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onErr(wrapped as Error);
      }
    }
  );
}

export function subscribeAdminAuditLogs(
  onData: (logs: AuditLogEntry[]) => void,
  onErr: (err: Error) => void
): () => void {
  const path = 'auditLogs';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list: AuditLogEntry[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          timestamp: toIsoString(d.createdAt),
          actor: String(d.actor || 'Admin'),
          action: String(d.action || ''),
          targetEntryNumber: d.targetEntryNumber ? String(d.targetEntryNumber) : undefined,
          reason: String(d.reason || ''),
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onErr(wrapped as Error);
      }
    }
  );
}

async function appendAuditLog(
  adminUser: User,
  action: string,
  reason: string,
  targetEntryNumber = ''
) {
  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `auditLogs/${logId}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      actor: (adminUser.email || 'Admin').slice(0, 120),
      actorUid: adminUser.uid,
      action: action.slice(0, 80),
      targetEntryNumber: targetEntryNumber.slice(0, 20),
      reason: reason.slice(0, 400),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function adminPickRandomGiveawayWinners(
  adminUser: User,
  participants: ParticipantRecord[],
  count: number,
  qualifiedOnly: boolean
): Promise<ParticipantRecord[]> {
  const pool = participants.filter(
    (p) =>
      p.winnerStatus !== 'removed' &&
      p.winnerStatus !== 'confirmed' &&
      (!qualifiedOnly || p.qualified)
  );

  if (pool.length === 0) {
    throw new Error(
      qualifiedOnly
        ? 'No qualified entries available for the giveaway draw yet.'
        : 'No eligible participants available for the draw yet.'
    );
  }

  // Cryptographically strong Fisher-Yates shuffle
  const shuffled = [...pool];
  const rand = new Uint32Array(shuffled.length);
  crypto.getRandomValues(rand);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rand[i] % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const chosen = shuffled.slice(0, Math.min(count, shuffled.length));
  const chosenIds = new Set(chosen.map((c) => c.id));

  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const p of participants) {
    if (p.winnerStatus === 'confirmed') continue;
    if (chosenIds.has(p.id)) {
      updates.push({
        id: p.id,
        data: {
          winnerStatus: 'proposed',
          overrideNote: 'Selected via Giveaway Random Draw',
          winnerConfirmedAt: '',
          updatedAt: serverTimestamp(),
        },
      });
    } else if (p.winnerStatus === 'proposed') {
      updates.push({
        id: p.id,
        data: {
          winnerStatus: 'none',
          overrideNote: '',
          winnerConfirmedAt: '',
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  try {
    for (let i = 0; i < updates.length; i += 400) {
      const batch = writeBatch(db);
      for (const u of updates.slice(i, i + 400)) {
        batch.update(doc(db, 'participants', u.id), u.data);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'participants');
  }

  await appendAuditLog(
    adminUser,
    'GIVEAWAY_RANDOM_DRAW',
    `Selected ${chosen.length} provisional winner(s) from ${pool.length} ${qualifiedOnly ? 'qualified' : 'total'} entries.`
  );

  return chosen;
}

export async function adminProposeTopScoreWinners(
  adminUser: User,
  participants: ParticipantRecord[],
  settings: CampaignSettings
): Promise<number> {
  const ranked = rankParticipantsList(participants, settings)
    .filter((p) => p.qualified && p.winnerStatus !== 'removed')
    .sort((a, b) => (a.provisionalRank ?? 9999) - (b.provisionalRank ?? 9999));

  const selectedIds = new Set(ranked.slice(0, settings.winnerCount).map((p) => p.id));
  if (selectedIds.size === 0) {
    throw new Error('No qualified participants available yet.');
  }

  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const p of participants) {
    if (p.winnerStatus === 'confirmed') continue;
    if (selectedIds.has(p.id)) {
      updates.push({
        id: p.id,
        data: {
          winnerStatus: 'proposed',
          overrideNote: 'Top score provisional selection',
          winnerConfirmedAt: '',
          updatedAt: serverTimestamp(),
        },
      });
    } else if (p.winnerStatus === 'proposed') {
      updates.push({
        id: p.id,
        data: {
          winnerStatus: 'none',
          overrideNote: '',
          winnerConfirmedAt: '',
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  try {
    for (let i = 0; i < updates.length; i += 400) {
      const batch = writeBatch(db);
      for (const u of updates.slice(i, i + 400)) {
        batch.update(doc(db, 'participants', u.id), u.data);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'participants');
  }

  await appendAuditLog(
    adminUser,
    'PROPOSED_TOP_WINNERS',
    `Selected top ${selectedIds.size} qualified entries by score & tie-breaker.`
  );

  return selectedIds.size;
}

export async function adminConfirmProvisionalWinners(
  adminUser: User,
  participants: ParticipantRecord[]
): Promise<number> {
  const proposed = participants.filter((p) => p.winnerStatus === 'proposed');
  if (proposed.length === 0) {
    throw new Error(
      'No provisional winners to confirm. Run a Giveaway Draw or Top Selection first.'
    );
  }

  const nowIso = new Date().toISOString();
  try {
    for (let i = 0; i < proposed.length; i += 400) {
      const batch = writeBatch(db);
      for (const p of proposed.slice(i, i + 400)) {
        batch.update(doc(db, 'participants', p.id), {
          winnerStatus: 'confirmed',
          winnerConfirmedAt: nowIso,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'participants');
  }

  await appendAuditLog(
    adminUser,
    'WINNERS_CONFIRMED',
    `Confirmed ${proposed.length} official giveaway winner(s).`
  );

  return proposed.length;
}

export async function adminOverrideParticipantWinner(
  adminUser: User,
  participant: ParticipantRecord,
  action: 'add' | 'confirm' | 'remove',
  reason: string
): Promise<void> {
  const cleanReason = reason.trim().slice(0, 300);
  if (cleanReason.length < 5) {
    throw new Error('Please enter a brief audit reason (minimum 5 characters).');
  }
  const nextStatus: WinnerStatus =
    action === 'confirm' ? 'confirmed' : action === 'remove' ? 'removed' : 'proposed';
  const nowIso = action === 'confirm' ? new Date().toISOString() : '';

  const path = `participants/${participant.id}`;
  try {
    await updateDoc(doc(db, 'participants', participant.id), {
      winnerStatus: nextStatus,
      overrideNote: cleanReason,
      winnerConfirmedAt: nowIso,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  await appendAuditLog(
    adminUser,
    `MANUAL_OVERRIDE_${action.toUpperCase()}`,
    cleanReason,
    participant.entryNumber
  );
}

export async function adminDeleteParticipant(
  adminUser: User,
  participant: ParticipantRecord
): Promise<void> {
  const path = `participants/${participant.id}`;
  try {
    await deleteDoc(doc(db, 'participants', participant.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }

  await appendAuditLog(
    adminUser,
    'PARTICIPANT_DELETED',
    `Removed entry for ${participant.name} (${participant.phone})`,
    participant.entryNumber
  );
}

export async function adminSaveCampaignSettings(
  adminUser: User,
  settings: CampaignSettings
): Promise<void> {
  const tieMap: Record<CampaignSettings['tieBreakerRule'], string> = {
    earliest_completion: 'earliest_completion',
    highest_accuracy_score: 'accuracy_score',
    verified_random_draw: 'random_draw',
  };
  const path = 'campaign/main';
  try {
    await setDoc(doc(db, 'campaign', 'main'), {
      title: settings.title.trim().slice(0, 100) || 'iPhone vs Android',
      headline: settings.headline.trim().slice(0, 140),
      subheadline: settings.subheadline.trim().slice(0, 300),
      bannerUrl: settings.bannerUrl.trim().slice(0, 500),
      startDate: settings.startDate.slice(0, 30),
      endDate: settings.endDate.slice(0, 30),
      campaignStatus: settings.campaignStatus,
      totalAttempts: Math.max(1, Math.min(10, Math.round(settings.totalAttempts))),
      qualificationThreshold: Math.max(
        1,
        Math.min(10, Math.round(settings.qualificationThreshold))
      ),
      winnerCount: Math.max(1, Math.min(100, Math.round(settings.winnerCount))),
      tieBreakerRule: tieMap[settings.tieBreakerRule] || 'earliest_completion',
      rulesText: (settings.eligibilitySummary || DEFAULT_CAMPAIGN_SETTINGS.eligibilitySummary).slice(
        0,
        4000
      ),
      prizeNote: settings.prizeNote.slice(0, 500),
      prizes: settings.prizes.slice(0, 10),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }

  await appendAuditLog(
    adminUser,
    'CAMPAIGN_SETTINGS_UPDATED',
    'Updated campaign configuration and rules.'
  );
}

// ─── GIVEAWAY APP EXPORT FORMATTERS (Name & Phone Only) ───────
function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export type GiveawayExportFormat = 'csv' | 'lines' | 'tsv';

export function buildGiveawayExportText(
  rows: ParticipantRecord[],
  format: GiveawayExportFormat
): string {
  if (format === 'lines') {
    // Ready to paste directly into Wheel of Names / Random Name Picker / Giveaway apps
    return rows.map((p) => `${p.name} - ${p.phone}`).join('\n');
  }
  if (format === 'tsv') {
    const header = 'Name\tPhone';
    const body = rows.map((p) => `${p.name}\t${p.phone}`);
    return [header, ...body].join('\n');
  }
  // Standard clean 2-column CSV: Name,Phone
  const header = 'Name,Phone';
  const body = rows.map((p) => [p.name, p.phone].map((v) => escapeCsvCell(v)).join(','));
  return [header, ...body].join('\n');
}

export function downloadGiveawayCsvFile(rows: ParticipantRecord[], filenamePrefix: string) {
  const csv = `\uFEFF${buildGiveawayExportText(rows, 'csv')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Shares the Name,Phone CSV file directly via native Share Sheet (WhatsApp, Email, Telegram, etc.)
 * and gracefully falls back to instant CSV download on browsers without file-share support.
 */
export async function shareGiveawayCsvFile(
  rows: ParticipantRecord[],
  filenamePrefix: string
): Promise<'shared' | 'downloaded'> {
  const csv = `\uFEFF${buildGiveawayExportText(rows, 'csv')}`;
  const fileName = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], fileName, { type: 'text/csv' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Qualified Giveaway Participants (Name & Phone)',
          text: `${rows.length} qualified entries (Name & Phone CSV).`,
          files: [file],
        });
        return 'shared';
      }
    } catch (err) {
      // If user dismissed share sheet, do not force a fallback download
      if (err instanceof Error && err.name === 'AbortError') {
        return 'shared';
      }
    }
  }

  downloadGiveawayCsvFile(rows, filenamePrefix);
  return 'downloaded';
}
