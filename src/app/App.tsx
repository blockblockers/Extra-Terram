// Extra Terram — src/app/App.tsx v0.9.0 — How to play: from the menu, and once by itself for guests and new players
// Splash -> Login (unless guest, signed in, or an offline build) -> Menu <-> Game, or Menu -> Multiplayer -> Game.
// The game shell is remounted for every run so the canvas, renderer and sim start clean.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CONTENT_VERSION, levels, type LevelEntry } from '../content';
import { ENGINE_VERSION, type LoggedInput, type SimResult, type SimView } from '../engine';
import { invalidateLeaderboard, recordRun, useAuth, useInvites, type ActiveMatch, type SaveOutcome } from '../net';
import { LoginScreen, NewPasswordScreen } from '../ui/LoginScreen';
import { HowToPlay, markHowToSeen, shouldAutoOpenHowTo } from '../ui/HowToPlay';
import { Menu } from '../ui/Menu';
import { MultiplayerScreen, type MatchRun } from '../ui/MultiplayerScreen';
import { Splash } from '../ui/Title';
import { GameShell } from './GameShell';
import { loadSettings, saveSettings, randomSeed, type Settings } from './settings';

interface Run {
  level: LevelEntry;
  raceId: string;
  seed: string;
  nonce: number; // bumps to remount the shell for "play again" with the same seed
  match?: ActiveMatch;
}

export type SaveStatus = 'saving' | SaveOutcome | null;

export function App() {
  const auth = useAuth();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [run, setRun] = useState<Run | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);
  const [lobby, setLobby] = useState<{ raceId: string; levelId: string; joinCode?: string } | null>(null);
  const invites = useInvites();
  const [howTo, setHowTo] = useState(false);
  const [howToShown, setHowToShown] = useState(false); // once opened this session it never opens by itself again
  const autoHowTo = useMemo(() => shouldAutoOpenHowTo(auth.status, auth.user?.created_at), [auth.status, auth.user]);
  const openHowTo = useCallback(() => {
    setHowToShown(true);
    setHowTo(true);
  }, []);
  const closeHowTo = useCallback(() => {
    markHowToSeen();
    setHowTo(false);
  }, []);

  // Invite toasts fade on their own; a toast that arrives mid-run waits on the menu as a count.
  useEffect(() => {
    if (!invites.nudge) return;
    const t = window.setTimeout(invites.clearNudge, 8000);
    return () => window.clearTimeout(t);
  }, [invites.nudge, invites.clearNudge]);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const startRun = (next: Run) => {
    setSaveStatus(null);
    setRun(next);
  };

  const startMatch = (m: MatchRun) => {
    setLobby(null);
    startRun({ level: m.level, raceId: m.raceId, seed: m.seed, nonce: 0, match: m.match });
  };

  const exitRun = () => {
    if (run?.match) void run.match.channel.close();
    setRun(null);
  };

  const onResult = useCallback(
    (result: SimResult, view: SimView, inputLog: LoggedInput[]) => {
      if (!run) return;
      setSaveStatus('saving');
      void recordRun({
        levelId: run.level.id,
        raceId: run.raceId,
        mode: run.match ? 'challenge' : 'campaign',
        seed: run.seed,
        outcome: result.outcome,
        score: result.score,
        stars: result.stars,
        wavesCleared: result.wavesCleared,
        livesLeft: view.lives,
        durationTicks: result.ticks,
        contentVersion: CONTENT_VERSION,
        engineVersion: ENGINE_VERSION,
        inputLog,
      }).then((outcome) => {
        setSaveStatus(outcome);
        if (outcome === 'saved') invalidateLeaderboard(run.level.id);
      });
    },
    [run],
  );

  if (auth.status === 'loading') return <Splash />;
  if (auth.status === 'signed-out') return <LoginScreen />;
  if (auth.recovery) return <NewPasswordScreen />;

  if (run) {
    return (
      <GameShell
        key={`${run.level.id}:${run.raceId}:${run.seed}:${run.nonce}`}
        level={run.level}
        raceId={run.raceId}
        seed={run.seed}
        settings={settings}
        saveStatus={saveStatus}
        signedIn={auth.status === 'signed-in'}
        match={run.match}
        onResult={onResult}
        onExit={exitRun}
        onReplay={() => startRun({ ...run, nonce: run.nonce + 1 })}
        onNewSeed={() => startRun({ ...run, seed: randomSeed(), nonce: run.nonce + 1 })}
      />
    );
  }

  if (lobby) {
    return (
      <MultiplayerScreen
        defaultRace={lobby.raceId}
        defaultLevel={lobby.levelId}
        invites={invites.invites}
        onAcceptInvite={invites.accept}
        onDeclineInvite={invites.decline}
        autoJoinCode={lobby.joinCode}
        onStart={startMatch}
        onBack={() => setLobby(null)}
      />
    );
  }

  const nudge = invites.nudge;
  return (
    <>
      <Menu
        settings={settings}
        inviteCount={invites.invites.length}
        autoHowTo={autoHowTo && !howToShown}
        onSettings={updateSettings}
        onPlay={(level, raceId, seed) => startRun({ level, raceId, seed, nonce: 0 })}
        onMultiplayer={(raceId, levelId) => setLobby({ raceId, levelId })}
        onHowTo={openHowTo}
      />
      {howTo && <HowToPlay raceId={settings.lastRace} onClose={closeHowTo} />}
      {nudge && (
        <div role="status" className="fixed inset-x-3 top-[calc(var(--safe-top)+0.5rem)] z-40 mx-auto max-w-md rounded-xl border border-sap/70 bg-grove-900/95 p-3 text-sm shadow-lg backdrop-blur">
          <p className="truncate">
            <span className="font-semibold">{nudge.fromName}</span> invited you to a match.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                invites.clearNudge();
                setLobby({ raceId: settings.lastRace ?? 'rootkin', levelId: settings.lastLevel ?? levels[0].id, joinCode: nudge.code });
              }}
              className="rounded-md bg-grove-500 px-3 py-1 font-semibold text-grove-950 hover:bg-grove-300"
            >
              Join
            </button>
            <button onClick={invites.clearNudge} className="rounded-md border border-grove-700 px-3 py-1 text-grove-300 hover:bg-grove-800">
              Later
            </button>
          </div>
        </div>
      )}
    </>
  );
}
