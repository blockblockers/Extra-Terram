// Extra Terram — src/app/App.tsx v0.13.0 — the shell gets the settings setter for the pause screen; music and game sounds switched apart; the mixer opens on the first tap
// Splash -> Login (unless guest, signed in, or an offline build) -> Menu <-> Game, or Menu -> Multiplayer -> Game.
// The game shell is remounted for every run so the canvas, renderer and sim start clean.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CONTENT_VERSION, levels, type LevelEntry } from '../content';
import { ENGINE_VERSION, type LoggedInput, type RunRules, type SimResult, type SimView } from '../engine';
import { invalidateLeaderboard, recordRun, useAuth, useInvites, type ActiveMatch, type MatchRow, type SaveOutcome } from '../net';
import { LoginScreen, NewPasswordScreen } from '../ui/LoginScreen';
import { HowToPlay, markHowToSeen, shouldAutoOpenHowTo } from '../ui/HowToPlay';
import { Menu } from '../ui/Menu';
import { MultiplayerScreen, type MatchRun } from '../ui/MultiplayerScreen';
import { Splash } from '../ui/Title';
import { GameShell, type RematchTarget } from './GameShell';
import { isCustomRun, resolveRules, type RulePick } from './rules';
import { loadSettings, saveSettings, randomSeed, type Settings } from './settings';
import { audio, DEFAULT_VOLUMES } from '../audio';

interface Run {
  level: LevelEntry;
  raceId: string;
  seed: string;
  nonce: number; // bumps to remount the shell for "play again" with the same seed
  /** Rounds, mini-bosses and difficulty, resolved for this level (the host's, in a match). */
  rules: RunRules;
  match?: ActiveMatch;
}

export type SaveStatus = 'saving' | SaveOutcome | null;

export function App() {
  const auth = useAuth();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [run, setRun] = useState<Run | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);
  const [lobby, setLobby] = useState<{ raceId: string; levelId: string; joinCode?: string; host?: { match: MatchRow; seat: number } } | null>(null);
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

  // Sound. Browsers allow none before a gesture: the first pointer or key opens the mixer (and any later
  // one resumes it after the tab was hidden). Every button tap ticks; the scene decides the music.
  useEffect(() => {
    const unlock = () => audio.unlock();
    const tap = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('button, [role="radio"], select, a')) audio.tap();
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('click', tap, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
      window.removeEventListener('click', tap, { capture: true });
    };
  }, []);
  useEffect(() => {
    audio.setVolumes({ music: settings.music ?? DEFAULT_VOLUMES.music, sfx: settings.sfx ?? DEFAULT_VOLUMES.sfx, musicOn: settings.musicOn !== false, sfxOn: settings.sfxOn !== false, muted: settings.muted ?? false });
  }, [settings.music, settings.sfx, settings.musicOn, settings.sfxOn, settings.muted]);
  const world = run?.level.map.world ?? null;
  useEffect(() => {
    audio.setScene(world ? { kind: 'level', world } : { kind: 'menu' });
  }, [world]);
  useEffect(() => {
    // test hook: what the mixer is doing, from any screen
    (window as unknown as { __etAudio?: () => unknown }).__etAudio = () => ({ playing: audio.playing, running: audio.running, active: audio.screenActive, ...audio.stats });
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
    startRun({ level: m.level, raceId: m.raceId, seed: m.seed, nonce: 0, rules: m.match.rules ?? resolveRules(undefined, m.level), match: m.match });
  };

  const saveRules = (pick: RulePick) => updateSettings({ ...settings, rounds: pick.rounds, bossEvery: pick.bossEvery, coopDifficulty: pick.difficulty });

  const exitRun = () => {
    if (run?.match) void run.match.channel.close();
    setRun(null);
  };

  /** After a match: straight into the rematch lobby, as its host (made already) or by the host's code. */
  const rematch = (target: RematchTarget) => {
    if (!run) return;
    const levelId = run.match?.levelId ?? run.level.id;
    if (run.match) void run.match.channel.close();
    setRun(null);
    setLobby(target.host ? { raceId: run.raceId, levelId, host: { match: target.match, seat: target.seat } } : { raceId: run.raceId, levelId, joinCode: target.code });
  };

  const onResult = useCallback(
    (result: SimResult, view: SimView, inputLog: LoggedInput[]) => {
      if (!run) return;
      setSaveStatus('saving');
      // Stars and the level's top scores belong to the level as written; other rules are custom runs.
      const custom = isCustomRun(run.rules, run.level);
      void recordRun({
        levelId: run.level.id,
        raceId: run.raceId,
        mode: run.match ? 'challenge' : custom ? 'endless' : 'campaign',
        custom,
        rules: run.rules,
        seed: run.seed,
        outcome: result.outcome,
        score: result.score,
        stars: custom ? 0 : result.stars,
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
        rules={run.rules}
        settings={settings}
        onSettings={updateSettings}
        saveStatus={saveStatus}
        signedIn={auth.status === 'signed-in'}
        match={run.match}
        onResult={onResult}
        onExit={exitRun}
        onReplay={() => startRun({ ...run, nonce: run.nonce + 1 })}
        onNewSeed={() => startRun({ ...run, seed: randomSeed(), nonce: run.nonce + 1 })}
        onRematch={rematch}
      />
    );
  }

  if (lobby) {
    return (
      <MultiplayerScreen
        defaultRace={lobby.raceId}
        defaultLevel={lobby.levelId}
        defaultRules={{ rounds: settings.rounds ?? 0, bossEvery: settings.bossEvery ?? 0, difficulty: settings.coopDifficulty ?? 0 }}
        onRulesChange={saveRules}
        invites={invites.invites}
        onAcceptInvite={invites.accept}
        onDeclineInvite={invites.decline}
        autoJoinCode={lobby.joinCode}
        autoHost={lobby.host}
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
        onPlay={(level, raceId, seed, rules) => startRun({ level, raceId, seed, nonce: 0, rules })}
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
