// Extra Terram — src/ui/Title.tsx v0.3.0 — round-4 key art is text-free: the live lockup is back
import type { ReactNode } from 'react';

/**
 * Whether public/art/title.jpg carries its own title lettering. The round-4 art is text-free, so the
 * name is rendered live (one spelling, crisp at any size). Set true only for art with baked-in
 * lettering: the lockup then gives way to a spacer so the title is not shown twice.
 */
export const TITLE_ART_HAS_LOGO = false;

/**
 * Full-bleed key art with the readability gradient. The art is 1536 × 2048 and is always scaled by
 * height (`auto 100%`): on phones that crops the sides like `cover` would; on wide screens it sits
 * centred with the app background either side, so the painted lettering is never cropped or blown up.
 */
export function TitleBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-[length:auto_100%] bg-[center_top] bg-no-repeat" style={{ backgroundImage: 'url(/art/title.jpg)' }} aria-hidden="true" />
      <div className={`absolute inset-0 bg-gradient-to-b ${TITLE_ART_HAS_LOGO ? 'from-grove-950/20' : 'from-grove-950/70'} via-transparent to-grove-950`} aria-hidden="true" />
    </>
  );
}

export function LogoLockup() {
  if (TITLE_ART_HAS_LOGO) {
    // The lettering occupies the top quarter of the painting (y ≈ 60–510 of 2048 → 25% of the height).
    return (
      <header className="h-[25dvh] min-h-[6rem]">
        <h1 className="sr-only">Extra Terram — The Alien Race Tower Defense</h1>
      </header>
    );
  }
  return (
    <header className="text-center">
      <h1 className="text-[2.6rem] font-black uppercase leading-none tracking-[0.18em] text-sap drop-shadow-[0_0_18px_rgba(232,195,58,0.45)]">Extra Terram</h1>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-grove-300">The Alien Race Tower Defense</p>
    </header>
  );
}

/** The phone-width column every full-screen page uses, padded past the safe areas. */
export function TitleColumn({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-grove-950 font-ui">
      <TitleBackdrop />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-[calc(var(--safe-left)+1rem)] pb-[calc(var(--safe-bottom)+1rem)] pr-[calc(var(--safe-right)+1rem)] pt-[calc(var(--safe-top)+1.5rem)]">
        {children}
      </div>
    </main>
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
