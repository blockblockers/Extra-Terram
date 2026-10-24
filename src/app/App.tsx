// Extra Terram — src/app/App.tsx v0.6.0 — login screen in front of the menu; run results posted
// Splash -> Login (unless guest, signed in, or an offline build) -> Menu <-> Game.
// The game shell is remounted for every run so the canvas, renderer and sim start clean.
import { useCallback, useState } from 'react';
import { CONTENT_VERSION, type LevelEntry } from '../content';
import { ENGINE_VERSION, type LoggedInput, type SimResult, type SimView } from '../engine';
import { invalidateLeaderboard, recordRun, useAuth, type SaveOutcome } from '../net';
import { LoginScreen, NewPasswordScreen } from '../ui/LoginScreen';
import { Menu } from '../ui/Menu';
import { Splash } from '../ui/Title';
import { GameShell } from './GameShell';
import { loadSettings, saveSettings, randomSeed, type Settings } from './settings';

interface Run {
  level: LevelEntry;
  raceId: string;
  seed: string;
  nonce: number; // bumps to remount the shell for "play again" with the same seed
}

export type SaveStatus = 'saving' | SaveOutcome | null;

export function App() {
  const auth = useAuth();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [run, setRun] = useState<Run | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const startRun = (next: Run) => {
    setSaveStatus(null);
    setRun(next);
  };

  const onResult = useCallback(
    (result: SimResult, view: SimView, inputLog: LoggedInput[]) => {
      if (!run) return;
      setSaveStatus('saving');
      void recordRun({
        levelId: run.level.id,
        raceId: run.raceId,
        mode: 'campaign',
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
        onResult={onResult}
        onExit={() => setRun(null)}
        onReplay={() => startRun({ ...run, nonce: run.nonce + 1 })}
        onNewSeed={() => startRun({ ...run, seed: randomSeed(), nonce: run.nonce + 1 })}
      />
    );
  }

  return <Menu settings={settings} onSettings={updateSettings} onPlay={(level, raceId, seed) => startRun({ level, raceId, seed, nonce: 0 })} />;
}
