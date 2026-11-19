import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  LayoutDashboard,
  Users,
  Trophy,
  Settings,
  LogOut,
  Search,
  Download,
  Lock,
  CheckCircle2,
  X,
  ShieldAlert,
  ArrowLeft,
  RefreshCw,
  Copy,
  Check,
  Link2,
  ExternalLink,
} from 'lucide-react';
import type {
  AdminOverviewPayload,
  CampaignSettings,
  RankedParticipant,
} from '../types.ts';
import {
  adminConfirmWinners,
  adminLogin,
  adminLogout,
  adminOverrideWinner,
  adminProposeWinners,
  adminUpdateSettings,
  downloadAdminCsv,
  fetchAdminOverview,
} from '../lib/api.ts';

interface AdminDashboardProps {
  onExit: () => void;
  onCampaignMutated: () => void;
}

type AdminTab = 'overview' | 'participants' | 'winners' | 'settings';

export function AdminDashboard({ onExit, onCampaignMutated }: AdminDashboardProps) {
  const [token, setToken] = useState<string>(() => sessionStorage.getItem('iva_admin_token') || '');
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [tab, setTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState<'admin' | 'public' | null>(null);

  const copyShareUrl = useCallback(async (kind: 'admin' | 'public') => {
    const url =
      kind === 'admin' ? `${window.location.origin}/admin` : `${window.location.origin}/`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedLink(kind);
    window.setTimeout(() => setCopiedLink((cur) => (cur === kind ? null : cur)), 2200);
  }, []);

  // Filters
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<'all' | 'iphone' | 'android'>('all');
  const [qualFilter, setQualFilter] = useState<'all' | 'qualified' | 'not_qualified'>('all');
  const [winnerFilter, setWinnerFilter] = useState<'all' | 'proposed' | 'confirmed' | 'none'>('all');

  // Participant inspection drawer
  const [selectedParticipant, setSelectedParticipant] = useState<RankedParticipant | null>(null);

  // Manual override modal
  const [overrideTarget, setOverrideTarget] = useState<RankedParticipant | null>(null);
  const [overrideAction, setOverrideAction] = useState<'add' | 'confirm' | 'remove'>('add');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  // Settings form state
  const [settingsDraft, setSettingsDraft] = useState<CampaignSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadOverview = useCallback(async (activeToken: string) => {
    setLoading(true);
    try {
      const overview = await fetchAdminOverview(activeToken);
      setData(overview);
      setSettingsDraft(overview.settings);
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 401) {
        sessionStorage.removeItem('iva_admin_token');
        setToken('');
      }
      setBannerMsg({ type: 'err', text: e.message || 'Failed to load admin overview.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadOverview(token);
    }
  }, [token, loadOverview]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await adminLogin(passcode);
      sessionStorage.setItem('iva_admin_token', res.token);
      setToken(res.token);
      setPasscode('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (token) await adminLogout(token);
    sessionStorage.removeItem('iva_admin_token');
    setToken('');
    setData(null);
  };

  const filteredParticipants = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.participants.filter((p) => {
      if (teamFilter !== 'all' && p.team !== teamFilter) return false;
      if (qualFilter === 'qualified' && !p.qualified) return false;
      if (qualFilter === 'not_qualified' && p.qualified) return false;
      if (winnerFilter !== 'all' && p.winnerStatus !== winnerFilter) return false;
      if (q) {
        const hay = `${p.entryNumber} ${p.name} ${p.phone} ${p.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, teamFilter, qualFilter, winnerFilter]);

  const handleProposeWinners = async () => {
    setBannerMsg(null);
    try {
      const updated = await adminProposeWinners(token);
      setData(updated);
      onCampaignMutated();
      setBannerMsg({
        type: 'ok',
        text: `Generated provisional winner list (${updated.stats.proposedWinners} provisional, ${updated.stats.confirmedWinners} confirmed). Review carefully before confirming.`,
      });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Action failed.' });
    }
  };

  const handleConfirmWinners = async () => {
    setBannerMsg(null);
    try {
      const updated = await adminConfirmWinners(token);
      setData(updated);
      onCampaignMutated();
      setBannerMsg({
        type: 'ok',
        text: `Confirmed official winners (${updated.stats.confirmedWinners} total confirmed). Audit record saved.`,
      });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Confirmation failed.' });
    }
  };

  const handleOverrideSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!overrideTarget) return;
    setOverrideSubmitting(true);
    setBannerMsg(null);
    try {
      const updated = await adminOverrideWinner(token, {
        participantId: overrideTarget.id,
        action: overrideAction,
        reason: overrideReason,
      });
      setData(updated);
      onCampaignMutated();
      const refreshedTarget = updated.participants.find((p) => p.id === overrideTarget.id) ?? null;
      if (selectedParticipant?.id === overrideTarget.id) {
        setSelectedParticipant(refreshedTarget);
      }
      setOverrideTarget(null);
      setOverrideReason('');
      setBannerMsg({
        type: 'ok',
        text: `Manual override applied to ${overrideTarget.entryNumber} and recorded in the audit log.`,
      });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Override failed.' });
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!settingsDraft) return;
    setSavingSettings(true);
    setBannerMsg(null);
    try {
      const updated = await adminUpdateSettings(token, settingsDraft);
      setData(updated);
      setSettingsDraft(updated.settings);
      onCampaignMutated();
      setBannerMsg({ type: 'ok', text: 'Campaign settings updated successfully.' });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Unable to save settings.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExport = async (type: 'participants' | 'winners') => {
    try {
      await downloadAdminCsv(token, type);
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Export failed.' });
    }
  };

  // ─── ADMIN LOGIN GATE ───────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-[100dvh] bg-[#f4f6f5] px-4 py-12">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0b141a]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Open Public Campaign Site</span>
          </button>

          <div className="mt-4 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="bg-[#081722] px-7 py-6 text-white">
              <p className="text-xs font-medium text-[#d9ff70]">Protected Operations Console</p>
              <h1 className="mt-1 font-[var(--font-display)] text-3xl font-extrabold uppercase tracking-tight">
                Admin Dashboard Sign In
              </h1>
              <p className="mt-1.5 text-xs text-slate-300">
                Access participant contact records, winner verification, audit logs, and campaign settings.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 p-7">
              {authError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
                  {authError}
                </div>
              )}

              <div>
                <label htmlFor="admin-passcode" className="block text-xs font-semibold text-slate-700">
                  Admin Passcode
                </label>
                <input
                  id="admin-passcode"
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter admin passcode"
                  required
                  className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-[#f8faf9] px-4 text-sm text-[#0b141a] focus:border-[#0b141a] focus:bg-white focus:outline-none"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Evaluation passcode: <code className="font-mono font-semibold text-[#0b141a]">admin2026</code>
                </p>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#090d11] px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
              >
                {authLoading ? 'Verifying...' : 'Sign In to Dashboard'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const stats = data?.stats;
  const totalTeam = Math.max(1, (stats?.iphoneCount ?? 0) + (stats?.androidCount ?? 0));
  const iphonePct = Math.round(((stats?.iphoneCount ?? 0) / totalTeam) * 100);

  return (
    <div className="min-h-[100dvh] bg-[#f4f6f5] text-[#0b141a]">
      <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
        {/* Sidebar Navigation */}
        <aside className="w-full shrink-0 border-b border-slate-200 bg-white lg:min-h-[100dvh] lg:w-64 lg:border-b-0 lg:border-r">
          <div className="p-5">
            <div className="text-xs font-semibold text-slate-500">Dedicated Operations Portal</div>
            <div className="mt-0.5 font-[var(--font-display)] text-2xl font-extrabold uppercase tracking-tight text-[#0b141a]">
              Admin Console
            </div>

            <nav className="mt-5 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-1">
              {(
                [
                  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                  { id: 'participants', label: 'Participants', icon: Users },
                  { id: 'winners', label: 'Winners & Audit', icon: Trophy },
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
                    className={`flex min-h-[44px] items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#090d11] text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-[#0b141a]'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-[#d9ff70]' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Shareable Links */}
            <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <Link2 className="h-3.5 w-3.5" />
                <span>Shareable Links</span>
              </div>
              <button
                type="button"
                onClick={() => copyShareUrl('admin')}
                className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-[#0b141a] hover:bg-slate-100"
              >
                <span className="truncate">
                  {copiedLink === 'admin' ? 'Admin Link Copied!' : 'Copy Admin Link (/admin)'}
                </span>
                {copiedLink === 'admin' ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
              </button>
              <button
                type="button"
                onClick={() => copyShareUrl('public')}
                className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <span className="truncate">
                  {copiedLink === 'public' ? 'Player Link Copied!' : 'Copy Public Game Link'}
                </span>
                {copiedLink === 'public' ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
              </button>
            </div>

            <div className="mt-5 space-y-2 border-t border-slate-200 pt-5">
              <button
                type="button"
                onClick={() => loadOverview(token)}
                className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh Data</span>
              </button>
              <button
                type="button"
                onClick={onExit}
                className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>View Public Campaign</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Workspace Content */}
        <main className="flex-1 p-5 sm:p-8">
          {/* Top Breadcrumb + Quick Exports */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="text-xs font-medium text-slate-500">
                iPhone vs Android / <span className="capitalize text-[#0b141a]">{tab}</span>
              </div>
              <h1 className="mt-0.5 font-[var(--font-display)] text-3xl font-extrabold uppercase tracking-tight">
                {tab === 'overview'
                  ? 'Campaign Overview'
                  : tab === 'participants'
                    ? 'Participant Entries'
                    : tab === 'winners'
                      ? 'Winner Selection & Audit Log'
                      : 'Campaign Settings & Rules'}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleExport('participants')}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#0b141a] hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Participants CSV</span>
              </button>
              <button
                type="button"
                onClick={() => handleExport('winners')}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#090d11] px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 text-[#d9ff70]" />
                <span>Export Winners CSV</span>
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

          {!data ? (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[1, 2, 3].map((k) => (
                <div key={k} className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
              ))}
            </div>
          ) : (
            <>
              {/* ─── TAB 1: OVERVIEW ─── */}
              {tab === 'overview' && (
                <div className="mt-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="text-xs font-medium text-slate-500">Total Participants</div>
                      <div className="mt-2 font-mono text-3xl font-bold tabular-nums">
                        {data.stats.totalParticipants}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="text-xs font-medium text-slate-500">Completed Games</div>
                      <div className="mt-2 font-mono text-3xl font-bold tabular-nums">
                        {data.stats.completedGames}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="text-xs font-medium text-slate-500">Qualified ({data.settings.qualificationThreshold}/5+)</div>
                      <div className="mt-2 font-mono text-3xl font-bold text-emerald-700 tabular-nums">
                        {data.stats.qualifiedParticipants}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="text-xs font-medium text-slate-500">Provisional Winners</div>
                      <div className="mt-2 font-mono text-3xl font-bold text-amber-600 tabular-nums">
                        {data.stats.proposedWinners}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="text-xs font-medium text-slate-500">Confirmed Winners</div>
                      <div className="mt-2 font-mono text-3xl font-bold text-[#0b141a] tabular-nums">
                        {data.stats.confirmedWinners} / {data.settings.winnerCount}
                      </div>
                    </div>
                  </div>

                  {/* Team Split Breakdown */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-bold text-[#0b141a]">
                          iPhone vs Android Participation
                        </h2>
                        <p className="text-xs text-slate-500">
                          Visual team kit selection split across all registered participants.
                        </p>
                      </div>
                      <div className="flex items-center gap-4 font-mono text-xs font-semibold tabular-nums">
                        <span>Team iPhone: {data.stats.iphoneCount} ({iphonePct}%)</span>
                        <span>Team Android: {data.stats.androidCount} ({100 - iphonePct}%)</span>
                      </div>
                    </div>

                    <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-[#090d11] transition-all"
                        style={{ width: `${iphonePct}%` }}
                      />
                      <div
                        className="h-full bg-[#16a34a] transition-all"
                        style={{ width: `${100 - iphonePct}%` }}
                      />
                    </div>
                  </div>

                  {/* Recent Audit Activity */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <h2 className="text-base font-bold text-[#0b141a]">Recent Audit Events</h2>
                    <div className="mt-4 divide-y divide-slate-100">
                      {data.auditLog.slice(0, 6).map((entry) => (
                        <div key={entry.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-xs">
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
                    </div>
                  </div>
                </div>
              )}

              {/* ─── TAB 2: PARTICIPANT TABLE ─── */}
              {tab === 'participants' && (
                <div className="mt-6 space-y-4">
                  {/* Search & Filter Toolbar */}
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="relative flex-1 min-w-[220px]">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, phone number, email, or entry #"
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
                      <option value="all">All Qualifications</option>
                      <option value="qualified">Qualified Only</option>
                      <option value="not_qualified">Not Qualified</option>
                    </select>

                    <select
                      aria-label="Filter by winner status"
                      value={winnerFilter}
                      onChange={(e) => setWinnerFilter(e.target.value as typeof winnerFilter)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
                    >
                      <option value="all">All Winner Statuses</option>
                      <option value="confirmed">Confirmed Winners</option>
                      <option value="proposed">Provisional Winners</option>
                      <option value="none">Unselected</option>
                    </select>
                  </div>

                  {/* High-Density Data Table */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 font-semibold text-slate-500">
                            <th className="px-4 py-3">Entry #</th>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Phone</th>
                            <th className="px-4 py-3">Team</th>
                            <th className="px-4 py-3 text-right">Score</th>
                            <th className="px-4 py-3">Qualification</th>
                            <th className="px-4 py-3 text-right">Rank</th>
                            <th className="px-4 py-3">Time</th>
                            <th className="px-4 py-3">Winner Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredParticipants.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50/80">
                              <td className="px-4 py-3 font-mono font-bold">
                                <button
                                  type="button"
                                  onClick={() => setSelectedParticipant(p)}
                                  className="text-[#0b141a] underline decoration-slate-400 underline-offset-2 hover:decoration-[#0b141a]"
                                >
                                  {p.entryNumber}
                                </button>
                              </td>
                              <td className="px-4 py-3 font-semibold text-[#0b141a] whitespace-nowrap">
                                {p.name}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{p.email}</td>
                              <td className="px-4 py-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                                {p.phone}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {p.team === 'iphone'
                                  ? 'Team iPhone'
                                  : p.team === 'android'
                                    ? 'Team Android'
                                    : 'Pending'}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                                {p.score}/{data.settings.totalAttempts}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={
                                    p.qualified
                                      ? 'font-semibold text-emerald-700'
                                      : 'text-slate-500'
                                  }
                                >
                                  {p.qualified ? 'Qualified' : 'Not Qualified'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                                {p.provisionalRank ? `#${p.provisionalRank}` : '—'}
                              </td>
                              <td className="px-4 py-3 font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                                {new Date(p.completedAt || p.createdAt).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={`font-semibold capitalize ${
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
                                    ? 'Provisional'
                                    : p.winnerStatus === 'none'
                                      ? '—'
                                      : p.winnerStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {filteredParticipants.length === 0 && (
                            <tr>
                              <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                                No participants match your current search or filter criteria.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── TAB 3: WINNER MANAGEMENT & AUDIT ─── */}
              {tab === 'winners' && (
                <div className="mt-6 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        Target Winner Count: {data.settings.winnerCount} · Tie-Breaker:{' '}
                        {data.settings.tieBreakerRule.replace(/_/g, ' ')}
                      </p>
                      <h2 className="mt-1 text-lg font-bold text-[#0b141a]">
                        Provisional Winner Selection Workflow
                      </h2>
                      <p className="mt-1 text-xs text-slate-600">
                        Winners remain provisional until explicitly confirmed. Any manual override
                        requires a written audit reason.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleProposeWinners}
                        className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-[#0b141a] hover:bg-slate-50 whitespace-nowrap"
                      >
                        Generate Proposed Winner List
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmWinners}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#090d11] px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 whitespace-nowrap"
                      >
                        <CheckCircle2 className="h-4 w-4 text-[#d9ff70]" />
                        <span>Confirm Provisional Winners</span>
                      </button>
                    </div>
                  </div>

                  {/* Eligible Ranking & Override Table */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 px-6 py-4">
                      <h3 className="text-sm font-bold text-[#0b141a]">
                        Eligible Qualified Participants
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 font-semibold text-slate-500">
                            <th className="px-4 py-3">Rank</th>
                            <th className="px-4 py-3">Entry #</th>
                            <th className="px-4 py-3">Participant</th>
                            <th className="px-4 py-3">Team</th>
                            <th className="px-4 py-3 text-right">Score</th>
                            <th className="px-4 py-3">Winner Status</th>
                            <th className="px-4 py-3 text-right">Manual Override</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.participants
                            .filter((p) => p.qualified)
                            .map((p) => (
                              <tr key={p.id} className="hover:bg-slate-50/70">
                                <td className="px-4 py-3 font-mono font-bold tabular-nums">
                                  #{p.provisionalRank}
                                </td>
                                <td className="px-4 py-3 font-mono">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedParticipant(p)}
                                    className="underline decoration-slate-400 underline-offset-2"
                                  >
                                    {p.entryNumber}
                                  </button>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-semibold text-[#0b141a]">{p.name}</div>
                                  <div className="font-mono text-[11px] text-slate-500">{p.phone}</div>
                                </td>
                                <td className="px-4 py-3">
                                  {p.team === 'iphone' ? 'Team iPhone' : 'Team Android'}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                                  {p.score}/{data.settings.totalAttempts}
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
                                          ? 'Removed (Override)'
                                          : 'Eligible'}
                                  </span>
                                  {p.overrideNote && (
                                    <div className="mt-0.5 text-[11px] text-slate-500">
                                      {p.overrideNote}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOverrideTarget(p);
                                      setOverrideAction(
                                        p.winnerStatus === 'confirmed' || p.winnerStatus === 'proposed'
                                          ? 'remove'
                                          : 'add'
                                      );
                                      setOverrideReason('');
                                    }}
                                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#0b141a] hover:bg-slate-100 whitespace-nowrap"
                                  >
                                    Manual Override
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Audit Record Table */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <h3 className="text-sm font-bold text-[#0b141a]">
                      Immutable Winner & Override Audit Log
                    </h3>
                    <div className="mt-3 divide-y divide-slate-100">
                      {data.auditLog.map((log) => (
                        <div key={log.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-xs">
                          <div>
                            <span className="font-mono font-bold text-[#0b141a]">{log.action}</span>
                            {log.targetEntryNumber && (
                              <span className="ml-2 font-mono text-slate-500">
                                Entry {log.targetEntryNumber}
                              </span>
                            )}
                            <p className="mt-0.5 text-slate-600">{log.reason}</p>
                          </div>
                          <div className="text-right font-mono text-[11px] text-slate-400 tabular-nums">
                            <div>{log.actor}</div>
                            <div>{new Date(log.timestamp).toLocaleString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── TAB 4: CAMPAIGN SETTINGS ─── */}
              {tab === 'settings' && settingsDraft && (
                <form onSubmit={handleSaveSettings} className="mt-6 space-y-6">
                  {/* Editorial & Schedule Settings */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                    <h2 className="text-base font-bold text-[#0b141a]">
                      Banner, Copy & Campaign Dates
                    </h2>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Giveaway Headline
                        </label>
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
                        <label className="block text-xs font-semibold text-slate-700">
                          Campaign Status
                        </label>
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
                          <option value="closed">Closed (Winner Review)</option>
                          <option value="draft">Draft</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Short Explanation Copy
                      </label>
                      <input
                        type="text"
                        value={settingsDraft.subheadline}
                        onChange={(e) =>
                          setSettingsDraft({ ...settingsDraft, subheadline: e.target.value })
                        }
                        className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Campaign Banner Image URL
                      </label>
                      <input
                        type="text"
                        value={settingsDraft.bannerUrl}
                        onChange={(e) =>
                          setSettingsDraft({ ...settingsDraft, bannerUrl: e.target.value })
                        }
                        className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 font-mono text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={settingsDraft.startDate}
                          onChange={(e) =>
                            setSettingsDraft({ ...settingsDraft, startDate: e.target.value })
                          }
                          className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 font-mono text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          End Date
                        </label>
                        <input
                          type="date"
                          value={settingsDraft.endDate}
                          onChange={(e) =>
                            setSettingsDraft({ ...settingsDraft, endDate: e.target.value })
                          }
                          className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Competition Rules (Locked Once Entries Open) */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-bold text-[#0b141a]">
                          Competition & Fairness Rules
                        </h2>
                        <p className="text-xs text-slate-500">
                          Locked automatically once campaign entries open to guarantee fairness.
                        </p>
                      </div>
                      {settingsDraft.rulesLocked && (
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                          <Lock className="h-3.5 w-3.5" />
                          <span>Rules Locked (Entries Active)</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Qualification Threshold (out of 5)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          disabled={settingsDraft.rulesLocked}
                          value={settingsDraft.qualificationThreshold}
                          onChange={(e) =>
                            setSettingsDraft({
                              ...settingsDraft,
                              qualificationThreshold: Number(e.target.value),
                            })
                          }
                          className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 font-mono text-sm disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Winner Count
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          disabled={settingsDraft.rulesLocked}
                          value={settingsDraft.winnerCount}
                          onChange={(e) =>
                            setSettingsDraft({
                              ...settingsDraft,
                              winnerCount: Number(e.target.value),
                            })
                          }
                          className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 font-mono text-sm disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Tie-Breaking Rule
                        </label>
                        <select
                          disabled={settingsDraft.rulesLocked}
                          value={settingsDraft.tieBreakerRule}
                          onChange={(e) =>
                            setSettingsDraft({
                              ...settingsDraft,
                              tieBreakerRule: e.target.value as CampaignSettings['tieBreakerRule'],
                            })
                          }
                          className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          <option value="earliest_completion">Earliest Verified Completion Time</option>
                          <option value="highest_accuracy_score">Highest Shot Corner-Accuracy Score</option>
                          <option value="verified_random_draw">Deterministic Audited Random Draw</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Participation Policy
                        </label>
                        <select
                          disabled={settingsDraft.rulesLocked}
                          value={settingsDraft.participationPolicy}
                          onChange={(e) =>
                            setSettingsDraft({
                              ...settingsDraft,
                              participationPolicy: e.target
                                .value as CampaignSettings['participationPolicy'],
                            })
                          }
                          className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          <option value="one_per_phone">One Entry Per Verified Phone Number</option>
                          <option value="one_per_email">One Entry Per Email Address</option>
                          <option value="unlimited">Unlimited (Pre-Launch QA)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Prize Schedule Editor */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                    <h2 className="text-base font-bold text-[#0b141a]">Editable Prize Tiers</h2>
                    <div className="space-y-3">
                      {settingsDraft.prizes.map((prize, idx) => (
                        <div
                          key={prize.id}
                          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-12"
                        >
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-500">
                              Tier
                            </label>
                            <input
                              type="text"
                              value={prize.tier}
                              onChange={(e) => {
                                const next = [...settingsDraft.prizes];
                                next[idx] = { ...prize, tier: e.target.value };
                                setSettingsDraft({ ...settingsDraft, prizes: next });
                              }}
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-xs"
                            />
                          </div>
                          <div className="sm:col-span-5">
                            <label className="block text-[11px] font-semibold text-slate-500">
                              Prize Name
                            </label>
                            <input
                              type="text"
                              value={prize.title}
                              onChange={(e) => {
                                const next = [...settingsDraft.prizes];
                                next[idx] = { ...prize, title: e.target.value };
                                setSettingsDraft({ ...settingsDraft, prizes: next });
                              }}
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-semibold"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-500">
                              Quantity
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={prize.quantity}
                              onChange={(e) => {
                                const next = [...settingsDraft.prizes];
                                next[idx] = { ...prize, quantity: Number(e.target.value) };
                                setSettingsDraft({ ...settingsDraft, prizes: next });
                              }}
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-xs"
                            />
                          </div>
                          <div className="sm:col-span-2 flex items-end">
                            <span className="text-[11px] text-slate-400">Active tier</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="min-h-[48px] rounded-xl bg-[#090d11] px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
                    >
                      {savingSettings ? 'Saving...' : 'Save Campaign Settings'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </main>
      </div>

      {/* ─── PARTICIPANT DETAIL DRAWER (Clicking Entry Number) ─── */}
      {selectedParticipant && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[#061018]/60"
          onClick={() => setSelectedParticipant(null)}
        >
          <div
            className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="font-mono text-xs font-bold text-slate-500">
                  {selectedParticipant.entryNumber}
                </div>
                <h2 className="mt-0.5 text-xl font-bold text-[#0b141a]">
                  {selectedParticipant.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedParticipant(null)}
                aria-label="Close entry detail"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-5 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[#f4f6f5] p-4">
                <div>
                  <span className="text-slate-500">Email</span>
                  <div className="mt-0.5 font-semibold text-[#0b141a] break-all">
                    {selectedParticipant.email}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Phone Number</span>
                  <div className="mt-0.5 font-mono font-semibold text-[#0b141a]">
                    {selectedParticipant.phone}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Selected Team</span>
                  <div className="mt-0.5 font-semibold text-[#0b141a]">
                    {selectedParticipant.team === 'iphone'
                      ? 'Team iPhone'
                      : selectedParticipant.team === 'android'
                        ? 'Team Android'
                        : 'Unselected'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Marketing Opt-In</span>
                  <div className="mt-0.5 font-semibold text-[#0b141a]">
                    {selectedParticipant.marketingOptIn ? 'Yes (Opted in)' : 'No'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Final Score</span>
                  <div className="mt-0.5 font-mono text-sm font-bold text-[#0b141a]">
                    {selectedParticipant.score}/5 ({selectedParticipant.qualified ? 'Qualified' : 'Not Qualified'})
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Provisional Rank</span>
                  <div className="mt-0.5 font-mono text-sm font-bold text-[#0b141a]">
                    {selectedParticipant.provisionalRank ? `#${selectedParticipant.provisionalRank}` : 'Unranked'}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#0b141a]">
                  Server-Validated Shot Telemetry
                </h3>
                <div className="mt-2.5 space-y-2">
                  {selectedParticipant.attempts.map((a) => (
                    <div
                      key={a.attemptNumber}
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5"
                    >
                      <div>
                        <span className="font-mono font-bold text-[#0b141a]">
                          Kick #{a.attemptNumber}
                        </span>
                        <span className="ml-2 text-slate-500">
                          Power {Math.round(a.power)}% · Accuracy {a.accuracyScore}
                        </span>
                      </div>
                      <span
                        className={`font-mono font-bold ${
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
                  {selectedParticipant.attempts.length === 0 && (
                    <p className="text-slate-500">No penalty shots recorded yet.</p>
                  )}
                </div>
              </div>

              {selectedParticipant.overrideNote && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-900">
                  <strong>Audit Override Note:</strong> {selectedParticipant.overrideNote}
                </div>
              )}

              {selectedParticipant.qualified && (
                <button
                  type="button"
                  onClick={() => {
                    setOverrideTarget(selectedParticipant);
                    setOverrideAction(
                      selectedParticipant.winnerStatus === 'confirmed' ||
                        selectedParticipant.winnerStatus === 'proposed'
                        ? 'remove'
                        : 'add'
                    );
                    setOverrideReason('');
                  }}
                  className="w-full min-h-[44px] rounded-xl bg-[#090d11] px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Open Manual Winner Override
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MANUAL OVERRIDE MODAL (Required Audit Reason) ─── */}
      {overrideTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#061018]/70 p-4"
          onClick={() => setOverrideTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <h2 className="text-base font-bold text-[#0b141a]">
                  Manual Winner Override · {overrideTarget.entryNumber}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {overrideTarget.name} ({overrideTarget.score}/5). This action creates a permanent
                  entry in the campaign audit log.
                </p>
              </div>
            </div>

            <form onSubmit={handleOverrideSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Override Action</label>
                <select
                  value={overrideAction}
                  onChange={(e) => setOverrideAction(e.target.value as typeof overrideAction)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="add">Add to Provisional Winners</option>
                  <option value="confirm">Directly Confirm as Official Winner</option>
                  <option value="remove">Remove from Winner Eligibility</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Required Audit Reason
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="State the verification finding or eligibility reason for this override..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#0b141a] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOverrideTarget(null)}
                  className="min-h-[42px] rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideSubmitting}
                  className="min-h-[42px] rounded-xl bg-[#090d11] px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {overrideSubmitting ? 'Recording...' : 'Confirm Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
