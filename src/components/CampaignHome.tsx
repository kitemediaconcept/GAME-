import { useState } from 'react';
import { Play, FileText } from 'lucide-react';
import type { CampaignSettings } from '../types.ts';
import { ASSETS } from '../lib/assets.ts';

interface CampaignHomeProps {
  settings: CampaignSettings;
  onPlayGame: () => void;
  onOpenRules: () => void;
}

export function CampaignHome({
  settings,
  onPlayGame,
  onOpenRules,
}: CampaignHomeProps) {
  const [bannerFailed, setBannerFailed] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      {/* ─── MOBILE-FIRST PENALTY SHOOTOUT HERO ─── */}
      <section className="overflow-hidden rounded-[28px] bg-[#081722] text-white shadow-sm">
        <div className="grid grid-cols-1 items-stretch lg:grid-cols-12">
          {/* Stadium Visual Banner */}
          <div className="relative min-h-[240px] sm:min-h-[320px] lg:col-span-7 lg:min-h-[430px]">
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

          {/* Mobile-Friendly Action Stack */}
          <div className="flex flex-col justify-center p-6 sm:p-8 lg:col-span-5 lg:p-10">
            <p className="text-xs font-medium text-[#d9ff70]">
              {settings.title} · Penalty Shootout Giveaway
            </p>

            <h1 className="mt-2 font-[var(--font-display)] text-4xl font-extrabold uppercase leading-[0.98] tracking-tight text-white [text-wrap:balance] sm:text-5xl">
              {settings.headline}
            </h1>

            <p className="mt-3.5 max-w-md text-sm leading-relaxed text-slate-300 sm:text-base">
              {settings.subheadline}
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={onPlayGame}
                className="flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[#d9ff70] px-6 py-3.5 text-sm font-extrabold tracking-wide text-[#091318] uppercase hover:bg-[#e4ff96] active:scale-[0.99] transition-all whitespace-nowrap"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Play Giveaway Shootout</span>
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-slate-300">
              <button
                type="button"
                onClick={onOpenRules}
                className="inline-flex items-center gap-1.5 font-semibold text-white underline decoration-[#d9ff70]/70 underline-offset-4 hover:text-[#d9ff70] transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Rules & Eligibility</span>
              </button>
              <span className="font-mono text-slate-400 tabular-nums">
                Score {settings.qualificationThreshold}/{settings.totalAttempts}+ to qualify
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
