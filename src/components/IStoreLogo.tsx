import { useEffect, useState } from 'react';

interface IStoreLogoProps {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  logoImageUrl?: string;
}

/**
 * Branded iStore mark (supports swapping in an official PNG/SVG logo via logoImageUrl anytime).
 */
export function IStoreLogo({
  variant = 'dark',
  size = 'md',
  logoImageUrl,
}: IStoreLogoProps) {
  const isLight = variant === 'light';
  const iconBox =
    size === 'lg'
      ? 'h-14 w-14 rounded-2xl'
      : size === 'sm'
        ? 'h-7 w-7 rounded-lg'
        : 'h-9 w-9 rounded-xl';
  const textSize =
    size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-base' : 'text-xl';

  if (logoImageUrl) {
    return (
      <img
        src={logoImageUrl}
        alt="iStore"
        className={size === 'lg' ? 'h-14 w-auto object-contain' : 'h-8 w-auto object-contain'}
      />
    );
  }

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <div
        className={`flex items-center justify-center border ${iconBox} ${
          isLight
            ? 'border-white/20 bg-white/10 text-[#d9ff70]'
            : 'border-slate-900/15 bg-[#081722] text-[#d9ff70]'
        }`}
      >
        <svg
          viewBox="0 0 32 32"
          className={size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'}
          fill="none"
          aria-hidden="true"
        >
          {/* Minimalist smartphone silhouette + dynamic lime signal dot */}
          <rect
            x="9"
            y="4"
            width="14"
            height="24"
            rx="3.5"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <circle cx="16" cy="9.5" r="1.5" fill="currentColor" />
          <path
            d="M16 13.5V21"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <line
            x1="13.5"
            y1="24.2"
            x2="18.5"
            y2="24.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex flex-col leading-none">
        <span
          className={`font-[var(--font-sans)] font-bold tracking-tight ${textSize} ${
            isLight ? 'text-white' : 'text-[#081722]'
          }`}
        >
          <span className={isLight ? 'text-[#d9ff70]' : 'text-[#081722]'}>i</span>Store
        </span>
        {size === 'lg' && (
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">
            Digital · Official Giveaway
          </span>
        )}
      </div>
    </div>
  );
}

interface SplashIntroProps {
  onComplete: () => void;
}

export function IStoreSplash({ onComplete }: SplashIntroProps) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setFading(true), 1250);
    const doneTimer = window.setTimeout(() => onComplete(), 1650);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      onClick={onComplete}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onComplete();
      }}
      aria-label="iStore Penalty Shootout Intro"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#081722] px-6 text-center text-white transition-opacity duration-400 cursor-pointer ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center">
        <IStoreLogo variant="light" size="lg" />

        <div className="mt-7 h-0.5 w-24 overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-full origin-left bg-[#d9ff70] animate-[pulse_1.1s_ease-in-out_infinite]" />
        </div>

        <p className="mt-5 font-[var(--font-display)] text-lg font-bold uppercase tracking-[0.18em] text-slate-200">
          iPhone vs Android
        </p>
        <p className="mt-1 text-xs font-medium text-slate-400">
          Penalty Shootout Giveaway
        </p>
      </div>
    </div>
  );
}
