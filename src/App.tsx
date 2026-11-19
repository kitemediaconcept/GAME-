import { useCallback, useEffect, useState } from 'react';
import type {
  ParticipantSessionState,
  PublicCampaignPayload,
  TeamId,
} from './types.ts';
import { fetchPublicCampaign } from './lib/api.ts';
import { CampaignHome } from './components/CampaignHome.tsx';
import { RegistrationForm } from './components/RegistrationForm.tsx';
import { TeamSelector } from './components/TeamSelector.tsx';
import { PenaltyGame3D } from './components/PenaltyGame3D.tsx';
import { ResultsScreen } from './components/ResultsScreen.tsx';
import { LeaderboardPage } from './components/LeaderboardPage.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { RulesModal } from './components/RulesModal.tsx';

type Screen =
  | 'home'
  | 'register'
  | 'team'
  | 'play_campaign'
  | 'play_practice'
  | 'results'
  | 'leaderboard'
  | 'admin';

const PREFILL_KEY = 'iva_player_prefill';

function isAdminPath(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname.replace(/\/+$/, '');
  return p === '/admin' || window.location.hash === '#/admin';
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => (isAdminPath() ? 'admin' : 'home'));
  const [campaign, setCampaign] = useState<PublicCampaignPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  const [session, setSession] = useState<ParticipantSessionState | null>(null);
  const [practiceTeam, setPracticeTeam] = useState<TeamId>('iphone');
  const [savedPrefill, setSavedPrefill] = useState<{
    name: string;
    email: string;
    phone: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem(PREFILL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const refreshCampaign = useCallback(async () => {
    try {
      const data = await fetchPublicCampaign();
      setCampaign(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load campaign.');
    }
  }, []);

  useEffect(() => {
    refreshCampaign();
  }, [refreshCampaign]);

  useEffect(() => {
    const syncRoute = () => {
      if (isAdminPath()) {
        setScreen('admin');
      } else {
        setScreen((prev) => (prev === 'admin' ? 'home' : prev));
      }
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const exitAdminToPublic = useCallback(() => {
    try {
      if (window.location.pathname !== '/' || window.location.hash) {
        window.history.pushState({}, '', '/');
      }
    } catch {
      // Ignore history restrictions
    }
    refreshCampaign();
    setScreen('home');
  }, [refreshCampaign]);

  const isInArena = screen === 'play_campaign' || screen === 'play_practice';
  const isAdminScreen = screen === 'admin';

  if (isAdminScreen) {
    return (
      <div className="min-h-[100dvh] bg-[#f4f6f5] text-[#0b141a]">
        <AdminDashboard
          onExit={exitAdminToPublic}
          onCampaignMutated={refreshCampaign}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f4f6f5] text-[#0b141a]">
      {/* Strict 3-Zone Top Navigation Bar (hidden inside full-viewport 3D arena) */}
      {!isInArena && (
        <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
            {/* Zone 1: Single-line Brand Wordmark */}
            <button
              type="button"
              onClick={() => setScreen('home')}
              className="font-[var(--font-display)] text-2xl font-extrabold uppercase tracking-tight text-[#0b141a] whitespace-nowrap shrink-0"
            >
              iPhone vs Android
            </button>

            {/* Zone 2: 4 Concise Single-Line Nav Links */}
            <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
              <button
                type="button"
                onClick={() => setScreen('home')}
                className={`hover:text-[#0b141a] transition-colors whitespace-nowrap shrink-0 ${
                  screen === 'home' ? 'text-[#0b141a] font-semibold' : ''
                }`}
              >
                Campaign
              </button>
              <button
                type="button"
                onClick={() => {
                  if (session && session.status !== 'completed') {
                    setScreen(session.team ? 'play_campaign' : 'team');
                  } else {
                    setScreen('register');
                  }
                }}
                className={`hover:text-[#0b141a] transition-colors whitespace-nowrap shrink-0 ${
                  screen === 'register' || screen === 'team' ? 'text-[#0b141a] font-semibold' : ''
                }`}
              >
                Play Shootout
              </button>
              <button
                type="button"
                onClick={() => {
                  refreshCampaign();
                  setScreen('leaderboard');
                }}
                className={`hover:text-[#0b141a] transition-colors whitespace-nowrap shrink-0 ${
                  screen === 'leaderboard' ? 'text-[#0b141a] font-semibold' : ''
                }`}
              >
                Leaderboard
              </button>
              <button
                type="button"
                onClick={() => setShowRules(true)}
                className="hover:text-[#0b141a] transition-colors whitespace-nowrap shrink-0"
              >
                Rules
              </button>
            </nav>

            {/* Zone 3: Single Primary Player Action (Admin lives exclusively at /admin) */}
            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (session && session.status !== 'completed') {
                    setScreen(session.team ? 'play_campaign' : 'team');
                  } else {
                    setScreen('register');
                  }
                }}
                className="min-h-[40px] rounded-xl bg-[#090d11] px-4 py-2 text-xs font-bold tracking-wide text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Play Game
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Loading & Error Handling */}
      {!campaign && !loadError && (
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="h-[420px] animate-pulse rounded-[28px] bg-slate-200/80" />
        </div>
      )}

      {loadError && !campaign && (
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <p className="text-sm font-medium text-rose-700">{loadError}</p>
          <button
            type="button"
            onClick={refreshCampaign}
            className="mt-4 rounded-xl bg-[#090d11] px-5 py-2.5 text-xs font-bold text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Active Screens */}
      {campaign && (
        <>
          {screen === 'home' && (
            <CampaignHome
              campaign={campaign}
              onPlayGame={() => {
                if (session && session.status !== 'completed') {
                  setScreen(session.team ? 'play_campaign' : 'team');
                } else {
                  setScreen('register');
                }
              }}
              onPracticePitch={(t) => {
                setPracticeTeam(t);
                setScreen('play_practice');
              }}
              onOpenRules={() => setShowRules(true)}
              onViewLeaderboard={() => {
                refreshCampaign();
                setScreen('leaderboard');
              }}
            />
          )}

          {screen === 'register' && (
            <RegistrationForm
              settings={campaign.settings}
              prefill={savedPrefill}
              onBack={() => setScreen('home')}
              onOpenRules={() => setShowRules(true)}
              onPracticeInstead={() => setScreen('play_practice')}
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
              totalAttempts={campaign.settings.totalAttempts}
              session={session}
              onSessionUpdate={(updated) => setSession(updated)}
              onCampaignComplete={(finalSession) => {
                setSession(finalSession);
                refreshCampaign();
                setScreen('results');
              }}
              onExit={() => {
                refreshCampaign();
                setScreen('home');
              }}
            />
          )}

          {screen === 'play_practice' && (
            <PenaltyGame3D
              mode="practice"
              team={practiceTeam}
              onTeamChangePractice={(t) => setPracticeTeam(t)}
              onExit={() => setScreen('home')}
            />
          )}

          {screen === 'results' && session && (
            <ResultsScreen
              session={session}
              settings={campaign.settings}
              onViewLeaderboard={() => {
                refreshCampaign();
                setScreen('leaderboard');
              }}
              onPracticeMode={(t) => {
                setPracticeTeam(t);
                setScreen('play_practice');
              }}
              onOpenRules={() => setShowRules(true)}
              onBackHome={() => {
                refreshCampaign();
                setScreen('home');
              }}
            />
          )}

          {screen === 'leaderboard' && (
            <LeaderboardPage
              campaign={campaign}
              onBack={() => setScreen('home')}
              onPlayGame={() => {
                if (session && session.status !== 'completed') {
                  setScreen(session.team ? 'play_campaign' : 'team');
                } else {
                  setScreen('register');
                }
              }}
              onOpenRules={() => setShowRules(true)}
            />
          )}

          {showRules && (
            <RulesModal settings={campaign.settings} onClose={() => setShowRules(false)} />
          )}
        </>
      )}
    </div>
  );
}
