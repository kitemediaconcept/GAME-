import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import QRCode from 'qrcode';
import type {
  AdminOverviewPayload,
  AttemptRecord,
  AuditLogEntry,
  CampaignSettings,
  ParticipantRecord,
  ParticipantSessionState,
  PublicCampaignPayload,
  PublicLeaderboardEntry,
  RankedParticipant,
  TeamId,
} from './src/types.ts';
import { evaluatePenaltyShot, normalizePhoneNumber } from './src/lib/physics.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'admin2026';
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'campaign-db.json');

interface DatabaseSchema {
  nextEntrySeq: number;
  settings: CampaignSettings;
  participants: ParticipantRecord[];
  sessionTokens: Record<string, string>; // participantId -> token
  auditLog: AuditLogEntry[];
}

const DEFAULT_BANNER_URL = '/src/assets/images/campaign_banner_stadium_1795079284582.jpg';

function createSeedDatabase(): DatabaseSchema {
  const participants: ParticipantRecord[] = [];

  return {
    nextEntrySeq: 1,
    settings: {
      title: 'iPhone vs Android',
      headline: 'Play the Shootout. Win an iPhone!',
      subheadline: 'Choose your team. Take 5 penalties. Compete for a place among 10 winners.',
      bannerUrl: DEFAULT_BANNER_URL,
      prizeNote:
        'Headline prize shown for the grand winner tier. Full prize allocation across all 10 confirmed winners is listed in the official prize schedule below.',
      startDate: '2026-11-15',
      endDate: '2026-12-15',
      totalAttempts: 5,
      qualificationThreshold: 3,
      winnerCount: 10,
      tieBreakerRule: 'earliest_completion',
      participationPolicy: 'one_per_phone',
      rulesLocked: true,
      campaignStatus: 'open',
      prizes: [
        {
          id: 'prize-1',
          tier: '1st Place (Grand Winner)',
          title: 'Flagship iPhone (256 GB)',
          quantity: 1,
          description: 'Top ranked verified participant after campaign close.',
        },
        {
          id: 'prize-2',
          tier: '2nd – 3rd Place',
          title: 'Flagship Android Smartphone',
          quantity: 2,
          description: 'Awarded to ranks #2 and #3 on the confirmed final table.',
        },
        {
          id: 'prize-3',
          tier: '4th – 10th Place',
          title: 'Official Match Ball & Wireless Earbuds Pack',
          quantity: 7,
          description: 'Awarded to verified qualifiers ranked #4 through #10.',
        },
      ],
      privacySummary:
        'Your name, email, and phone number are used solely to verify eligibility, prevent duplicate entries, and contact confirmed winners. Public leaderboards never show email addresses or phone numbers.',
      eligibilitySummary:
        'Open to participants aged 18+. One official eligible entry per verified phone number. Scoring 3/5 or higher qualifies you for giveaway ranking; qualification does not guarantee a prize. Official winners are reviewed and confirmed after the campaign closes.',
    },
    participants,
    sessionTokens: {},
    auditLog: [
      {
        id: 'audit-init-1',
        timestamp: new Date().toISOString(),
        actor: 'Campaign Admin',
        action: 'CAMPAIGN_PUBLISHED',
        reason: 'Published iPhone vs Android Penalty Shootout Giveaway with 5 attempts and 3/5 qualification threshold.',
      },
    ],
  };
}

function loadDatabase(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const seed = createSeedDatabase();
    saveDatabase(seed);
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw) as DatabaseSchema;
  } catch {
    const seed = createSeedDatabase();
    saveDatabase(seed);
    return seed;
  }
}

function saveDatabase(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpPath, DB_PATH);
}

const db = loadDatabase();
const adminTokens = new Set<string>();

function deterministicTieHash(id: string): number {
  const hash = crypto.createHash('sha256').update(`iva-draw-${id}`).digest();
  return hash.readUInt32BE(0);
}

function rankParticipants(
  participants: ParticipantRecord[],
  settings: CampaignSettings
): RankedParticipant[] {
  const eligible = participants.filter(
    (p) => p.status === 'completed' && p.score >= settings.qualificationThreshold
  );

  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (settings.tieBreakerRule === 'highest_accuracy_score') {
      if (b.totalAccuracy !== a.totalAccuracy) return b.totalAccuracy - a.totalAccuracy;
    } else if (settings.tieBreakerRule === 'verified_random_draw') {
      return deterministicTieHash(a.id) - deterministicTieHash(b.id);
    }
    // Default / final deterministic fallback: earliest completion time
    const timeA = a.completedAt ? new Date(a.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    const timeB = b.completedAt ? new Date(b.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    return timeA - timeB;
  });

  const rankMap = new Map<string, number>();
  eligible.forEach((p, idx) => {
    rankMap.set(p.id, idx + 1);
  });

  return participants.map((p) => ({
    ...p,
    qualified: p.status === 'completed' && p.score >= settings.qualificationThreshold,
    provisionalRank: rankMap.get(p.id) ?? null,
  }));
}

function maskPublicName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Player';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function buildPublicPayload(): PublicCampaignPayload {
  const ranked = rankParticipants(db.participants, db.settings);
  const completed = ranked.filter((p) => p.status === 'completed');
  const qualified = completed.filter((p) => p.qualified);

  const sortedLeaderboard: PublicLeaderboardEntry[] = qualified
    .sort((a, b) => (a.provisionalRank ?? 9999) - (b.provisionalRank ?? 9999))
    .slice(0, 30)
    .map((p) => ({
      entryNumber: p.entryNumber,
      displayName: maskPublicName(p.name),
      team: p.team ?? 'iphone',
      score: p.score,
      totalAttempts: db.settings.totalAttempts,
      qualified: p.qualified,
      provisionalRank: p.provisionalRank,
      completedAt: p.completedAt,
      winnerStatus: p.winnerStatus === 'confirmed' ? 'confirmed' : 'none',
    }));

  return {
    settings: db.settings,
    stats: {
      totalParticipants: ranked.length,
      completedGames: completed.length,
      qualifiedParticipants: qualified.length,
      iphoneCount: ranked.filter((p) => p.team === 'iphone').length,
      androidCount: ranked.filter((p) => p.team === 'android').length,
      confirmedWinners: ranked.filter((p) => p.winnerStatus === 'confirmed').length,
    },
    leaderboard: sortedLeaderboard,
  };
}

function buildAdminOverview(): AdminOverviewPayload {
  const ranked = rankParticipants(db.participants, db.settings);
  const completed = ranked.filter((p) => p.status === 'completed');
  const qualified = completed.filter((p) => p.qualified);

  const sortedParticipants = [...ranked].sort((a, b) => {
    if (a.provisionalRank !== null && b.provisionalRank !== null) {
      return a.provisionalRank - b.provisionalRank;
    }
    if (a.provisionalRank !== null) return -1;
    if (b.provisionalRank !== null) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return {
    settings: db.settings,
    stats: {
      totalParticipants: ranked.length,
      completedGames: completed.length,
      qualifiedParticipants: qualified.length,
      iphoneCount: ranked.filter((p) => p.team === 'iphone').length,
      androidCount: ranked.filter((p) => p.team === 'android').length,
      proposedWinners: ranked.filter((p) => p.winnerStatus === 'proposed').length,
      confirmedWinners: ranked.filter((p) => p.winnerStatus === 'confirmed').length,
    },
    participants: sortedParticipants,
    auditLog: [...db.auditLog].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ),
  };
}

function buildSessionState(participant: ParticipantRecord, token: string): ParticipantSessionState {
  const ranked = rankParticipants(db.participants, db.settings);
  const match = ranked.find((p) => p.id === participant.id);
  const qualifiedTotal = ranked.filter((p) => p.qualified).length;

  return {
    id: participant.id,
    entryNumber: participant.entryNumber,
    name: participant.name,
    team: participant.team,
    status: participant.status,
    attempts: participant.attempts,
    score: participant.score,
    qualified: match?.qualified ?? false,
    provisionalRank: match?.provisionalRank ?? null,
    qualifiedTotal,
    completedAt: participant.completedAt,
    sessionToken: token,
  };
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !adminTokens.has(token)) {
    res.status(401).json({ error: 'Unauthorized admin session. Please sign in.' });
    return;
  }
  next();
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // ─── PUBLIC CAMPAIGN API ───────────────────────────────────
  app.get('/api/campaign', (_req, res) => {
    res.json(buildPublicPayload());
  });

  // Register participant & issue server session token
  app.post('/api/register', (req, res) => {
    const { name, email, phone, acceptedRules, marketingOptIn } = req.body ?? {};

    if (db.settings.campaignStatus === 'closed') {
      res.status(403).json({ error: 'This giveaway campaign has closed for new entries.' });
      return;
    }

    const cleanName = String(name ?? '').trim();
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    const cleanPhone = String(phone ?? '').trim();
    const normalizedPhone = normalizePhoneNumber(cleanPhone);

    if (cleanName.length < 2 || cleanName.length > 80) {
      res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (normalizedPhone.replace(/\D/g, '').length < 7) {
      res.status(400).json({ error: 'Please enter a valid phone number (at least 7 digits).' });
      return;
    }
    if (!acceptedRules) {
      res.status(400).json({ error: 'You must accept the campaign rules and privacy notice to enter.' });
      return;
    }

    // Enforce participation policy
    if (db.settings.participationPolicy === 'one_per_phone') {
      const existing = db.participants.find((p) => p.normalizedPhone === normalizedPhone);
      if (existing) {
        if (existing.status === 'completed') {
          res.status(409).json({
            error:
              'This phone number has already completed its official giveaway entry. Only one official entry per phone number is allowed. You can still play Practice Mode anytime.',
            code: 'ALREADY_ENTERED',
            entryNumber: existing.entryNumber,
          });
          return;
        }
        // Resume unfinished session cleanly
        const existingToken =
          db.sessionTokens[existing.id] || crypto.randomBytes(24).toString('hex');
        db.sessionTokens[existing.id] = existingToken;
        saveDatabase(db);
        res.json({ session: buildSessionState(existing, existingToken), resumed: true });
        return;
      }
    } else if (db.settings.participationPolicy === 'one_per_email') {
      const existing = db.participants.find((p) => p.email === cleanEmail);
      if (existing && existing.status === 'completed') {
        res.status(409).json({
          error:
            'This email address has already completed its official giveaway entry. Only one official entry per email is allowed.',
          code: 'ALREADY_ENTERED',
          entryNumber: existing.entryNumber,
        });
        return;
      }
    }

    const entrySeq = db.nextEntrySeq++;
    const entryNumber = `IVA-${String(entrySeq).padStart(4, '0')}`;
    const id = `p-${crypto.randomUUID()}`;
    const sessionToken = crypto.randomBytes(24).toString('hex');

    const record: ParticipantRecord = {
      id,
      entryNumber,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      normalizedPhone,
      team: null,
      acceptedRules: true,
      marketingOptIn: Boolean(marketingOptIn),
      status: 'registered',
      attempts: [],
      score: 0,
      totalAccuracy: 0,
      qualified: false,
      winnerStatus: 'none',
      winnerConfirmedAt: null,
      overrideNote: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    db.participants.push(record);
    db.sessionTokens[id] = sessionToken;
    // Automatically lock competition rules once real entries are open
    db.settings.rulesLocked = true;
    saveDatabase(db);

    res.status(201).json({ session: buildSessionState(record, sessionToken), resumed: false });
  });

  // Select team (iPhone or Android)
  app.post('/api/sessions/:id/team', (req, res) => {
    const { id } = req.params;
    const { team, sessionToken } = req.body ?? {};
    const participant = db.participants.find((p) => p.id === id);

    if (!participant || db.sessionTokens[id] !== sessionToken) {
      res.status(403).json({ error: 'Invalid or expired game session.' });
      return;
    }
    if (team !== 'iphone' && team !== 'android') {
      res.status(400).json({ error: 'Team must be either iphone or android.' });
      return;
    }
    if (participant.attempts.length > 0) {
      res.status(409).json({ error: 'Team cannot be changed once penalty kicks have begun.' });
      return;
    }

    participant.team = team;
    participant.status = 'in_progress';
    saveDatabase(db);

    res.json({ session: buildSessionState(participant, sessionToken) });
  });

  // Authoritative server-side penalty shot submission
  app.post('/api/sessions/:id/shoot', (req, res) => {
    const { id } = req.params;
    const { sessionToken, aimValue, power, idempotencyKey } = req.body ?? {};
    const participant = db.participants.find((p) => p.id === id);

    if (!participant || db.sessionTokens[id] !== sessionToken) {
      res.status(403).json({ error: 'Invalid or expired game session.' });
      return;
    }
    if (!participant.team) {
      res.status(400).json({ error: 'Please choose Team iPhone or Team Android before shooting.' });
      return;
    }

    const key = String(idempotencyKey || '').trim();
    if (!key) {
      res.status(400).json({ error: 'Missing shot idempotency key.' });
      return;
    }

    // Duplicate tap protection: return already recorded attempt cleanly
    const duplicate = participant.attempts.find((a) => a.idempotencyKey === key);
    if (duplicate) {
      res.json({
        attempt: duplicate,
        session: buildSessionState(participant, sessionToken),
        duplicate: true,
      });
      return;
    }

    if (
      participant.status === 'completed' ||
      participant.attempts.length >= db.settings.totalAttempts
    ) {
      res.status(409).json({
        error: 'All 5 penalty attempts have already been completed for this entry.',
        session: buildSessionState(participant, sessionToken),
      });
      return;
    }

    const attemptNumber = participant.attempts.length + 1;
    // Progressive difficulty 1..5, strictly identical for Team iPhone and Team Android
    const difficulty = attemptNumber;
    const evaluated = evaluatePenaltyShot(Number(aimValue), Number(power), difficulty, true);

    const attempt: AttemptRecord = {
      attemptNumber,
      idempotencyKey: key,
      aimValue: evaluated.aimValue,
      power: evaluated.power,
      finalX: evaluated.finalX,
      finalY: evaluated.finalY,
      curveFactor: evaluated.curveFactor,
      difficulty,
      goalieHalfWidth: evaluated.goalieHalfWidth,
      outcome: evaluated.outcome,
      accuracyScore: evaluated.accuracyScore,
      timestamp: new Date().toISOString(),
    };

    participant.attempts.push(attempt);
    participant.score = participant.attempts.filter((a) => a.outcome === 'GOAL').length;
    participant.totalAccuracy = participant.attempts.reduce((sum, a) => sum + a.accuracyScore, 0);

    if (participant.attempts.length >= db.settings.totalAttempts) {
      participant.status = 'completed';
      participant.completedAt = new Date().toISOString();
      participant.qualified = participant.score >= db.settings.qualificationThreshold;
    } else {
      participant.status = 'in_progress';
    }

    saveDatabase(db);

    res.json({
      attempt,
      rawAimX: evaluated.rawAimX,
      session: buildSessionState(participant, sessionToken),
      duplicate: false,
    });
  });

  // Retrieve own session summary
  app.get('/api/sessions/:id', (req, res) => {
    const { id } = req.params;
    const token = String(req.headers['x-session-token'] || '');
    const participant = db.participants.find((p) => p.id === id);
    if (!participant || db.sessionTokens[id] !== token) {
      res.status(403).json({ error: 'Session not found.' });
      return;
    }
    res.json({ session: buildSessionState(participant, token) });
  });

  // ─── ADMIN AUTH & DASHBOARD API ────────────────────────────
  app.post('/api/admin/login', (req, res) => {
    const { passcode } = req.body ?? {};
    if (String(passcode || '') !== ADMIN_PASSCODE) {
      res.status(401).json({ error: 'Incorrect admin passcode.' });
      return;
    }
    const token = crypto.randomBytes(28).toString('hex');
    adminTokens.add(token);
    res.json({ token });
  });

  app.post('/api/admin/logout', requireAdmin, (req, res) => {
    const token = (req.headers.authorization || '').slice(7).trim();
    adminTokens.delete(token);
    res.json({ ok: true });
  });

  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    res.json(buildAdminOverview());
  });

  // Propose winners according to published ranking & tie-breaking rules
  app.post('/api/admin/winners/propose', requireAdmin, (_req, res) => {
    const ranked = rankParticipants(db.participants, db.settings);
    const eligible = ranked
      .filter((p) => p.qualified && p.winnerStatus !== 'removed')
      .sort((a, b) => (a.provisionalRank ?? 9999) - (b.provisionalRank ?? 9999));

    const selectedIds = new Set(eligible.slice(0, db.settings.winnerCount).map((p) => p.id));

    for (const p of db.participants) {
      if (p.winnerStatus === 'confirmed') continue;
      if (selectedIds.has(p.id)) {
        p.winnerStatus = 'proposed';
      } else if (p.winnerStatus === 'proposed') {
        p.winnerStatus = 'none';
      }
    }

    db.auditLog.push({
      id: `audit-${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      actor: 'Campaign Admin',
      action: 'PROPOSED_WINNERS_GENERATED',
      reason: `Generated provisional list of ${selectedIds.size} eligible winners using ${db.settings.tieBreakerRule.replace(/_/g, ' ')} tie-breaker.`,
    });

    saveDatabase(db);
    res.json(buildAdminOverview());
  });

  // Confirm provisional winners
  app.post('/api/admin/winners/confirm', requireAdmin, (_req, res) => {
    const nowIso = new Date().toISOString();
    let confirmedCount = 0;

    for (const p of db.participants) {
      if (p.winnerStatus === 'proposed') {
        p.winnerStatus = 'confirmed';
        p.winnerConfirmedAt = nowIso;
        confirmedCount++;
      }
    }

    if (confirmedCount === 0) {
      res.status(400).json({
        error: 'No provisional winners to confirm. Generate the proposed winner list first.',
      });
      return;
    }

    db.auditLog.push({
      id: `audit-${crypto.randomUUID()}`,
      timestamp: nowIso,
      actor: 'Campaign Admin',
      action: 'WINNERS_CONFIRMED',
      reason: `Explicitly confirmed ${confirmedCount} provisional winners as official campaign winners.`,
    });

    saveDatabase(db);
    res.json(buildAdminOverview());
  });

  // Manual override with mandatory reason & audit trail
  app.post('/api/admin/winners/override', requireAdmin, (req, res) => {
    const { participantId, action, reason } = req.body ?? {};
    const cleanReason = String(reason ?? '').trim();

    if (cleanReason.length < 5) {
      res.status(400).json({ error: 'A clear audit reason (minimum 5 characters) is required for manual overrides.' });
      return;
    }

    const participant = db.participants.find((p) => p.id === participantId);
    if (!participant) {
      res.status(404).json({ error: 'Participant not found.' });
      return;
    }

    if (action === 'add') {
      if (!participant.qualified) {
        res.status(400).json({ error: 'Only qualified participants can be added to the winner list.' });
        return;
      }
      participant.winnerStatus = 'proposed';
      participant.overrideNote = `Manually proposed: ${cleanReason}`;
    } else if (action === 'confirm') {
      if (!participant.qualified) {
        res.status(400).json({ error: 'Only qualified participants can be confirmed as winners.' });
        return;
      }
      participant.winnerStatus = 'confirmed';
      participant.winnerConfirmedAt = new Date().toISOString();
      participant.overrideNote = `Manually confirmed: ${cleanReason}`;
    } else if (action === 'remove') {
      participant.winnerStatus = 'removed';
      participant.winnerConfirmedAt = null;
      participant.overrideNote = `Manually removed: ${cleanReason}`;
    } else {
      res.status(400).json({ error: 'Invalid override action.' });
      return;
    }

    db.auditLog.push({
      id: `audit-${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      actor: 'Campaign Admin',
      action: `MANUAL_OVERRIDE_${String(action).toUpperCase()}`,
      targetEntryNumber: participant.entryNumber,
      reason: cleanReason,
    });

    saveDatabase(db);
    res.json(buildAdminOverview());
  });

  // Edit campaign settings (respects competition rule lock once entries open)
  app.patch('/api/admin/settings', requireAdmin, (req, res) => {
    const patch = req.body ?? {};
    const locked = db.settings.rulesLocked;

    // Always editable editorial / merchandising fields
    if (typeof patch.title === 'string' && patch.title.trim()) {
      db.settings.title = patch.title.trim();
    }
    if (typeof patch.headline === 'string' && patch.headline.trim()) {
      db.settings.headline = patch.headline.trim();
    }
    if (typeof patch.subheadline === 'string' && patch.subheadline.trim()) {
      db.settings.subheadline = patch.subheadline.trim();
    }
    if (typeof patch.bannerUrl === 'string' && patch.bannerUrl.trim()) {
      db.settings.bannerUrl = patch.bannerUrl.trim();
    }
    if (typeof patch.prizeNote === 'string') {
      db.settings.prizeNote = patch.prizeNote.trim();
    }
    if (typeof patch.startDate === 'string' && patch.startDate.trim()) {
      db.settings.startDate = patch.startDate.trim();
    }
    if (typeof patch.endDate === 'string' && patch.endDate.trim()) {
      db.settings.endDate = patch.endDate.trim();
    }
    if (patch.campaignStatus === 'draft' || patch.campaignStatus === 'open' || patch.campaignStatus === 'closed') {
      db.settings.campaignStatus = patch.campaignStatus;
    }
    if (Array.isArray(patch.prizes) && patch.prizes.length > 0) {
      db.settings.prizes = patch.prizes;
    }

    // Competition-critical rules are locked once entries open
    if (!locked) {
      if (typeof patch.qualificationThreshold === 'number') {
        db.settings.qualificationThreshold = Math.max(1, Math.min(5, Math.round(patch.qualificationThreshold)));
      }
      if (typeof patch.winnerCount === 'number') {
        db.settings.winnerCount = Math.max(1, Math.min(100, Math.round(patch.winnerCount)));
      }
      if (
        patch.tieBreakerRule === 'earliest_completion' ||
        patch.tieBreakerRule === 'highest_accuracy_score' ||
        patch.tieBreakerRule === 'verified_random_draw'
      ) {
        db.settings.tieBreakerRule = patch.tieBreakerRule;
      }
      if (
        patch.participationPolicy === 'one_per_phone' ||
        patch.participationPolicy === 'one_per_email' ||
        patch.participationPolicy === 'unlimited'
      ) {
        db.settings.participationPolicy = patch.participationPolicy;
      }
    }

    db.auditLog.push({
      id: `audit-${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      actor: 'Campaign Admin',
      action: 'SETTINGS_UPDATED',
      reason: locked
        ? 'Updated campaign copy, schedule, or prize display settings (competition rules locked).'
        : 'Updated pre-launch campaign configuration and rules.',
    });

    saveDatabase(db);
    res.json(buildAdminOverview());
  });

  // Export Participants or Winners CSV
  app.get('/api/admin/export', requireAdmin, (req, res) => {
    const exportType = req.query.type === 'winners' ? 'winners' : 'participants';
    const ranked = rankParticipants(db.participants, db.settings).sort((a, b) => {
      if (a.provisionalRank !== null && b.provisionalRank !== null) {
        return a.provisionalRank - b.provisionalRank;
      }
      if (a.provisionalRank !== null) return -1;
      if (b.provisionalRank !== null) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const rows =
      exportType === 'winners'
        ? ranked.filter((p) => p.winnerStatus === 'proposed' || p.winnerStatus === 'confirmed')
        : ranked;

    const headers = [
      'Entry Number',
      'Name',
      'Email',
      'Phone',
      'Team',
      'Score',
      'Attempts',
      'Qualified',
      'Provisional Rank',
      'Winner Status',
      'Marketing Opt-In',
      'Participation Time',
      'Override Note',
    ];

    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((p) =>
        [
          p.entryNumber,
          p.name,
          p.email,
          p.phone,
          p.team ? (p.team === 'iphone' ? 'Team iPhone' : 'Team Android') : 'Unselected',
          `${p.score}/${db.settings.totalAttempts}`,
          p.attempts.length,
          p.qualified ? 'Qualified' : 'Not Qualified',
          p.provisionalRank ?? '-',
          p.winnerStatus,
          p.marketingOptIn ? 'Yes' : 'No',
          p.completedAt || p.createdAt,
          p.overrideNote || '',
        ]
          .map(escapeCsvCell)
          .join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="iphone-vs-android-${exportType}-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(lines.join('\n'));
  });

  // ─── DIRECT SHAREABLE QR CODE PNG ENDPOINT ─────────────────
  app.get('/api/qr.png', async (req, res) => {
    try {
      const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
      const proto = forwardedProto || req.protocol || 'https';
      const host = req.get('host') || `localhost:${PORT}`;
      const targetUrl = `${proto}://${host}/`;

      const pngBuffer = await QRCode.toBuffer(targetUrl, {
        type: 'png',
        width: 800,
        margin: 3,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#081722',
          light: '#ffffff',
        },
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Content-Disposition', 'inline; filename="iphone-vs-android-giveaway-qr.png"');
      res.send(pngBuffer);
    } catch (err) {
      console.error('QR generation error:', err);
      res.status(500).json({ error: 'Unable to generate QR code image.' });
    }
  });

  // ─── VITE DEV MIDDLEWARE / STATIC PROD SERVING ─────────────
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
