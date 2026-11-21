import { X, ShieldCheck, Award, Scale } from 'lucide-react';
import type { CampaignSettings } from '../types.ts';

interface RulesModalProps {
  settings: CampaignSettings;
  onClose: () => void;
}

const TIE_BREAKER_COPY: Record<CampaignSettings['tieBreakerRule'], string> = {
  earliest_completion:
    'Earliest verified completion timestamp ranks higher among players tied on goals scored.',
  highest_accuracy_score:
    'Higher cumulative corner-accuracy score across all five shots ranks higher among tied players.',
  verified_random_draw:
    'Deterministic audited random draw order applied across tied qualifiers after campaign close.',
};

const POLICY_COPY: Record<CampaignSettings['participationPolicy'], string> = {
  one_per_phone: 'One official eligible entry per verified phone number per campaign.',
  one_per_email: 'One official eligible entry per email address per campaign.',
  unlimited: 'Multiple entries permitted during testing mode.',
};

export function RulesModal({ settings, onClose }: RulesModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#061018]/75 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-6 text-[#0b141a] shadow-2xl sm:rounded-3xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-medium text-slate-500">Official Giveaway Terms</p>
            <h2
              id="rules-modal-title"
              className="mt-0.5 font-[var(--font-display)] text-3xl font-extrabold uppercase tracking-tight text-[#0b141a]"
            >
              Rules & Eligibility
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rules"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-6 text-sm leading-relaxed text-slate-700">
          {/* Qualification */}
          <div className="rounded-2xl bg-[#f4f6f5] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Award className="h-4 w-4 text-slate-700" />
              <span>Qualification Threshold</span>
            </div>
            <p className="mt-1.5 font-mono text-sm font-semibold text-[#0b141a] tabular-nums">
              {settings.qualificationThreshold} / {settings.totalAttempts} goals or higher
            </p>
          </div>

          {/* Fairness & Participation Policy */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0b141a]">
              <Scale className="h-4 w-4 text-slate-700" />
              <span>Ranking, Tie-Breaking & Fairness</span>
            </h3>
            <ul className="mt-2.5 space-y-2 text-slate-600">
              <li>
                <strong className="text-[#0b141a]">Qualification:</strong> Scoring{' '}
                {settings.qualificationThreshold}/{settings.totalAttempts} or higher qualifies your
                entry for the giveaway ranking. Qualification confers eligibility for winner
                selection and is not a guaranteed prize.
              </li>
              <li>
                <strong className="text-[#0b141a]">Ranking & Tie-Breaker:</strong> Eligible
                participants are ranked by goals scored (highest first).{' '}
                {TIE_BREAKER_COPY[settings.tieBreakerRule]}
              </li>
              <li>
                <strong className="text-[#0b141a]">Equal Team Odds:</strong> Selecting Team iPhone
                or Team Android changes the goalkeeper jersey appearance only. Physics, goalkeeper
                speed, and qualification rules are strictly identical for both teams.
              </li>
              <li>
                <strong className="text-[#0b141a]">Entry Limit:</strong>{' '}
                {POLICY_COPY[settings.participationPolicy]}
              </li>
              <li>
                <strong className="text-[#0b141a]">Winner Confirmation:</strong> Top{' '}
                {settings.winnerCount} proposed winners remain provisional until verified and
                explicitly confirmed after the campaign closes.
              </li>
            </ul>
          </div>

          {/* Prize Schedule */}
          <div>
            <h3 className="text-sm font-bold text-[#0b141a]">
              Prize Schedule ({settings.winnerCount} Winners Total)
            </h3>
            <p className="mt-1 text-xs text-slate-500">{settings.prizeNote}</p>
            <div className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200">
              {settings.prizes.map((prize) => (
                <div key={prize.id} className="flex items-start justify-between gap-4 p-3.5">
                  <div>
                    <div className="text-xs font-medium text-slate-500">{prize.tier}</div>
                    <div className="font-semibold text-[#0b141a]">{prize.title}</div>
                    <div className="text-xs text-slate-600">{prize.description}</div>
                  </div>
                  <div className="font-mono text-xs font-semibold text-slate-700 tabular-nums shrink-0">
                    ×{prize.quantity}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Privacy Notice */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0b141a]">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <span>Privacy & Server Verification</span>
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              {settings.privacySummary} Every penalty shot is evaluated on the server to protect
              campaign integrity.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl bg-[#090d11] px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
