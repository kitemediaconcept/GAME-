import { useState } from 'react';
import { Play, Trophy, FileText, ChevronRight, Smartphone, ShieldCheck } from 'lucide-react';
import type { PublicCampaignPayload, TeamId } from '../types.ts';
import { ASSETS } from '../lib/assets.ts';

interface CampaignHomeProps {
  campaign: PublicCampaignPayload;
  onPlayGame: () => void;
  onPracticePitch: (team: TeamId) => void;
  onOpenRules: () => void;
  onViewLeaderboard: () => void;
}

export function CampaignHome({
  campaign,
  onPlayGame,
  onPracticePitch,
  onOpenRules,
  onViewLeaderboard,
}: CampaignHomeProps) {
  const { settings, leaderboard } = campaign;
  const [previewTeam, setPreviewTeam] = useState<TeamId>('iphone');
  const [bannerFailed, setBannerFailed] = useState(false);
  const [prizeImgFailed, setPrizeImgFailed] = useState(false);
  const [mockupFailed, setMockupFailed] = useState(false);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-5 sm:px-6 lg:px-8">
      {/* ─── SECTION 2: CAMPAIGN HOME HERO (Strict Content Order) ─── */}
      <section className="overflow-hidden rounded-[28px] bg-[#081722] text-white shadow-sm">
        <div className="grid grid-cols-1 items-stretch lg:grid-cols-12">
          {/* 1. Campaign Banner */}
          <div className="relative min-h-[260px] sm:min-h-[340px] lg:col-span-7 lg:min-h-[440px]">
            {!bannerFailed ? (
              <img
                src={settings.bannerUrl || ASSETS.campaignBanner}
                alt="iPhone vs Android night football stadium penalty shootout banner"
                referrerPolicy="no-referrer"
                onError={() => setBannerFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0e3b22] via-[#091c28] to-[#08141e] p-8">
                <span className="font-[var(--font-display)] text-4xl font-extrabold uppercase tracking-wide text-[#d9ff70]">
                  {settings.title}
                </span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#081722] via-[#081722]/35 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-[#081722]/20 lg:to-[#081722]" />

            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs font-medium text-slate-200 sm:bottom-6 sm:left-6">
              <span>{settings.title}</span>
              <span className="font-mono tabular-nums text-[#d9ff70]">
                {settings.startDate} – {settings.endDate}
              </span>
            </div>
          </div>

          {/* 2. Giveaway Hook · 3. Explanation · 4. Play Game CTA · 5. Rules Link */}
          <div className="flex flex-col justify-center p-6 sm:p-8 lg:col-span-5 lg:p-10">
            <p className="text-xs font-medium text-[#d9ff70]">
              {settings.title} · Penalty Shootout Giveaway
            </p>

            {/* 2. Giveaway Hook */}
            <h1 className="mt-2 font-[var(--font-display)] text-4xl font-extrabold uppercase leading-[0.98] tracking-tight text-white [text-wrap:balance] sm:text-5xl">
              {settings.headline}
            </h1>

            {/* 3. Short Explanation */}
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">
              {settings.subheadline}
            </p>

            {/* 4. Prominent Play Game Button */}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row lg:flex-col">
              <button
                type="button"
                onClick={onPlayGame}
                className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[#d9ff70] px-6 py-3.5 text-sm font-bold tracking-wide text-[#091318] uppercase hover:bg-[#e4ff96] active:scale-[0.99] transition-all whitespace-nowrap"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Play Game</span>
              </button>

              <button
                type="button"
                onClick={() => onPracticePitch(previewTeam)}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/8 px-5 py-3 text-sm font-semibold text-white hover:bg-white/14 transition-colors whitespace-nowrap"
              >
                <span>Practice 3D Pitch</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* 5. Campaign Rules & Eligibility Link */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-slate-300">
              <button
                type="button"
                onClick={onOpenRules}
                className="inline-flex items-center gap-1.5 font-semibold text-white underline decoration-[#d9ff70]/70 underline-offset-4 hover:text-[#d9ff70] transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Campaign Rules & Eligibility</span>
              </button>
              <span className="font-mono text-slate-400 tabular-nums">
                Score {settings.qualificationThreshold}/{settings.totalAttempts}+ to qualify
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── MOBILE GAMEPLAY PREVIEW + PRIZE SCHEDULE ─── */}
      <section className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Left: Vertical Mobile Gameplay Screen Preview */}
        <div className="rounded-[28px] bg-white p-6 border border-slate-200/80 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500">Mobile Pitch Preview</p>
              <h2 className="mt-0.5 font-[var(--font-display)] text-2xl font-extrabold uppercase tracking-tight text-[#0b141a]">
                iPhone vs Android
              </h2>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setPreviewTeam('iphone')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  previewTeam === 'iphone'
                    ? 'bg-[#090d11] text-white'
                    : 'text-slate-600 hover:text-[#0b141a]'
                }`}
              >
                iPhone
              </button>
              <button
                type="button"
                onClick={() => setPreviewTeam('android')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  previewTeam === 'android'
                    ? 'bg-[#d9ff70] text-[#091318]'
                    : 'text-slate-600 hover:text-[#0b141a]'
                }`}
              >
                Android
              </button>
            </div>
          </div>

          {/* Vertical Mobile Screen Frame (9:16 visual mockup with clean HUD overlay) */}
          <div className="relative mx-auto mt-5 aspect-[9/15] max-w-[300px] overflow-hidden rounded-[32px] border-[6px] border-[#0b141a] bg-[#081722] shadow-lg">
            {!mockupFailed ? (
              <img
                src={ASSETS.gameplayMockup}
                alt="Vertical mobile penalty shootout screen facing the goalkeeper"
                referrerPolicy="no-referrer"
                onError={() => setMockupFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-b from-[#081722] via-[#134e26] to-[#1a5f2b]" />
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#06121b]/80 via-transparent to-[#06121b]/90" />

            {/* Top Mockup HUD */}
            <div className="absolute inset-x-3 top-3 rounded-2xl bg-[#081621]/88 px-3 py-2.5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-[var(--font-display)] text-sm font-extrabold uppercase tracking-wide leading-none">
                    iPhone vs Android
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium text-slate-300">
                    {previewTeam === 'iphone' ? 'Team iPhone Kit' : 'Team Android Kit'} · 2 left
                  </div>
                </div>
                <div className="font-mono text-xs font-bold text-[#d9ff70] tabular-nums">
                  2 / 5
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {['✓', '✓', 'S', '4', '5'].map((v, i) => (
                  <span
                    key={i}
                    className={`flex h-4 w-4 items-center justify-center rounded-full font-mono text-[9px] font-bold ${
                      v === '✓'
                        ? 'bg-[#d9ff70] text-[#091318]'
                        : v === 'S'
                          ? 'bg-amber-400 text-[#091318]'
                          : 'bg-white/20 text-white/75'
                    }`}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>

            {/* Bottom Thumb-Friendly Shoot Ring Preview */}
            <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-medium tracking-wider text-slate-200 uppercase">
                Hold to power · Release to shoot
              </span>
              <button
                type="button"
                onClick={() => onPracticePitch(previewTeam)}
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#d9ff70]/85 bg-white text-[10px] font-extrabold tracking-widest text-[#091318] uppercase shadow-lg hover:scale-105 transition-transform"
              >
                PLAY 3D
              </button>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            Interactive 3D WebGL stadium built for one-handed mobile thumb play and desktop Spacebar control.
          </p>
        </div>

        {/* Right: Prizes & Provisional Leaderboard */}
        <div className="space-y-6 lg:col-span-7">
          {/* Prize Schedule Card */}
          <div className="overflow-hidden rounded-[28px] bg-white border border-slate-200/80">
            <div className="grid grid-cols-1 sm:grid-cols-12 items-stretch">
              <div className="relative min-h-[190px] sm:col-span-5">
                {!prizeImgFailed ? (
                  <img
                    src={ASSETS.prizeShowcase}
                    alt="Titanium silver and emerald flagship smartphones beside a match football"
                    referrerPolicy="no-referrer"
                    onError={() => setPrizeImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#0b141a] text-white">
                    <Smartphone className="h-10 w-10 text-[#d9ff70]" />
                  </div>
                )}
              </div>
              <div className="p-6 sm:col-span-7">
                <p className="text-xs font-medium text-slate-500">
                  {settings.winnerCount} Confirmed Winners · Post-Close Review
                </p>
                <h2 className="mt-1 font-[var(--font-display)] text-2xl font-extrabold uppercase tracking-tight text-[#0b141a]">
                  Official Prize Allocation
                </h2>
                <div className="mt-4 space-y-3">
                  {settings.prizes.map((prize) => (
                    <div
                      key={prize.id}
                      className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5 last:border-0 last:pb-0"
                    >
                      <div>
                        <div className="text-xs font-medium text-slate-500">{prize.tier}</div>
                        <div className="text-sm font-bold text-[#0b141a]">{prize.title}</div>
                      </div>
                      <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                        ×{prize.quantity}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  {settings.prizeNote}
                </p>
              </div>
            </div>
          </div>

          {/* Public Provisional Leaderboard Preview */}
          <div className="rounded-[28px] bg-white p-6 border border-slate-200/80">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Provisional Standings · Personal Details Protected
                </p>
                <h2 className="mt-0.5 font-[var(--font-display)] text-2xl font-extrabold uppercase tracking-tight text-[#0b141a]">
                  Top Shootout Qualifiers
                </h2>
              </div>
              <button
                type="button"
                onClick={onViewLeaderboard}
                className="text-xs font-semibold text-[#0b141a] underline decoration-slate-300 underline-offset-4 hover:decoration-[#0b141a] whitespace-nowrap"
              >
                Full Table
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-2.5 pr-3">Rank</th>
                    <th className="py-2.5 pr-3">Player</th>
                    <th className="py-2.5 pr-3">Team</th>
                    <th className="py-2.5 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaderboard.slice(0, 6).map((row) => (
                    <tr key={row.entryNumber} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-3 font-mono text-xs font-bold text-[#0b141a] tabular-nums">
                        #{row.provisionalRank}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-[#0b141a]">{row.displayName}</div>
                        <div className="font-mono text-[11px] text-slate-500">{row.entryNumber}</div>
                      </td>
                      <td className="py-3 pr-3 text-xs font-medium text-slate-600">
                        {row.team === 'iphone' ? 'Team iPhone' : 'Team Android'}
                      </td>
                      <td className="py-3 text-right font-mono text-sm font-bold text-[#0b141a] tabular-nums">
                        {row.score}/{row.totalAttempts}
                      </td>
                    </tr>
                  ))}
                  {leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-sm text-slate-500">
                        No qualified entries yet. Be the first to take 5 penalties.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>
                Rankings are provisional until verified after {settings.endDate}. Winner count: top{' '}
                {settings.winnerCount}.
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
