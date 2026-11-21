import { useEffect, useState } from 'react';

const rawBase = import.meta.env.BASE_URL || '/';
const BASE = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export const ISTORE_LOGO_LIGHT_BG = `${BASE}assets/aistudio/istore_logo-01_58027211.png`;
export const ISTORE_LOGO_DARK_BG = `${BASE}assets/aistudio/istore_logo-02_a6f931c6.png`;
export const CAMPAIGN_TITLE_GRAPHIC = `${BASE}assets/aistudio/ISTORE_Teaser_Poster-01.jpg_8f30a178.jpeg`;

interface IStoreLogoProps {
  /** 'dark' = dark/green logo for white backgrounds; 'light' = white logo for dark backgrounds */
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  logoImageUrl?: string;
  className?: string;
}

/**
 * Official ISTORE DIGITAL® logo lockup (light-bg green/charcoal & dark-bg pure white variants).
 */
export function IStoreLogo({
  variant = 'dark',
  size = 'md',
  logoImageUrl,
  className,
}: IStoreLogoProps) {
  const src =
    logoImageUrl ||
    (variant === 'light' ? ISTORE_LOGO_DARK_BG : ISTORE_LOGO_LIGHT_BG);

  const heightClass =
    size === 'lg'
      ? 'h-24 sm:h-28'
      : size === 'sm'
        ? 'h-9 sm:h-10'
        : 'h-12';

  return (
    <img
      src={src}
      alt="ISTORE DIGITAL"
      draggable={false}
      className={`${className || heightClass} w-auto object-contain select-none`}
    />
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
      aria-label="ISTORE DIGITAL Penalty Shootout Intro"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#081722] px-6 text-center text-white transition-opacity duration-400 cursor-pointer ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center">
        <IStoreLogo variant="light" size="lg" />

        <div className="mt-5 h-0.5 w-24 overflow-hidden rounded-full bg-white/15">
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
