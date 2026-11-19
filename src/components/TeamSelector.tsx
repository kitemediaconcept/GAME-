import { useState } from 'react';
import { Scale, Check, ArrowRight } from 'lucide-react';
import type { ParticipantSessionState, TeamId } from '../types.ts';
import { selectSessionTeam } from '../lib/api.ts';

interface TeamSelectorProps {
  session: ParticipantSessionState;
  onTeamConfirmed: (updatedSession: ParticipantSessionState) => void;
}

function JerseyGraphic({ team }: { team: TeamId }) {
  const isIphone = team === 'iphone';
  return (
    <svg viewBox="0 0 140 130" className="h-28 w-28" aria-hidden="true">
      {/* Sleeves & Torso */}
      <path
        d="M44 16 L20 34 L30 60 L44 52 L44 118 L96 118 L96 52 L110 60 L120 34 L96 16 L84 24 C78 29 62 29 56 24 Z"
        fill={isIphone ? '#1b222c' : '#0f5d38'}
        stroke={isIphone ? '#94a3b8' : '#d9ff70'}
        strokeWidth="2.5"
      />
      {/* Chest stripe */}
      <rect
        x="45"
        y="52"
        width="50"
        height="22"
        fill={isIphone ? '#2d3748' : '#092e1d'}
      />
      <rect x="45" y="51" width="50" height="2.5" fill={isIphone ? '#38bdf8' : '#d9ff70'} />
      <rect x="45" y="73" width="50" height="2.5" fill={isIphone ? '#38bdf8' : '#d9ff70'} />

      {/* Emblem */}
      {isIphone ? (
        <rect
          x="64"
          y="33"
          width="12"
          height="16"
          rx="2.5"
          fill="none"
          stroke="#f8fafc"
          strokeWidth="1.8"
        />
      ) : (
        <g>
          <path d="M62 47 A8 8 0 0 1 78 47 Z" fill="#d9ff70" />
          <line x1="65" y1="40" x2="62" y2="35" stroke="#d9ff70" strokeWidth="1.8" />
          <line x1="75" y1="40" x2="78" y2="35" stroke="#d9ff70" strokeWidth="1.8" />
        </g>
      )}

      {/* Text */}
      <text
        x="70"
        y="66"
        textAnchor="middle"
        fill="#ffffff"
        fontSize="10"
        fontWeight="800"
        fontFamily="Barlow Condensed, sans-serif"
      >
        {isIphone ? 'iPHONE' : 'ANDROID'}
      </text>
      <text
        x="70"
        y="102"
        textAnchor="middle"
        fill={isIphone ? '#e2e8f0' : '#d9ff70'}
        fontSize="24"
        fontWeight="800"
        fontFamily="Barlow Condensed, sans-serif"
      >
        01
      </text>
    </svg>
  );
}

export function TeamSelector({ session, onTeamConfirmed }: TeamSelectorProps) {
  const [selected, setSelected] = useState<TeamId>('iphone');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await selectSessionTeam(session.id, session.sessionToken, selected);
      onTeamConfirmed(res.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to lock team selection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6">
      <div className="overflow-hidden rounded-[28px] bg-white border border-slate-200/90 shadow-sm">
        <div className="bg-[#081722] px-6 py-6 text-white sm:px-8">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-[#d9ff70]">Step 2 of 2 · Choose Your Side</span>
            <span className="font-mono text-slate-300">{session.entryNumber}</span>
          </div>
          <h1 className="mt-1 font-[var(--font-display)] text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">
            iPhone vs Android
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">
            Welcome, {session.name}. Pick your team to dress the stadium goalkeeper in your chosen kit.
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {error && (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
              {error}
            </div>
          )}

          {/* Reference-inspired clean selection tiles with electric lime active highlight */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(
              [
                {
                  id: 'iphone' as TeamId,
                  name: 'Team iPhone',
                  kitDesc: 'Titanium Slate & Sky Trim Goalkeeper Kit',
                },
                {
                  id: 'android' as TeamId,
                  name: 'Team Android',
                  kitDesc: 'Botanical Emerald & Acid-Lime Goalkeeper Kit',
                },
              ] as const
            ).map((item) => {
              const active = selected === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item.id)}
                  className={`relative flex flex-col items-center rounded-3xl border-2 p-6 text-center transition-all ${
                    active
                      ? 'border-[#0b141a] bg-[#d9ff70] text-[#0b141a]'
                      : 'border-slate-200 bg-[#f4f6f5] text-[#0b141a] hover:border-slate-300'
                  }`}
                >
                  {active && (
                    <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-[#0b141a] text-[#d9ff70]">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <JerseyGraphic team={item.id} />
                  <h2 className="mt-3 font-[var(--font-display)] text-2xl font-extrabold uppercase tracking-tight">
                    {item.name}
                  </h2>
                  <p className="mt-1 text-xs text-slate-700">{item.kitDesc}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-[#f4f6f5] p-4 text-xs leading-relaxed text-slate-600">
            <Scale className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />
            <span>
              <strong className="text-[#0b141a]">Equal Fair Play:</strong> Both teams share
              identical physics, goalkeeper speed, and qualification odds. Your selection only
              customizes the goalkeeper jersey and team scoreboard.
            </span>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="mt-6 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[#090d11] px-6 py-4 text-sm font-bold tracking-wide text-white uppercase hover:bg-slate-800 disabled:opacity-60 transition-colors"
          >
            <span>
              {submitting
                ? 'Entering Stadium...'
                : `Start 5 Penalties as ${selected === 'iphone' ? 'Team iPhone' : 'Team Android'}`}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
