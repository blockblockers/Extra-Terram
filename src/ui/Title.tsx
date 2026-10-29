// Extra Terram — src/ui/Title.tsx v0.10.0 — a `screen` layout for the phone menu: the height of the viewport, nothing to scroll
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * The key art comes as two paintings of the same world, neither with lettering: public/art/title.jpg
 * (1672 × 941) for landscape screens and public/art/title-portrait.jpg (1536 × 2048) for portrait ones
 * (the choice is made in CSS, see .et-backdrop-art in index.css, and here for the preload). The title
 * is always rendered live.
 */
const TITLE_ART_WIDE = '/art/title.jpg';
const TITLE_ART_TALL = '/art/title-portrait.jpg';
const WIDE_QUERY = '(min-aspect-ratio: 5/4)';
const titleArtFor = () => (window.matchMedia(WIDE_QUERY).matches ? TITLE_ART_WIDE : TITLE_ART_TALL);
/** How long the painting holds the screen alone once it has loaded, before the panels come in. */
const INTRO_HOLD_MS = 2400;

// Once per page load: the first title screen plays the intro, later ones (back from a game) do not.
let introDone = false;
let introStartedAt = 0;

const IntroContext = createContext<{ revealed: boolean }>({ revealed: true });

/**
 * Runs `run` once, shortly after the title intro has handed the screen to the panels (at once when
 * there is no intro). Place it inside a TitleColumn. Used to open the how-to for new players without
 * covering the painting's moment.
 */
export function OnRevealed({ run, delayMs = 500 }: { run(): void; delayMs?: number }) {
  const { revealed } = useContext(IntroContext);
  useEffect(() => {
    if (!revealed) return;
    const t = window.setTimeout(run, delayMs);
    return () => window.clearTimeout(t);
    // once per reveal: a new `run` identity on a re-render must not fire it again
  }, [revealed]);
  return null;
}

/** Wrap the panels of a title-backed screen: hidden during the intro, then slid in. */
export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { revealed } = useContext(IntroContext);
  return <div className={`${className} transition-all duration-700 ease-out motion-reduce:transition-none ${revealed ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-8 opacity-0'}`}>{children}</div>;
}

/**
 * Full-bleed key art with the readability gradient, pinned to the viewport (see .et-backdrop in
 * index.css): one scale on every title-backed screen, however long the page, and the panels scroll
 * over it. The painting is 1536 × 2048 and is scaled by height: on phones that crops the sides like
 * `cover` would; on wide screens it sits centred over a blurred copy of itself. During the intro the
 * gradient stays light so the whole painting reads; it deepens as the panels arrive. No transform on
 * the painting: a scaled raster softens, and the panels' slide is the intro's motion.
 */
export function TitleBackdrop() {
  const { revealed } = useContext(IntroContext);
  return (
    <>
      <div className="et-backdrop et-backdrop-ambient z-0" aria-hidden="true" />
      <div className="et-backdrop et-backdrop-art z-0" aria-hidden="true" />
      <div
        className={`et-backdrop z-0 bg-gradient-to-b from-grove-950/60 via-transparent transition-opacity duration-700 ${revealed ? 'to-grove-950 opacity-100' : 'to-grove-950/40 opacity-90'}`}
        aria-hidden="true"
      />
    </>
  );
}

/** The title, live: centred over the column, or (`stage`) top left on the landscape menu. */
export function LogoLockup({ stage = false }: { stage?: boolean }) {
  return (
    <header className={stage ? 'et-stage-logo' : 'pb-2 text-center'}>
      <h1 className="et-title">Extra-Terram</h1>
      <p className={`et-subtitle ${stage ? '' : 'mt-3'}`}>
        <span>The Alien Race Tower Defense</span>
      </p>
    </header>
  );
}

/**
 * Every title-backed page: the backdrop, then either the phone-width column (padded past the safe
 * areas), a `screen` (the same column held to the viewport's height, for the phone menu: its middle
 * centres whatever is open and scrolls inside itself), or, for the menu in landscape, a `stage` the
 * size of the viewport whose children place themselves on the painting. On the first
 * title screen of a page load it runs the intro: the painting alone until it has loaded plus a short
 * hold (or a tap), then the panels wrapped in <Reveal> slide in.
 */
export function TitleColumn({ children, layout = 'column' }: { children: ReactNode; layout?: 'column' | 'stage' | 'screen' }) {
  const [revealed, setRevealed] = useState(introDone);

  useEffect(() => {
    if (introDone) return;
    if (!introStartedAt) introStartedAt = performance.now();
    let timer: number | null = null;
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      introDone = true;
      setRevealed(true);
    };
    const armed = () => {
      // Hold from the first title screen's mount, not from this one's, so a splash + login do not double it.
      const remaining = Math.max(0, INTRO_HOLD_MS - (performance.now() - introStartedAt));
      timer = window.setTimeout(finish, remaining);
    };
    const img = new Image();
    img.onload = armed;
    img.onerror = () => {
      timer = window.setTimeout(finish, 600); // no painting to show: do not keep the player waiting
    };
    img.src = titleArtFor();
    if (img.complete && img.naturalWidth > 0) armed();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const skip = () => {
    if (revealed) return;
    introDone = true;
    setRevealed(true);
    // The tap that skips the intro must not also press whatever panel slides in under the finger.
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 600);
  };

  return (
    <IntroContext.Provider value={{ revealed }}>
      <main className="relative isolate min-h-dvh overflow-x-clip bg-grove-950 font-ui" onPointerDown={skip}>
        <TitleBackdrop />
        {layout === 'stage' ? (
          <div className="et-stage">{children}</div>
        ) : layout === 'screen' ? (
          <div className="et-screen px-[calc(var(--safe-left)+1rem)] pb-[calc(var(--safe-bottom)+0.75rem)] pr-[calc(var(--safe-right)+1rem)] pt-[calc(var(--safe-top)+1.5rem)]">{children}</div>
        ) : (
          <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-[calc(var(--safe-left)+1rem)] pb-[calc(var(--safe-bottom)+1rem)] pr-[calc(var(--safe-right)+1rem)] pt-[calc(var(--safe-top)+1.5rem)]">
            {children}
          </div>
        )}
        {!revealed && (
          <p className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--safe-bottom)+1.25rem)] z-10 animate-pulse text-center text-[11px] uppercase tracking-[0.3em] text-grove-300/60" aria-hidden="true">
            Tap to continue
          </p>
        )}
      </main>
    </IntroContext.Provider>
  );
}

/** First paint while the session is being restored. */
export function Splash({ text = 'Connecting…' }: { text?: string }) {
  return (
    <TitleColumn>
      <LogoLockup />
      <div className="flex-1" />
      <p className="mb-6 text-center text-xs uppercase tracking-[0.25em] text-grove-300/60" role="status">
        {text}
      </p>
    </TitleColumn>
  );
}
