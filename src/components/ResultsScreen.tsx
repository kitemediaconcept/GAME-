import { CheckCircle2, XCircle, Trophy, RotateCcw, FileText } from 'lucide-react';
import type { CampaignSettings, ParticipantSessionState, TeamId } from '../types.ts';

interface ResultsScreenProps {
  session: ParticipantSessionState;
  settings: CampaignSettings;
  onViewLeaderboard: () => void;
  onPracticeMode: (team: TeamId) => void;
  onOpenRules: () => void;
  onBackHome: () => void;
}

export function ResultsScreen({
  session,
  settings,
  onViewLeaderboard,
  onPracticeMode,
  onOpenRules,
  onBackHome,
}: ResultsScreenProps) {
  const qualified = session.qualified;
  const teamLabel = session.team === 'android' ? 'Team Android' : 'Team iPhone';

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6">
      <div className="overflow-hidden rounded-[28px] bg-white border border-slate-200/90 shadow-sm">
        {/* Result Banner */}
        <div
          className={`px-6 py-8 text-center sm:px-8 ${
            qualified ? 'bg-[#081722] text-white' : 'bg-[#1a1f24] text-white'
          }`}
        >
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
            {qualified ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-[#d9ff70]" />
                <span className="text-[#d9ff70]">Qualified for Giveaway Ranking</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-rose-400" />
                <span className="text-rose-300">Did Not Qualify</span>
              </>
            )}
          </div>

          <h1 className="mt-2 font-[var(--font-display)] text-5xl font-extrabold uppercase tracking-tight sm:text-6xl tabular-nums">
            {session.score} / {settings.totalAttempts} Goals
          </h1>

          <p className="mt-2 text-sm text-slate-300">
            {session.name} · {teamLabel} · <span className="font-mono">{session.entryNumber}</span>
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* 5-Kick Breakdown Strip */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Shot-by-Shot Official Record</span>
              <span>Server Verified</span>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {Array.from({ length: settings.totalAttempts }).map((_, idx) => {
                const shot = session.attempts[idx];
                const outcome = shot?.outcome ?? 'MISS';
                return (
                  <div
                    key={idx}
                    className={`rounded-2xl p-3 text-center border ${
                      outcome === 'GOAL'
                        ? 'border-[#0b141a]/20 bg-[#d9ff70] text-[#0b141a]'
                        : outcome === 'SAVE'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-rose-200 bg-rose-50 text-rose-900'
                    }`}
                  >
                    <div className="font-mono text-[10px] font-semibold opacity-70">KICK {idx + 1}</div>
                    <div className="mt-1 font-[var(--font-display)] text-lg font-extrabold uppercase">
                      {outcome}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Qualification & Provisional Rank Panel */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#f4f6f5] p-4">
              <div className="text-xs font-medium text-slate-500">Qualification Status</div>
              <div className="mt-1 text-base font-bold text-[#0b141a]">
                {qualified ? 'Eligible for Winner Selection' : `Needs ${settings.qualificationThreshold}/${settings.totalAttempts} to Qualify`}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {qualified
                  ? 'Qualification enters you into ranking; it is not a guaranteed prize.'
                  : 'Your official attempt is recorded. Try Practice Mode anytime to sharpen your curve kicks.'}
              </p>
            </div>

            <div className="rounded-2xl bg-[#f4f6f5] p-4">
              <div className="text-xs font-medium text-slate-500">Current Provisional Rank</div>
              <div className="mt-1 font-mono text-2xl font-bold text-[#0b141a] tabular-nums">
                {session.provisionalRank ? `#${session.provisionalRank}` : 'Unranked'}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {session.provisionalRank
                  ? `Among ${session.qualifiedTotal} qualified entries · Top ${settings.winnerCount} reviewed for prizes`
                  : `Ranked entries require at least ${settings.qualificationThreshold} goals.`}
              </p>
            </div>
          </div>

          {/* Official Confirmation Notice */}
          <div className="rounded-2xl border border-slate-200 p-4 text-xs leading-relaxed text-slate-600">
            <strong className="text-[#0b141a]">Important Notice:</strong> All standings are
            provisional while the giveaway is live. Official winners are verified and confirmed by
            the campaign team after the campaign closes on{' '}
            <span className="font-mono font-semibold text-[#0b141a]">{settings.endDate}</span>.
          </div>

          {/* Primary & Secondary Actions */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onViewLeaderboard}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[#090d11] px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
            >
              <Trophy className="h-4 w-4 text-[#d9ff70]" />
              <span>View Provisional Leaderboard</span>
            </button>
            <button
              type="button"
              onClick={() => onPracticeMode(session.team ?? 'iphone')}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-[#0b141a] hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Practice Pitch (Unofficial)</span>
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
            <button
              type="button"
              onClick={onBackHome}
              className="font-medium text-slate-600 hover:text-[#0b141a]"
            >
              Return to Campaign Home
            </button>
            <button
              type="button"
              onClick={onOpenRules}
              className="inline-flex items-center gap-1 font-semibold text-[#0b141a] underline underline-offset-2"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Tie-Break Rules</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
