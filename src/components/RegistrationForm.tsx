import { useState, type FormEvent } from 'react';
import { ArrowLeft, ShieldCheck, AlertCircle, Phone, User as UserIcon } from 'lucide-react';
import type { CampaignSettings, ParticipantSessionState } from '../types.ts';
import { registerParticipantFirestore } from '../lib/firestoreCampaign.ts';

interface RegistrationFormProps {
  settings: CampaignSettings;
  prefill?: { name: string; phone: string } | null;
  existingSession?: ParticipantSessionState | null;
  onSuccess: (
    session: ParticipantSessionState,
    details: { name: string; phone: string }
  ) => void;
  onOpenRules: () => void;
  onBack: () => void;
}

export function RegistrationForm({
  settings,
  prefill,
  existingSession,
  onSuccess,
  onOpenRules,
  onBack,
}: RegistrationFormProps) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [phone, setPhone] = useState(prefill?.phone ?? '');
  const [acceptedRules, setAcceptedRules] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!acceptedRules) {
      setError('Please accept the campaign rules and privacy notice to continue.');
      return;
    }

    setSubmitting(true);
    try {
      const session = await registerParticipantFirestore(
        {
          name: name.trim(),
          phone: phone.trim(),
          acceptedRules,
        },
        existingSession
      );
      onSuccess(session, {
        name: name.trim(),
        phone: phone.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start shootout right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-5 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0b141a] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back</span>
      </button>

      <div className="mt-2 overflow-hidden rounded-[28px] bg-white border border-slate-200/90 shadow-sm">
        <div className="bg-[#081722] px-6 py-6 text-white sm:px-8">
          <p className="text-xs font-medium text-[#d9ff70]">Step 1 of 2 · Giveaway Shootout</p>
          <h1 className="mt-1 font-[var(--font-display)] text-3xl font-extrabold uppercase tracking-tight">
            Enter Name & Phone Number
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">
            Enter your Name and Phone Number to open the 5-kick penalty shootout immediately.
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {error && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <p className="font-medium">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="player-name" className="block text-xs font-semibold text-slate-700">
                Full Name
              </label>
              <div className="relative mt-1.5">
                <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="player-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-[#f8faf9] pl-10 pr-4 text-sm text-[#0b141a] placeholder:text-slate-400 focus:border-[#0b141a] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="player-phone" className="block text-xs font-semibold text-slate-700">
                Phone Number
              </label>
              <div className="relative mt-1.5">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="player-phone"
                  name="tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-[#f8faf9] pl-10 pr-4 font-mono text-sm text-[#0b141a] placeholder:font-sans placeholder:text-slate-400 focus:border-[#0b141a] focus:bg-white focus:outline-none"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Used only to contact giveaway winners. Never shown publicly.
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
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
                  and understand that scoring {settings.qualificationThreshold}/
                  {settings.totalAttempts}+ qualifies me for the giveaway draw.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-[#d9ff70] px-6 py-3.5 text-sm font-extrabold tracking-wide text-[#081722] uppercase hover:bg-[#e4ff96] disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Opening Shootout...' : 'Enter & Start Penalty Shootout'}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
              <span>Only your Name & Phone Number are saved privately for the giveaway.</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
