import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  LayoutDashboard,
  Users,
  Trophy,
  Settings,
  LogOut,
  Search,
  Download,
  CheckCircle2,
  X,
  ShieldAlert,
  QrCode,
  Copy,
  Check,
  Shuffle,
  Trash2,
  Lock,
  Phone,
  Share2,
} from 'lucide-react';
import type {
  AuditLogEntry,
  CampaignSettings,
  ParticipantRecord,
  RankedParticipant,
} from '../types.ts';
import {
  ADMIN_EMAIL,
  auth,
  isAuthorizedAdminUser,
  signInWithGooglePopup,
  signOutFirebase,
} from '../lib/firebase.ts';
import {
  adminConfirmProvisionalWinners,
  adminDeleteParticipant,
  adminOverrideParticipantWinner,
  adminPickRandomGiveawayWinners,
  adminProposeTopScoreWinners,
  adminSaveCampaignSettings,
  buildGiveawayExportText,
  DEFAULT_CAMPAIGN_SETTINGS,
  downloadGiveawayCsvFile,
  fetchCampaignSettingsFirestore,
  rankParticipantsList,
  shareGiveawayCsvFile,
  subscribeAdminAuditLogs,
  subscribeAdminParticipants,
  type GiveawayExportFormat,
} from '../lib/firestoreCampaign.ts';
import { QrCodeStudio } from './QrSharePage.tsx';
import { LiveGiveawayPicker } from './LiveGiveawayPicker.tsx';

interface AdminDashboardProps {
  onCampaignMutated: () => void;
}

type AdminTab = 'overview' | 'participants' | 'giveaway' | 'qr' | 'settings';

export function AdminDashboard({ onCampaignMutated }: AdminDashboardProps) {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<AdminTab>('overview');
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_CAMPAIGN_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<CampaignSettings>(DEFAULT_CAMPAIGN_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<'all' | 'iphone' | 'android'>('all');
  const [qualFilter, setQualFilter] = useState<'all' | 'qualified' | 'not_qualified'>('qualified');
  const [winnerFilter, setWinnerFilter] = useState<'all' | 'proposed' | 'confirmed' | 'none'>('all');
  const [visibleLimit, setVisibleLimit] = useState(100);

  // Giveaway export & draw state
  const [exportScope, setExportScope] = useState<'qualified' | 'all' | 'winners'>('qualified');
  const [exportFormat, setExportFormat] = useState<GiveawayExportFormat>('lines');
  const [copiedExport, setCopiedExport] = useState(false);
  const [drawCount, setDrawCount] = useState(1);
  const [drawQualifiedOnly, setDrawQualifiedOnly] = useState(true);
  const [drawing, setDrawing] = useState(false);

  // Inspect & override modals
  const [selectedParticipant, setSelectedParticipant] = useState<RankedParticipant | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<RankedParticipant | null>(null);
  const [overrideAction, setOverrideAction] = useState<'add' | 'confirm' | 'remove'>('add');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  const isAdmin = isAuthorizedAdminUser(user);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!authReady || !isAdmin) return;

    fetchCampaignSettingsFirestore().then((cfg) => {
      setSettings(cfg);
      setSettingsDraft(cfg);
    });

    const unsubParticipants = subscribeAdminParticipants(
      (list) => setParticipants(list),
      (err) => setBannerMsg({ type: 'err', text: err.message })
    );

    const unsubAudit = subscribeAdminAuditLogs(
      (logs) => setAuditLog(logs),
      (err) => setBannerMsg({ type: 'err', text: err.message })
    );

    return () => {
      unsubParticipants();
      unsubAudit();
    };
  }, [authReady, isAdmin]);

  const rankedParticipants = useMemo(
    () => rankParticipantsList(participants, settings),
    [participants, settings]
  );

  const stats = useMemo(() => {
    const totalParticipants = participants.length;
    const completedGames = participants.filter((p) => p.status === 'completed').length;
    const qualifiedParticipants = participants.filter((p) => p.qualified).length;
    const iphoneCount = participants.filter((p) => p.team === 'iphone').length;
    const androidCount = participants.filter((p) => p.team === 'android').length;
    const proposedWinners = participants.filter((p) => p.winnerStatus === 'proposed').length;
    const confirmedWinners = participants.filter((p) => p.winnerStatus === 'confirmed').length;
    return {
      totalParticipants,
      completedGames,
      qualifiedParticipants,
      iphoneCount,
      androidCount,
      proposedWinners,
      confirmedWinners,
    };
  }, [participants]);

  const filteredParticipants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rankedParticipants.filter((p) => {
      if (teamFilter !== 'all' && p.team !== teamFilter) return false;
      if (qualFilter === 'qualified' && !p.qualified) return false;
      if (qualFilter === 'not_qualified' && p.qualified) return false;
      if (winnerFilter !== 'all' && p.winnerStatus !== winnerFilter) return false;
      if (q) {
        const hay = `${p.entryNumber} ${p.name} ${p.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rankedParticipants, search, teamFilter, qualFilter, winnerFilter]);

  const exportRows = useMemo(() => {
    if (exportScope === 'qualified') {
      return rankedParticipants.filter((p) => p.qualified && p.winnerStatus !== 'removed');
    }
    if (exportScope === 'winners') {
      return rankedParticipants.filter(
        (p) => p.winnerStatus === 'confirmed' || p.winnerStatus === 'proposed'
      );
    }
    return rankedParticipants;
  }, [rankedParticipants, exportScope]);

  const giveawayPreviewText = useMemo(
    () => buildGiveawayExportText(exportRows, exportFormat),
    [exportRows, exportFormat]
  );

  const copyGiveawayList = useCallback(async () => {
    if (!giveawayPreviewText) return;
    try {
      await navigator.clipboard.writeText(giveawayPreviewText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = giveawayPreviewText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedExport(true);
    window.setTimeout(() => setCopiedExport(false), 2200);
  }, [giveawayPreviewText]);

  const handleAdminSignIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      const signedUser = await signInWithGooglePopup();
      if (!isAuthorizedAdminUser(signedUser)) {
        setAuthError(
          `Access Denied: ${signedUser.email || 'This account'} is not authorized for the Admin Console.`
        );
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Admin sign-in cancelled.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleRandomDraw = async () => {
    if (!user) return;
    setBannerMsg(null);
    setDrawing(true);
    try {
      const winners = await adminPickRandomGiveawayWinners(
        user,
        participants,
        drawCount,
        drawQualifiedOnly
      );
      const summary = winners.map((w) => `${w.name} (${w.phone})`).join(', ');
      setBannerMsg({
        type: 'ok',
        text: `Giveaway Draw Selected ${winners.length} Provisional Winner(s): ${summary}`,
      });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Draw failed.' });
    } finally {
      setDrawing(false);
    }
  };

  const handleProposeTopWinners = async () => {
    if (!user) return;
    setBannerMsg(null);
    try {
      const count = await adminProposeTopScoreWinners(user, participants, settings);
      setBannerMsg({
        type: 'ok',
        text: `Selected top ${count} qualified participants as provisional winners.`,
      });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Selection failed.' });
    }
  };

  const handleConfirmWinners = async () => {
    if (!user) return;
    setBannerMsg(null);
    try {
      const count = await adminConfirmProvisionalWinners(user, participants);
      setBannerMsg({
        type: 'ok',
        text: `Confirmed ${count} official giveaway winner(s).`,
      });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Confirmation failed.' });
    }
  };

  const handleOverrideSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !overrideTarget) return;
    setOverrideSubmitting(true);
    setBannerMsg(null);
    try {
      await adminOverrideParticipantWinner(user, overrideTarget, overrideAction, overrideReason);
      setOverrideTarget(null);
      setOverrideReason('');
      setBannerMsg({
        type: 'ok',
        text: `Updated winner status for ${overrideTarget.name} (${overrideTarget.entryNumber}).`,
      });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Override failed.' });
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleDeleteEntry = async (p: ParticipantRecord) => {
    if (!user) return;
    setBannerMsg(null);
    try {
      await adminDeleteParticipant(user, p);
      if (selectedParticipant?.id === p.id) setSelectedParticipant(null);
      setBannerMsg({ type: 'ok', text: `Deleted entry for ${p.name} (${p.phone}).` });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Delete failed.' });
    }
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingSettings(true);
    setBannerMsg(null);
    try {
      await adminSaveCampaignSettings(user, settingsDraft);
      setSettings(settingsDraft);
      onCampaignMutated();
      setBannerMsg({ type: 'ok', text: 'Campaign settings saved to database.' });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSavingSettings(false);
    }
  };

  // ─── STRICT ADMIN-ONLY GATE ────────────────────────────────
  if (!authReady) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f6f5] text-sm text-slate-500">
        Verifying admin session...
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f6f5] px-4 py-12">
        <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[#081722] px-7 py-7 text-white">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#d9ff70]">
              <Lock className="h-3.5 w-3.5" />
              <span>Restricted Admin Portal</span>
            </div>
            <h1 className="mt-1.5 font-[var(--font-display)] text-3xl font-extrabold uppercase tracking-tight">
              Admin Sign In Only
            </h1>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
              This private page is restricted to the authorized campaign administrator. Sign in with the admin Google account to access participant entries, giveaway exports, and QR tools.
            </p>
          </div>

          <div className="space-y-4 p-7">
            {(authError || (user && !isAdmin)) && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <div>
                    <p>
                      {authError ||
                        `Signed in as ${user?.email}, which does not have Admin access.`}
                    </p>
                    <p className="mt-1 text-[11px] text-rose-700">
                      Authorized admin: <span className="font-mono font-semibold">{ADMIN_EMAIL}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={signingIn}
              onClick={handleAdminSignIn}
              className="flex min-h-[50px] w-full items-center justify-center rounded-xl bg-[#090d11] px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              {signingIn ? 'Verifying Google Account...' : 'Sign In with Admin Google Account'}
            </button>

            {user && !isAdmin && (
              <button
                type="button"
                onClick={() => signOutFirebase()}
                className="flex min-h-[42px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Sign Out ({user.email})
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const totalTeam = Math.max(1, stats.iphoneCount + stats.androidCount);
  const iphonePct = Math.round((stats.iphoneCount / totalTeam) * 100);

  return (
    <div className="min-h-[100dvh] bg-[#f4f6f5] text-[#0b141a]">
      <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
        {/* Admin Sidebar */}
        <aside className="w-full shrink-0 border-b border-slate-200 bg-white lg:min-h-[100dvh] lg:w-64 lg:border-b-0 lg:border-r">
          <div className="p-5">
            <div className="text-xs font-semibold text-emerald-700">Private Admin Portal</div>
            <div className="mt-0.5 font-[var(--font-display)] text-2xl font-extrabold uppercase tracking-tight text-[#0b141a]">
              Admin Console
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{user.email}</div>

            <nav className="mt-5 grid grid-cols-2 gap-1.5 sm:grid-cols-5 lg:grid-cols-1">
              {(
                [
                  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                  { id: 'participants', label: 'Participants', icon: Users },
                  { id: 'giveaway', label: 'Giveaway Picker & CSV', icon: Trophy },
                  { id: 'qr', label: 'QR Code & Links', icon: QrCode },
                  { id: 'settings', label: 'Settings', icon: Settings },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`flex min-h-[44px] items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap sm:text-sm ${
                      active
                        ? 'bg-[#090d11] text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-[#0b141a]'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#d9ff70]' : 'text-slate-500'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <button
                type="button"
                onClick={() => signOutFirebase()}
                className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Admin Workspace */}
        <main className="flex-1 p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="text-xs font-medium text-slate-500">
                iPhone vs Android Admin / <span className="capitalize text-[#0b141a]">{tab}</span>
              </div>
              <h1 className="mt-0.5 font-[var(--font-display)] text-3xl font-extrabold uppercase tracking-tight">
                {tab === 'overview'
                  ? 'Live Campaign Overview'
                  : tab === 'participants'
                    ? 'Real Participant Entries'
                    : tab === 'giveaway'
                      ? 'Giveaway Picker & Name / Phone Export'
                      : tab === 'qr'
                        ? 'QR Scanner Poster & Shareable Links'
                        : 'Campaign Settings'}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  const qualifiedRows = rankedParticipants.filter((p) => p.qualified);
                  const mode = await shareGiveawayCsvFile(
                    qualifiedRows,
                    'giveaway-qualified-name-phone'
                  );
                  if (mode === 'downloaded') {
                    setBannerMsg({
                      type: 'ok',
                      text: `Downloaded ${qualifiedRows.length} qualified entries (Name, Phone) as CSV ready to share.`,
                    });
                  }
                }}
                disabled={stats.qualifiedParticipants === 0}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#d9ff70] px-3.5 py-2 text-xs font-extrabold text-[#081722] hover:bg-[#e5ff99] disabled:opacity-50 whitespace-nowrap"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Qualified CSV ({stats.qualifiedParticipants})</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadGiveawayCsvFile(
                    rankedParticipants.filter((p) => p.qualified),
                    'giveaway-qualified-name-phone'
                  )
                }
                disabled={stats.qualifiedParticipants === 0}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#090d11] px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 text-[#d9ff70]" />
                <span>Download Qualified CSV</span>
              </button>
            </div>
          </div>

          {bannerMsg && (
            <div
              className={`mt-5 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-medium ${
                bannerMsg.type === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              <span>{bannerMsg.text}</span>
              <button type="button" onClick={() => setBannerMsg(null)} aria-label="Dismiss notice">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ─── TAB 1: OVERVIEW ─── */}
          {tab === 'overview' && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-xs font-medium text-slate-500">Real Participants</div>
                  <div className="mt-2 font-mono text-3xl font-bold tabular-nums">
                    {stats.totalParticipants}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-xs font-medium text-slate-500">Completed 5 Kicks</div>
                  <div className="mt-2 font-mono text-3xl font-bold tabular-nums">
                    {stats.completedGames}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-xs font-medium text-slate-500">
                    Qualified ({settings.qualificationThreshold}/{settings.totalAttempts}+)
                  </div>
                  <div className="mt-2 font-mono text-3xl font-bold text-emerald-700 tabular-nums">
                    {stats.qualifiedParticipants}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-xs font-medium text-slate-500">Selected (Provisional)</div>
                  <div className="mt-2 font-mono text-3xl font-bold text-amber-600 tabular-nums">
                    {stats.proposedWinners}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-xs font-medium text-slate-500">Confirmed Winners</div>
                  <div className="mt-2 font-mono text-3xl font-bold text-[#0b141a] tabular-nums">
                    {stats.confirmedWinners} / {settings.winnerCount}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-[#0b141a]">
                      iPhone vs Android Team Split
                    </h2>
                    <p className="text-xs text-slate-500">
                      Live count of real players who scanned and registered (zero dummy data).
                    </p>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs font-semibold tabular-nums">
                    <span>Team iPhone: {stats.iphoneCount}</span>
                    <span>Team Android: {stats.androidCount}</span>
                  </div>
                </div>
                <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
                  {stats.iphoneCount + stats.androidCount > 0 && (
                    <>
                      <div className="h-full bg-[#090d11]" style={{ width: `${iphonePct}%` }} />
                      <div
                        className="h-full bg-[#16a34a]"
                        style={{ width: `${100 - iphonePct}%` }}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-base font-bold text-[#0b141a]">Recent Admin Activity</h2>
                <div className="mt-4 divide-y divide-slate-100">
                  {auditLog.slice(0, 6).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-start justify-between gap-2 py-3 text-xs"
                    >
                      <div>
                        <span className="font-mono font-semibold text-[#0b141a]">{entry.action}</span>
                        {entry.targetEntryNumber && (
                          <span className="ml-2 font-mono text-slate-500">
                            ({entry.targetEntryNumber})
                          </span>
                        )}
                        <p className="mt-0.5 text-slate-600">{entry.reason}</p>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {auditLog.length === 0 && (
                    <p className="py-6 text-center text-xs text-slate-500">
                      No admin actions recorded yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 2: PARTICIPANTS (Name & Phone Only) ─── */}
          {tab === 'participants' && (
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search Name, Phone Number, or Entry #"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-[#f8faf9] pl-10 pr-4 text-xs text-[#0b141a] focus:border-[#0b141a] focus:bg-white focus:outline-none"
                  />
                </div>
                <select
                  aria-label="Filter by team"
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value as typeof teamFilter)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
                >
                  <option value="all">All Teams</option>
                  <option value="iphone">Team iPhone</option>
                  <option value="android">Team Android</option>
                </select>
                <select
                  aria-label="Filter by qualification"
                  value={qualFilter}
                  onChange={(e) => setQualFilter(e.target.value as typeof qualFilter)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
                >
                  <option value="all">All Entries</option>
                  <option value="qualified">Qualified Only</option>
                  <option value="not_qualified">Not Qualified</option>
                </select>
                <select
                  aria-label="Filter by winner status"
                  value={winnerFilter}
                  onChange={(e) => setWinnerFilter(e.target.value as typeof winnerFilter)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="confirmed">Confirmed Winners</option>
                  <option value="proposed">Provisional</option>
                  <option value="none">Unselected</option>
                </select>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 font-semibold text-slate-500">
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3">Team</th>
                        <th className="px-4 py-3 text-right">Score</th>
                        <th className="px-4 py-3">Giveaway</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredParticipants.slice(0, visibleLimit).map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedParticipant(p)}
                              className="font-semibold text-[#0b141a] underline decoration-slate-300 underline-offset-2 hover:decoration-[#0b141a]"
                            >
                              {p.name}
                            </button>
                            <div className="font-mono text-[10px] text-slate-400">
                              {p.entryNumber}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <a
                              href={`tel:${p.phone.replace(/[^+\d]/g, '')}`}
                              className="inline-flex items-center gap-1.5 font-mono font-semibold text-emerald-800 hover:text-emerald-950 hover:underline tabular-nums"
                            >
                              <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span>{p.phone}</span>
                            </a>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {p.team === 'iphone'
                              ? 'Team iPhone'
                              : p.team === 'android'
                                ? 'Team Android'
                                : 'Pending'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                            {p.score}/{settings.totalAttempts}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={
                                p.qualified ? 'font-semibold text-emerald-700' : 'text-slate-500'
                              }
                            >
                              {p.qualified ? 'Qualified' : 'Not Qualified'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap capitalize">
                            <span
                              className={`font-semibold ${
                                p.winnerStatus === 'confirmed'
                                  ? 'text-emerald-700'
                                  : p.winnerStatus === 'proposed'
                                    ? 'text-amber-700'
                                    : p.winnerStatus === 'removed'
                                      ? 'text-rose-700'
                                      : 'text-slate-500'
                              }`}
                            >
                              {p.winnerStatus === 'none' ? '—' : p.winnerStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(p)}
                              title="Delete entry"
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredParticipants.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                            No real entries yet. Share your QR code — every player who enters their Name & Phone Number will appear here live!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredParticipants.length > visibleLimit && (
                  <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
                    <span>
                      Showing {Math.min(visibleLimit, filteredParticipants.length)} of{' '}
                      {filteredParticipants.length} entries (CSV export always includes all rows)
                    </span>
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((v) => v + 100)}
                      className="rounded-lg bg-[#090d11] px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Load 100 More
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── TAB 3: LIVE GIVEAWAY WHEEL PICKER & CSV EXPORT ─── */}
          {tab === 'giveaway' && (
            <div className="mt-6 space-y-6">
              {/* Interactive Live Giveaway Wheel Picker */}
              <LiveGiveawayPicker
                participants={rankedParticipants}
                settings={settings}
                onConfirmWinner={async (winner, note) => {
                  if (!user) return;
                  setBannerMsg(null);
                  try {
                    await adminOverrideParticipantWinner(user, winner, 'confirm', note);
                    setBannerMsg({
                      type: 'ok',
                      text: `Confirmed official giveaway winner: ${winner.name} (${winner.phone}).`,
                    });
                  } catch (err) {
                    setBannerMsg({
                      type: 'err',
                      text: err instanceof Error ? err.message : 'Unable to save winner.',
                    });
                  }
                }}
              />

              {/* Ready-to-Paste Giveaway App Export Box */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700">
                      Giveaway App Ready Format · Name & Phone
                    </p>
                    <h2 className="mt-0.5 text-lg font-bold text-[#0b141a]">
                      Export / Copy Entries for External Giveaway App
                    </h2>
                    <p className="mt-1 text-xs text-slate-600">
                      Copy this exact list and paste directly into Wheel of Names, Random Name Picker, Instagram/Giveaway Picker apps, or download as a clean 2-column CSV (Name,Phone).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Export participant scope"
                      value={exportScope}
                      onChange={(e) => setExportScope(e.target.value as typeof exportScope)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
                    >
                      <option value="qualified">
                        Qualified Only ({rankedParticipants.filter((p) => p.qualified).length})
                      </option>
                      <option value="all">All Entries ({rankedParticipants.length})</option>
                      <option value="winners">
                        Selected / Confirmed Winners (
                        {
                          rankedParticipants.filter(
                            (p) => p.winnerStatus === 'proposed' || p.winnerStatus === 'confirmed'
                          ).length
                        }
                        )
                      </option>
                    </select>

                    <select
                      aria-label="Export format"
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value as GiveawayExportFormat)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
                    >
                      <option value="lines">Giveaway App Lines (Name - Phone)</option>
                      <option value="csv">CSV Format (Name,Phone)</option>
                      <option value="tsv">Excel / Sheets Paste (Name / Phone)</option>
                    </select>
                  </div>
                </div>

                <textarea
                  readOnly
                  rows={8}
                  value={
                    exportRows.length > 0
                      ? giveawayPreviewText
                      : 'No entries in this filter yet. Once players register with Name & Phone Number, their giveaway-ready list appears here.'
                  }
                  className="mt-4 w-full rounded-xl border border-slate-200 bg-[#f8faf9] p-4 font-mono text-xs text-[#0b141a] focus:outline-none"
                />

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={exportRows.length === 0}
                    onClick={copyGiveawayList}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#090d11] px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {copiedExport ? (
                      <>
                        <Check className="h-4 w-4 text-[#d9ff70]" />
                        <span>Copied {exportRows.length} Entries!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 text-[#d9ff70]" />
                        <span>Copy for Giveaway App ({exportRows.length})</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={exportRows.length === 0}
                    onClick={async () => {
                      const mode = await shareGiveawayCsvFile(
                        exportRows,
                        `giveaway-${exportScope}-name-phone`
                      );
                      if (mode === 'downloaded') {
                        setBannerMsg({
                          type: 'ok',
                          text: `Downloaded ${exportRows.length} entries as CSV ready to share.`,
                        });
                      }
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#d9ff70] px-4 py-2.5 text-xs font-extrabold text-[#081722] hover:bg-[#e5ff99] disabled:opacity-50"
                  >
                    <Share2 className="h-4 w-4" />
                    <span>Share CSV File ({exportRows.length})</span>
                  </button>

                  <button
                    type="button"
                    disabled={exportRows.length === 0}
                    onClick={() =>
                      downloadGiveawayCsvFile(exportRows, `giveaway-${exportScope}-name-phone`)
                    }
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-[#0b141a] hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download CSV (Name, Phone)</span>
                  </button>
                </div>
              </div>

              {/* Built-in Live Giveaway Winner Picker */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-[#0b141a]">
                      Built-In Giveaway Winner Selection
                    </h2>
                    <p className="mt-1 text-xs text-slate-600">
                      Pick winners randomly directly here, or select by top score, then confirm official winners.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                      <span>Winners:</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={drawCount}
                        onChange={(e) => setDrawCount(Math.max(1, Number(e.target.value) || 1))}
                        className="h-10 w-16 rounded-xl border border-slate-200 px-2.5 font-mono text-xs font-bold"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={drawQualifiedOnly}
                        onChange={(e) => setDrawQualifiedOnly(e.target.checked)}
                        className="h-4 w-4 accent-[#0b141a]"
                      />
                      <span>Qualified only</span>
                    </label>
                    <button
                      type="button"
                      disabled={drawing}
                      onClick={handleRandomDraw}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#d9ff70] px-4 py-2 text-xs font-extrabold text-[#081722] hover:bg-[#e5ff99]"
                    >
                      <Shuffle className="h-3.5 w-3.5" />
                      <span>{drawing ? 'Picking...' : 'Random Giveaway Draw'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleProposeTopWinners}
                      className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-[#0b141a] hover:bg-slate-50"
                    >
                      Pick Top Scores
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmWinners}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#090d11] px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                    >
                      <CheckCircle2 className="h-4 w-4 text-[#d9ff70]" />
                      <span>Confirm Selected</span>
                    </button>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 font-semibold text-slate-500">
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3 text-right">Score</th>
                        <th className="px-4 py-3">Winner Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rankedParticipants
                        .filter((p) => p.qualified || p.winnerStatus !== 'none')
                        .map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3 font-semibold text-[#0b141a]">{p.name}</td>
                            <td className="px-4 py-3">
                              <a
                                href={`tel:${p.phone.replace(/[^+\d]/g, '')}`}
                                className="inline-flex items-center gap-1.5 font-mono font-semibold text-emerald-800 hover:text-emerald-950 hover:underline"
                              >
                                <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                <span>{p.phone}</span>
                              </a>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                              {p.score}/{settings.totalAttempts}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`font-semibold ${
                                  p.winnerStatus === 'confirmed'
                                    ? 'text-emerald-700'
                                    : p.winnerStatus === 'proposed'
                                      ? 'text-amber-700'
                                      : p.winnerStatus === 'removed'
                                        ? 'text-rose-700'
                                        : 'text-slate-500'
                                }`}
                              >
                                {p.winnerStatus === 'proposed'
                                  ? 'Provisional Winner'
                                  : p.winnerStatus === 'confirmed'
                                    ? 'Confirmed Winner'
                                    : p.winnerStatus === 'removed'
                                      ? 'Removed'
                                      : 'Eligible'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setOverrideTarget(p);
                                  setOverrideAction(
                                    p.winnerStatus === 'confirmed' || p.winnerStatus === 'proposed'
                                      ? 'remove'
                                      : 'confirm'
                                  );
                                  setOverrideReason('');
                                }}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#0b141a] hover:bg-slate-100"
                              >
                                Update Status
                              </button>
                            </td>
                          </tr>
                        ))}
                      {rankedParticipants.filter((p) => p.qualified || p.winnerStatus !== 'none')
                        .length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                            No qualified giveaway entries yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 4: QR CODE POSTER & SHAREABLE LINKS ─── */}
          {tab === 'qr' && (
            <div className="mt-6">
              <QrCodeStudio compact />
            </div>
          )}

          {/* ─── TAB 5: CAMPAIGN SETTINGS ─── */}
          {tab === 'settings' && (
            <form onSubmit={handleSaveSettings} className="mt-6 space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-base font-bold text-[#0b141a]">Campaign Details & Dates</h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Headline</label>
                    <input
                      type="text"
                      value={settingsDraft.headline}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, headline: e.target.value })
                      }
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Status</label>
                    <select
                      value={settingsDraft.campaignStatus}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          campaignStatus: e.target.value as CampaignSettings['campaignStatus'],
                        })
                      }
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm"
                    >
                      <option value="open">Open for Entries</option>
                      <option value="closed">Closed</option>
                      <option value="draft">Draft</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Subheadline</label>
                  <input
                    type="text"
                    value={settingsDraft.subheadline}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, subheadline: e.target.value })
                    }
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Start Date</label>
                    <input
                      type="date"
                      value={settingsDraft.startDate}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, startDate: e.target.value })
                      }
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">End Date</label>
                    <input
                      type="date"
                      value={settingsDraft.endDate}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, endDate: e.target.value })
                      }
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Goals to Qualify
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={settingsDraft.qualificationThreshold}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          qualificationThreshold: Number(e.target.value) || 3,
                        })
                      }
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Winner Slots
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={settingsDraft.winnerCount}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          winnerCount: Number(e.target.value) || 10,
                        })
                      }
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="inline-flex min-h-[46px] items-center justify-center rounded-xl bg-[#090d11] px-6 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          )}
        </main>
      </div>

      {/* Participant Detail Drawer */}
      {selectedParticipant && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          onClick={() => setSelectedParticipant(null)}
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-xs text-slate-500">
                  {selectedParticipant.entryNumber}
                </div>
                <h2 className="mt-0.5 text-xl font-bold text-[#0b141a]">
                  {selectedParticipant.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedParticipant(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-2.5 rounded-2xl bg-[#f4f6f5] p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Phone</span>
                <a
                  href={`tel:${selectedParticipant.phone.replace(/[^+\d]/g, '')}`}
                  className="inline-flex items-center gap-1.5 font-mono font-semibold text-emerald-800 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{selectedParticipant.phone}</span>
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Score</span>
                <span className="font-mono font-bold text-[#0b141a]">
                  {selectedParticipant.score}/{settings.totalAttempts}
                </span>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Kick History
              </h3>
              <div className="mt-2 space-y-2">
                {selectedParticipant.attempts.map((a) => (
                  <div
                    key={a.attemptNumber}
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs"
                  >
                    <span className="font-mono font-semibold">Kick #{a.attemptNumber}</span>
                    <span
                      className={`font-bold ${
                        a.outcome === 'GOAL'
                          ? 'text-emerald-700'
                          : a.outcome === 'SAVE'
                            ? 'text-amber-700'
                            : 'text-rose-700'
                      }`}
                    >
                      {a.outcome}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Status Override Modal */}
      {overrideTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOverrideTarget(null)}
        >
          <form
            onSubmit={handleOverrideSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0b141a]">
                Update Winner Status — {overrideTarget.name}
              </h3>
              <button type="button" onClick={() => setOverrideTarget(null)}>
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <select
              value={overrideAction}
              onChange={(e) => setOverrideAction(e.target.value as typeof overrideAction)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold"
            >
              <option value="confirm">Confirm Official Winner</option>
              <option value="add">Mark as Provisional Winner</option>
              <option value="remove">Remove from Winner List</option>
            </select>
            <textarea
              required
              minLength={5}
              rows={3}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Audit reason (e.g. Verified phone number for prize delivery)"
              className="w-full rounded-xl border border-slate-200 p-3 text-xs"
            />
            <button
              type="submit"
              disabled={overrideSubmitting}
              className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#090d11] px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {overrideSubmitting ? 'Saving...' : 'Save Status Update'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
