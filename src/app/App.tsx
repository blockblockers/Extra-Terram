// Extra Terram — src/app/App.tsx v0.7.0 — multiplayer screen; a match run carries its live channel into the shell
// Splash -> Login (unless guest, signed in, or an offline build) -> Menu <-> Game, or Menu -> Multiplayer -> Game.
// The game shell is remounted for every run so the canvas, renderer and sim start clean.
import { useCallback, useState } from 'react';
import { CONTENT_VERSION, type LevelEntry } from '../content';
import { ENGINE_VERSION, type LoggedInput, type SimResult, type SimView } from '../engine';
import { invalidateLeaderboard, recordRun, useAuth, type ActiveMatch, type SaveOutcome } from '../net';
import { LoginScreen, NewPasswordScreen } from '../ui/LoginScreen';
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
  const [lobby, setLobby] = useState<{ raceId: string; levelId: string } | null>(null);

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
    return <MultiplayerScreen defaultRace={lobby.raceId} defaultLevel={lobby.levelId} onStart={startMatch} onBack={() => setLobby(null)} />;
  }

  return (
    <Menu
      settings={settings}
      onSettings={updateSettings}
      onPlay={(level, raceId, seed) => startRun({ level, raceId, seed, nonce: 0 })}
      onMultiplayer={(raceId, levelId) => setLobby({ raceId, levelId })}
    />
  );
}
