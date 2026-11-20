import { useCallback, useEffect, useState } from 'react';
import type { CampaignSettings, ParticipantSessionState } from './types.ts';
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  fetchCampaignSettingsFirestore,
} from './lib/firestoreCampaign.ts';
import { detectAppRoute, getAppBasePath } from './lib/routing.ts';
import { CampaignHome } from './components/CampaignHome.tsx';
import { RegistrationForm } from './components/RegistrationForm.tsx';
import { TeamSelector } from './components/TeamSelector.tsx';
import { PenaltyGame3D } from './components/PenaltyGame3D.tsx';
import { ResultsScreen } from './components/ResultsScreen.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { QrSharePage } from './components/QrSharePage.tsx';
import { RulesModal } from './components/RulesModal.tsx';
import { IStoreLogo, IStoreSplash } from './components/IStoreLogo.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

type Screen =
  | 'home'
  | 'register'
  | 'team'
  | 'play_campaign'
  | 'results'
  | 'admin'
  | 'qr';

const PREFILL_KEY = 'iva_player_prefill_v2';
const SESSION_KEY = 'iva_active_session_v2';
const SPLASH_SEEN_KEY = 'istore_splash_seen';

function loadSavedSession(): ParticipantSessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ParticipantSessionState;
    if (parsed && typeof parsed.id === 'string' && parsed.id.startsWith('p_')) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveSessionLocal(next: ParticipantSessionState | null) {
  try {
    if (next) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function AppContent() {
  const [screen, setScreen] = useState<Screen>(() => detectAppRoute());
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_CAMPAIGN_SETTINGS);
  const [showRules, setShowRules] = useState(false);

  const [showSplash, setShowSplash] = useState<boolean>(() => {
    const initialRoute = detectAppRoute();
    if (initialRoute === 'admin' || initialRoute === 'qr') return false;
    try {
      return !sessionStorage.getItem(SPLASH_SEEN_KEY);
    } catch {
      return true;
    }
  });

  const [session, setSessionState] = useState<ParticipantSessionState | null>(loadSavedSession);
  const [savedPrefill, setSavedPrefill] = useState<{
    name: string;
    phone: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem(PREFILL_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        name: String(parsed?.name || ''),
        phone: String(parsed?.phone || ''),
      };
    } catch {
      return null;
    }
  });

  const setSession = useCallback((next: ParticipantSessionState | null) => {
    setSessionState(next);
    saveSessionLocal(next);
  }, []);

  const dismissSplash = useCallback(() => {
    setShowSplash(false);
    try {
      sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
    } catch {
      // Ignore storage errors
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    const cfg = await fetchCampaignSettingsFirestore();
    setSettings(cfg);
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    const syncRoute = () => {
      const next = detectAppRoute();
      if (next === 'admin' || next === 'qr') {
        setScreen(next);
      } else {
        setScreen((prev) => (prev === 'admin' || prev === 'qr' ? 'home' : prev));
      }
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  // 1. Standalone Admin-Only Route (/admin or /game/admin) — zero public nav, zero leakage
  if (screen === 'admin') {
    return <AdminDashboard onCampaignMutated={refreshSettings} />;
  }

  // 2. Standalone Shareable QR Poster Page (/qr or /game/qr)
  if (screen === 'qr') {
    return (
      <QrSharePage
        onOpenGame={() => {
          try {
            const base = getAppBasePath();
            window.history.pushState({}, '', base || '/');
          } catch {
            // Ignore
          }
          setScreen('home');
        }}
      />
    );
  }

  const isInArena = screen === 'play_campaign';

  const handleStartPlay = () => {
    if (session && session.status !== 'completed') {
      setScreen(session.team ? 'play_campaign' : 'team');
    } else {
      setScreen('register');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f4f6f5] text-[#0b141a]">
      {/* Opening iStore Branded Splash Screen */}
      {showSplash && <IStoreSplash onComplete={dismissSplash} />}

      {/* Clean Mobile-Friendly Player Header with iStore Logo (NO Admin, NO Dashboard) */}
      {!isInArena && (
        <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex h-15 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setScreen('home')}
              className="flex items-center gap-2.5 shrink-0"
            >
              <IStoreLogo variant="dark" size="sm" />
              <span className="h-5 w-px bg-slate-200" aria-hidden="true" />
              <span className="font-[var(--font-display)] text-lg font-extrabold uppercase tracking-tight text-[#0b141a] whitespace-nowrap sm:text-xl">
                iPhone vs Android
              </span>
            </button>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowRules(true)}
                className="text-xs font-semibold text-slate-600 hover:text-[#0b141a] whitespace-nowrap"
              >
                Rules
              </button>
              <button
                type="button"
                onClick={handleStartPlay}
                className="min-h-[40px] rounded-xl bg-[#090d11] px-4 py-2 text-xs font-bold tracking-wide text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Play Game
              </button>
            </div>
          </div>
        </header>
      )}

      {screen === 'home' && (
        <CampaignHome
          settings={settings}
          onPlayGame={handleStartPlay}
          onOpenRules={() => setShowRules(true)}
        />
      )}

      {screen === 'register' && (
        <RegistrationForm
          settings={settings}
          prefill={savedPrefill}
          existingSession={session}
          onBack={() => setScreen('home')}
          onOpenRules={() => setShowRules(true)}
          onSuccess={(newSession, details) => {
            setSession(newSession);
            setSavedPrefill(details);
            try {
              localStorage.setItem(PREFILL_KEY, JSON.stringify(details));
            } catch {
              // Ignore storage quota errors
            }
            if (newSession.status === 'completed') {
              setScreen('results');
            } else if (newSession.team) {
              setScreen('play_campaign');
            } else {
              setScreen('team');
            }
          }}
        />
      )}

      {screen === 'team' && session && (
        <TeamSelector
          session={session}
          onTeamConfirmed={(updated) => {
            setSession(updated);
            setScreen('play_campaign');
          }}
        />
      )}

      {screen === 'play_campaign' && session && session.team && (
        <PenaltyGame3D
          mode="campaign"
          team={session.team}
          totalAttempts={settings.totalAttempts}
          settings={settings}
          session={session}
          onSessionUpdate={(updated) => setSession(updated)}
          onCampaignComplete={(finalSession) => {
            setSession(finalSession);
            setScreen('results');
          }}
          onExit={() => setScreen('home')}
        />
      )}

      {screen === 'results' && session && (
        <ResultsScreen
          session={session}
          settings={settings}
          onOpenRules={() => setShowRules(true)}
          onBackHome={() => setScreen('home')}
        />
      )}

      {showRules && <RulesModal settings={settings} onClose={() => setShowRules(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
