// Extra Terram — src/ui/SettingsPanel.tsx v0.1.0 — the settings controls, shared by the menu and the pause screen
// Sound: background music and game sounds each have an on/off switch and a volume; Mute silences
// both. View: the map tilted or straight down, the ground lit or as painted. The menu shows all of
// it plus the play options; the pause screen shows sound and view, so a player changes them
// mid-run without leaving the board.
import { confirmBuildOn, type Settings } from '../app/settings';
import { DEFAULT_VOLUMES } from '../audio';

interface Props {
  settings: Settings;
  onSettings(next: Settings): void;
}

/** Background music and game sounds: switches and volumes. */
export function SoundSettings({ settings, onSettings }: Props) {
  const musicOn = settings.musicOn !== false;
  const sfxOn = settings.sfxOn !== false;
  const muted = settings.muted ?? false;
  const music = Math.round((settings.music ?? DEFAULT_VOLUMES.music) * 100);
  const sfx = Math.round((settings.sfx ?? DEFAULT_VOLUMES.sfx) * 100);
  return (
    <div role="group" aria-label="Sound">
      <Toggle label="Background music" checked={musicOn} onChange={(v) => onSettings({ ...settings, musicOn: v })} />
      <Slider label="Music volume" value={music} disabled={!musicOn || muted} onChange={(v) => onSettings({ ...settings, music: v / 100 })} />
      <Toggle label="Game sounds" checked={sfxOn} onChange={(v) => onSettings({ ...settings, sfxOn: v })} />
      <Slider label="Sounds volume" value={sfx} disabled={!sfxOn || muted} onChange={(v) => onSettings({ ...settings, sfx: v / 100 })} />
      <Toggle label="Mute everything" checked={muted} onChange={(v) => onSettings({ ...settings, muted: v })} />
      <p className="mt-1 text-xs text-grove-300/60">Sound plays only while the game is on screen: it stops when the phone locks or the app is put away.</p>
    </div>
  );
}

/** The camera and the ground lighting. */
export function ViewSettings({ settings, onSettings }: Props) {
  const tilted = settings.camera !== 'flat';
  return (
    <div role="group" aria-label="View">
      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span id="et-map-view">Map view</span>
        <div role="radiogroup" aria-labelledby="et-map-view" className="flex overflow-hidden rounded-lg border border-grove-700 text-xs">
          <button type="button" role="radio" aria-checked={tilted} onClick={() => onSettings({ ...settings, camera: 'tilt' })} className={`px-3 py-1.5 ${tilted ? 'bg-grove-500 font-semibold text-grove-950' : 'text-grove-300 hover:bg-grove-800'}`}>
            Tilted
          </button>
          <button type="button" role="radio" aria-checked={!tilted} onClick={() => onSettings({ ...settings, camera: 'flat' })} className={`px-3 py-1.5 ${!tilted ? 'bg-grove-500 font-semibold text-grove-950' : 'text-grove-300 hover:bg-grove-800'}`}>
            Straight down
          </button>
        </div>
      </div>
      <Toggle label="Ground lighting (relief and the shots' light)" checked={settings.lighting !== false} onChange={(v) => onSettings({ ...settings, lighting: v })} />
    </div>
  );
}

/** Everything: sound, view and the play options, for the menu's Settings. */
export function SettingsBody({ settings, onSettings }: Props) {
  return (
    <>
      <SoundSettings settings={settings} onSettings={onSettings} />
      <ViewSettings settings={settings} onSettings={onSettings} />
      <div role="group" aria-label="Play">
        <Toggle label="Battery saver (render at 30 fps)" checked={settings.batterySaver} onChange={(v) => onSettings({ ...settings, batterySaver: v })} />
        <Toggle label="Always show build pads" checked={settings.showPads} onChange={(v) => onSettings({ ...settings, showPads: v })} />
        <Toggle label="Confirm before building (tap pad, then Build)" checked={confirmBuildOn(settings)} onChange={(v) => onSettings({ ...settings, confirmBuild: v })} />
      </div>
    </>
  );
}

function Slider({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange(v: number): void }) {
  return (
    <label className={`mt-2 flex items-center justify-between gap-3 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span className="shrink-0">
        {label} <span className="text-grove-300/60">{value}%</span>
      </span>
      <input type="range" min={0} max={100} step={5} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-36 accent-grove-500" data-silent />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-grove-500" />
    </label>
  );
}
