import { CheckCircle2, XCircle, FileText, Home } from 'lucide-react';
import type { CampaignSettings, ParticipantSessionState } from '../types.ts';

interface ResultsScreenProps {
  session: ParticipantSessionState;
  settings: CampaignSettings;
  onOpenRules: () => void;
  onBackHome: () => void;
}

export function ResultsScreen({
  session,
  settings,
  onOpenRules,
  onBackHome,
}: ResultsScreenProps) {
  const qualified = session.qualified;
  const teamLabel = session.team === 'android' ? 'Team Android' : 'Team iPhone';

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-5 sm:px-6">
      <div className="overflow-hidden rounded-[28px] bg-white border border-slate-200/90 shadow-sm">
        <div
          className={`px-6 py-8 text-center sm:px-8 ${
            qualified ? 'bg-[#081722] text-white' : 'bg-[#1a1f24] text-white'
          }`}
        >
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
            {qualified ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-[#d9ff70]" />
                <span className="text-[#d9ff70]">Qualified for Giveaway Draw</span>
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

        <div className="p-6 sm:p-8 space-y-5">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Official 5-Kick Record</span>
              <span>Entry Recorded</span>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {Array.from({ length: settings.totalAttempts }).map((_, idx) => {
                const shot = session.attempts[idx];
                const outcome = shot?.outcome ?? 'MISS';
                return (
                  <div
                    key={idx}
                    className={`rounded-2xl p-2.5 text-center border ${
                      outcome === 'GOAL'
                        ? 'border-[#0b141a]/20 bg-[#d9ff70] text-[#0b141a]'
                        : outcome === 'SAVE'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-rose-200 bg-rose-50 text-rose-900'
                    }`}
                  >
                    <div className="font-mono text-[10px] font-semibold opacity-70">K{idx + 1}</div>
                    <div className="mt-1 font-[var(--font-display)] text-base font-extrabold uppercase">
                      {outcome}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-[#f4f6f5] p-4">
            <div className="text-xs font-medium text-slate-500">Giveaway Status</div>
            <div className="mt-1 text-base font-bold text-[#0b141a]">
              {qualified
                ? 'Your entry is confirmed for the official giveaway draw!'
                : `Score ${settings.qualificationThreshold}/${settings.totalAttempts}+ goals to qualify`}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {qualified
                ? 'Winners will be selected and contacted via phone once the giveaway closes.'
                : 'Your official attempt has been recorded. Thank you for participating!'}
            </p>
          </div>

          <button
            type="button"
            onClick={onBackHome}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#090d11] px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
          >
            <Home className="h-4 w-4 text-[#d9ff70]" />
            <span>Back to Home</span>
          </button>

          <div className="flex items-center justify-end border-t border-slate-100 pt-4 text-xs text-slate-500">
            <button
              type="button"
              onClick={onOpenRules}
              className="inline-flex items-center gap-1 font-semibold text-[#0b141a] underline underline-offset-2"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Campaign Rules</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
