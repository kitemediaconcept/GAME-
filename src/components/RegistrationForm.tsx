import { useState, type FormEvent } from 'react';
import { ArrowLeft, ShieldCheck, AlertCircle } from 'lucide-react';
import type { CampaignSettings, ParticipantSessionState } from '../types.ts';
import { registerParticipant } from '../lib/api.ts';

interface RegistrationFormProps {
  settings: CampaignSettings;
  prefill?: { name: string; email: string; phone: string } | null;
  onSuccess: (
    session: ParticipantSessionState,
    details: { name: string; email: string; phone: string }
  ) => void;
  onOpenRules: () => void;
  onPracticeInstead: () => void;
  onBack: () => void;
}

export function RegistrationForm({
  settings,
  prefill,
  onSuccess,
  onOpenRules,
  onPracticeInstead,
  onBack,
}: RegistrationFormProps) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');
  const [phone, setPhone] = useState(prefill?.phone ?? '');
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyEntered, setAlreadyEntered] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setAlreadyEntered(false);

    if (!acceptedRules) {
      setError('Please accept the campaign rules and privacy notice to continue.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await registerParticipant({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        acceptedRules,
        marketingOptIn,
      });
      onSuccess(res.session, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
    } catch (err) {
      const eObj = err as Error & { code?: string };
      setError(eObj.message || 'Unable to register right now.');
      if (eObj.code === 'ALREADY_ENTERED') {
        setAlreadyEntered(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-6 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0b141a] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to campaign</span>
      </button>

      <div className="mt-3 overflow-hidden rounded-[28px] bg-white border border-slate-200/90 shadow-sm">
        {/* Floodlit Compact Header Strip */}
        <div className="bg-[#081722] px-6 py-6 text-white sm:px-8">
          <p className="text-xs font-medium text-[#d9ff70]">Step 1 of 2 · Player Registration</p>
          <h1 className="mt-1 font-[var(--font-display)] text-3xl font-extrabold uppercase tracking-tight">
            Enter the Penalty Shootout
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">
            Enter your details to register your official 5-kick entry. Browser autofill is supported.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6 sm:p-8" noValidate>
          {prefill && (
            <div className="rounded-xl bg-[#f4f6f5] px-4 py-3 text-xs text-slate-600">
              Your previous details have been prefilled for review. Confirm or update them below before continuing.
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <div>
                  <p className="font-medium">{error}</p>
                  {alreadyEntered && (
                    <button
                      type="button"
                      onClick={onPracticeInstead}
                      className="mt-2.5 inline-flex min-h-[40px] items-center rounded-xl bg-[#090d11] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
                    >
                      Play Practice Mode Instead
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="player-name" className="block text-xs font-semibold text-slate-700">
              Full Name
            </label>
            <input
              id="player-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Arjun Menon"
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-[#f8faf9] px-4 text-sm text-[#0b141a] placeholder:text-slate-400 focus:border-[#0b141a] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="player-email" className="block text-xs font-semibold text-slate-700">
              Email Address
            </label>
            <input
              id="player-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-[#f8faf9] px-4 text-sm text-[#0b141a] placeholder:text-slate-400 focus:border-[#0b141a] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="player-phone" className="block text-xs font-semibold text-slate-700">
              Phone Number
            </label>
            <input
              id="player-phone"
              name="tel"
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-[#f8faf9] px-4 text-sm text-[#0b141a] placeholder:text-slate-400 focus:border-[#0b141a] focus:bg-white focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Used for winner verification and one-entry-per-phone eligibility. Never shown publicly.
            </p>
          </div>

          {/* Required Rules & Privacy Acceptance */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={acceptedRules}
                onChange={(e) => setAcceptedRules(e.target.checked)}
                required
                className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#0b141a]"
              />
              <span className="text-xs leading-relaxed text-slate-700">
                <strong className="text-[#0b141a]">Required:</strong> I accept the{' '}
                <button
                  type="button"
                  onClick={onOpenRules}
                  className="font-semibold text-[#0b141a] underline underline-offset-2"
                >
                  Campaign Rules & Privacy Notice
                </button>{' '}
                and understand that scoring {settings.qualificationThreshold}/{settings.totalAttempts}+
                qualifies me for ranking rather than guaranteeing a prize.
              </span>
            </label>

            {/* Separate Optional Marketing Opt-In */}
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#0b141a]"
              />
              <span className="text-xs leading-relaxed text-slate-500">
                <strong className="text-slate-700">Optional:</strong> Send me future giveaway
                announcements and product offers by email or SMS.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#090d11] px-6 py-3.5 text-sm font-bold tracking-wide text-white uppercase hover:bg-slate-800 disabled:opacity-60 transition-colors"
          >
            {submitting ? 'Registering Entry...' : 'Continue to Team Selection'}
          </button>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            <span>Your email and phone number are strictly hidden from public leaderboards.</span>
          </div>
        </form>
      </div>
    </div>
  );
}
