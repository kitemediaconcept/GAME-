export type TeamId = 'iphone' | 'android';

export type ShotOutcome = 'GOAL' | 'SAVE' | 'MISS';

export type TieBreakerRule =
  | 'earliest_completion'
  | 'highest_accuracy_score'
  | 'verified_random_draw';

export type ParticipationPolicy =
  | 'one_per_phone'
  | 'one_per_email'
  | 'unlimited';

export type WinnerStatus = 'none' | 'proposed' | 'confirmed' | 'removed';

export interface PrizeItem {
  id: string;
  tier: string;
  title: string;
  quantity: number;
  description: string;
}

export interface CampaignSettings {
  title: string;
  headline: string;
  subheadline: string;
  bannerUrl: string;
  prizeNote: string;
  startDate: string;
  endDate: string;
  totalAttempts: number;
  qualificationThreshold: number;
  winnerCount: number;
  tieBreakerRule: TieBreakerRule;
  participationPolicy: ParticipationPolicy;
  rulesLocked: boolean;
  campaignStatus: 'draft' | 'open' | 'closed';
  prizes: PrizeItem[];
  privacySummary: string;
  eligibilitySummary: string;
}

export interface AttemptRecord {
  attemptNumber: number; // 1..5
  idempotencyKey: string;
  aimValue: number; // -1..1
  power: number; // 0..100
  finalX: number;
  finalY: number;
  curveFactor: number;
  difficulty: number;
  goalieHalfWidth: number;
  outcome: ShotOutcome;
  accuracyScore: number; // 0..100 corner precision score for accuracy tie-breaker
  timestamp: string;
}

export interface ParticipantRecord {
  id: string;
  entryNumber: string; // e.g. IVA-0001
  name: string;
  email: string;
  phone: string;
  normalizedPhone: string;
  team: TeamId | null;
  acceptedRules: boolean;
  marketingOptIn: boolean;
  status: 'registered' | 'in_progress' | 'completed';
  attempts: AttemptRecord[];
  score: number;
  totalAccuracy: number;
  qualified: boolean;
  winnerStatus: WinnerStatus;
  winnerConfirmedAt: string | null;
  overrideNote: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface RankedParticipant extends ParticipantRecord {
  provisionalRank: number | null;
}

export interface PublicLeaderboardEntry {
  entryNumber: string;
  displayName: string; // First name + last initial only (no PII)
  team: TeamId;
  score: number;
  totalAttempts: number;
  qualified: boolean;
  provisionalRank: number | null;
  completedAt: string | null;
  winnerStatus: WinnerStatus;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  targetEntryNumber?: string;
  reason: string;
}

export interface PublicCampaignPayload {
  settings: CampaignSettings;
  stats: {
    totalParticipants: number;
    completedGames: number;
    qualifiedParticipants: number;
    iphoneCount: number;
    androidCount: number;
    confirmedWinners: number;
  };
  leaderboard: PublicLeaderboardEntry[];
}

export interface AdminOverviewPayload {
  settings: CampaignSettings;
  stats: {
    totalParticipants: number;
    completedGames: number;
    qualifiedParticipants: number;
    iphoneCount: number;
    androidCount: number;
    proposedWinners: number;
    confirmedWinners: number;
  };
  participants: RankedParticipant[];
  auditLog: AuditLogEntry[];
}

export interface ParticipantSessionState {
  id: string;
  entryNumber: string;
  name: string;
  team: TeamId | null;
  status: 'registered' | 'in_progress' | 'completed';
  attempts: AttemptRecord[];
  score: number;
  qualified: boolean;
  provisionalRank: number | null;
  qualifiedTotal: number;
  completedAt: string | null;
  sessionToken: string;
}
