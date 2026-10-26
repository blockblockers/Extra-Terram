// Extra Terram — src/ui/Title.tsx v0.6.0 — the name is Extra-Terram; the lockup uses the game's display fonts
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Whether public/art/title.jpg carries its own title lettering. The round-4 art is text-free, so the
 * name is rendered live (one spelling, crisp at any size). Set true only for art with baked-in
 * lettering: the lockup then gives way to a spacer so the title is not shown twice.
 */
export const TITLE_ART_HAS_LOGO = false;

const TITLE_ART = '/art/title.jpg';
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
 * Full-bleed key art with the readability gradient. The art is 1536 × 2048 and is always scaled by
 * height (`auto 100%`): on phones that crops the sides like `cover` would; on wide screens it sits
 * centred with the app background either side, so the painting is never cropped or blown up.
 * During the intro the gradient stays light so the whole painting reads; it deepens as the panels arrive.
 */
export function TitleBackdrop() {
  const { revealed } = useContext(IntroContext);
  const [settled, setSettled] = useState(introDone);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <>
      <div
        className="absolute inset-0 bg-[length:auto_100%] bg-[center_top] bg-no-repeat transition-transform duration-[3000ms] ease-out motion-reduce:transition-none"
        style={{ backgroundImage: `url(${TITLE_ART})`, transform: settled ? 'scale(1)' : 'scale(1.06)' }}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-0 bg-gradient-to-b via-transparent transition-opacity duration-700 ${TITLE_ART_HAS_LOGO ? 'from-grove-950/20' : 'from-grove-950/70'} ${revealed ? 'to-grove-950 opacity-100' : 'to-grove-950/40 opacity-90'}`}
        aria-hidden="true"
      />
    </>
  );
}

export function LogoLockup() {
  if (TITLE_ART_HAS_LOGO) {
    // The lettering occupies the top quarter of the painting (y ≈ 60–510 of 2048 → 25% of the height).
    return (
      <header className="h-[25dvh] min-h-[6rem]">
        <h1 className="sr-only">Extra-Terram — The Alien Race Tower Defense</h1>
      </header>
    );
  }
  return (
    <header className="pb-2 text-center">
      <h1 className="et-title">Extra-Terram</h1>
      <p className="et-subtitle mt-3">
        <span>The Alien Race Tower Defense</span>
      </p>
    </header>
  );
}

/**
 * The phone-width column every full-screen page uses, padded past the safe areas. On the first
 * title screen of a page load it runs the intro: the painting alone until it has loaded plus a short
 * hold (or a tap), then the panels wrapped in <Reveal> slide in.
 */
export function TitleColumn({ children }: { children: ReactNode }) {
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
    img.src = TITLE_ART;
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
      <main className="relative min-h-dvh overflow-hidden bg-grove-950 font-ui" onPointerDown={skip}>
        <TitleBackdrop />
        <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-[calc(var(--safe-left)+1rem)] pb-[calc(var(--safe-bottom)+1rem)] pr-[calc(var(--safe-right)+1rem)] pt-[calc(var(--safe-top)+1.5rem)]">
          {children}
        </div>
        {!revealed && (
          <p className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--safe-bottom)+1.25rem)] animate-pulse text-center text-[11px] uppercase tracking-[0.3em] text-grove-300/60" aria-hidden="true">
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
