import { useState } from 'react';
import { ArrowLeft, ShieldCheck, Play } from 'lucide-react';
import type { PublicCampaignPayload } from '../types.ts';

interface LeaderboardPageProps {
  campaign: PublicCampaignPayload;
  onBack: () => void;
  onPlayGame: () => void;
  onOpenRules: () => void;
}

export function LeaderboardPage({
  campaign,
  onBack,
  onPlayGame,
  onOpenRules,
}: LeaderboardPageProps) {
  const [teamFilter, setTeamFilter] = useState<'all' | 'iphone' | 'android'>('all');
  const { settings, leaderboard, stats } = campaign;

  const filtered = leaderboard.filter((row) =>
    teamFilter === 'all' ? true : row.team === teamFilter
  );

  const tieLabel =
    settings.tieBreakerRule === 'earliest_completion'
      ? 'Earliest completion time'
      : settings.tieBreakerRule === 'highest_accuracy_score'
        ? 'Highest shot accuracy score'
        : 'Audited random draw';

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0b141a]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to campaign</span>
        </button>

        <button
          type="button"
          onClick={onPlayGame}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#090d11] px-5 py-2.5 text-xs font-bold tracking-wide text-white uppercase hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <Play className="h-3.5 w-3.5 fill-current text-[#d9ff70]" />
          <span>Take Your 5 Kicks</span>
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-[28px] bg-white border border-slate-200/90">
        <div className="bg-[#081722] px-6 py-7 text-white sm:px-8">
          <p className="text-xs font-medium text-[#d9ff70]">
            Provisional Giveaway Standings · Top {settings.winnerCount} Reviewed After Close
          </p>
          <h1 className="mt-1 font-[var(--font-display)] text-4xl font-extrabold uppercase tracking-tight">
            Public Shootout Leaderboard
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
            <span>Qualified players: {stats.qualifiedParticipants}</span>
            <span aria-hidden="true">·</span>
            <span>Threshold: {settings.qualificationThreshold}/{settings.totalAttempts} goals</span>
            <span aria-hidden="true">·</span>
            <span>Tie-breaker: {tieLabel}</span>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            {/* Functional Team Filter Control */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              {(
                [
                  { id: 'all', label: 'All Qualified' },
                  { id: 'iphone', label: 'Team iPhone' },
                  { id: 'android', label: 'Team Android' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTeamFilter(tab.id)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    teamFilter === tab.id
                      ? 'bg-[#090d11] text-white'
                      : 'text-slate-600 hover:text-[#0b141a]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onOpenRules}
              className="text-xs font-semibold text-[#0b141a] underline decoration-slate-300 underline-offset-4 hover:decoration-[#0b141a]"
            >
              View Ranking & Tie-Break Rules
            </button>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-3 pr-4">Provisional Rank</th>
                  <th className="py-3 pr-4">Entry #</th>
                  <th className="py-3 pr-4">Participant</th>
                  <th className="py-3 pr-4">Team</th>
                  <th className="py-3 pr-4 text-right">Score</th>
                  <th className="py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => {
                  const inTopZone = (row.provisionalRank ?? 999) <= settings.winnerCount;
                  return (
                    <tr key={row.entryNumber} className="hover:bg-slate-50/80">
                      <td className="py-3.5 pr-4 font-mono text-sm font-bold text-[#0b141a] tabular-nums">
                        #{row.provisionalRank}
                      </td>
                      <td className="py-3.5 pr-4 font-mono text-xs text-slate-500 tabular-nums">
                        {row.entryNumber}
                      </td>
                      <td className="py-3.5 pr-4 font-semibold text-[#0b141a]">
                        {row.displayName}
                      </td>
                      <td className="py-3.5 pr-4 text-xs font-medium text-slate-600">
                        {row.team === 'iphone' ? 'Team iPhone' : 'Team Android'}
                      </td>
                      <td className="py-3.5 pr-4 text-right font-mono text-sm font-bold text-[#0b141a] tabular-nums">
                        {row.score}/{row.totalAttempts}
                      </td>
                      <td className="py-3.5 text-right text-xs font-semibold">
                        {row.winnerStatus === 'confirmed' ? (
                          <span className="text-emerald-700">Confirmed Winner</span>
                        ) : inTopZone ? (
                          <span className="text-[#0b141a]">Top {settings.winnerCount} Zone</span>
                        ) : (
                          <span className="text-slate-500">Qualified</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                      No qualified participants match this filter yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>
              Privacy protection active: Email addresses and phone numbers are never displayed on
              public standings. Official winners are confirmed after {settings.endDate}.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
