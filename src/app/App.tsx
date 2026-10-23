// Extra Terram — src/app/App.tsx v0.1.0 — Phase 1 scaffold
// Menu <-> game. The game shell is remounted for every run so the canvas, renderer and sim start clean.
import { useState } from 'react';
import { levels, type LevelEntry } from '../content';
import { Menu } from '../ui/Menu';
import { GameShell } from './GameShell';
import { loadSettings, saveSettings, randomSeed, type Settings } from './settings';

interface Run {
  level: LevelEntry;
  seed: string;
  nonce: number; // bumps to remount the shell for "play again" with the same seed
}

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [run, setRun] = useState<Run | null>(null);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  if (run) {
    return (
      <GameShell
        key={`${run.level.id}:${run.seed}:${run.nonce}`}
        level={run.level}
        seed={run.seed}
        settings={settings}
        onExit={() => setRun(null)}
        onReplay={() => setRun({ ...run, nonce: run.nonce + 1 })}
        onNewSeed={() => setRun({ ...run, seed: randomSeed(), nonce: run.nonce + 1 })}
      />
    );
  }

  return <Menu levels={levels} settings={settings} onSettings={updateSettings} onPlay={(level, seed) => setRun({ level, seed, nonce: 0 })} />;
}
