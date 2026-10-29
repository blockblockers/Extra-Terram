// Extra Terram — src/ui/UiIcon.tsx v0.1.0 — interface icons from public/ui/ (currencies, lives, race emblems, modes), each with a word or glyph until its art exists
// The sprite index (manifest.json) says which icons exist, so a missing one is never requested. While the
// index loads (a moment on first paint) an icon holds its place with an empty box of its size.
import { useState, type ReactNode } from 'react';
import type { MatchMode } from '../net/match';
import { useSpriteIndex } from './useSpriteIndex';

interface IconProps {
  /** File name in public/ui/ without .png: lives, currency-sap, emblem-rootkin, mode-king, ... */
  name: string;
  size?: number;
  /** Shown instead when the icon does not exist (a word, a glyph, or nothing). */
  fallback?: ReactNode;
  /** Words for screen readers when the icon stands in for them; leave out when the words are next to it. */
  alt?: string;
  className?: string;
}

export function UiIcon({ name, size = 16, fallback = null, alt, className = '' }: IconProps) {
  const index = useSpriteIndex();
  const [failed, setFailed] = useState(false);
  if (index === null) return <span aria-hidden="true" className={`inline-block shrink-0 ${className}`} style={{ width: size, height: size }} />;
  if (failed || !index.hasUi(name)) return <>{fallback}</>;
  return (
    <img
      src={`/ui/${name}.png`}
      alt={alt ?? ''}
      aria-hidden={alt ? undefined : true}
      width={size}
      height={size}
      draggable={false}
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Icon names. Currencies by their word ("sap", "Scrap"); races and modes by id. */
export const currencyIcon = (currency: string): string => `currency-${currency.toLowerCase()}`;
export const emblemIcon = (raceId: string): string => `emblem-${raceId}`;
export const modeIcon = (mode: MatchMode | string): string => (mode === 'parallel' ? 'mode-race' : `mode-${mode}`);

function useHasIcon(name: string): boolean | null {
  const index = useSpriteIndex();
  return index === null ? null : index.hasUi(name);
}

/** A price: the currency icon before the number, or the bare number as before. */
export function Price({ amount, currency, size = 13, className = '' }: { amount: number | string; currency: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap align-[-0.1em] ${className}`}>
      <UiIcon name={currencyIcon(currency)} size={size} alt={currency} />
      {amount}
    </span>
  );
}

/** An amount of money: the icon before the number, or "120 sap" in words. */
export function Money({ amount, currency, size = 13, className = '' }: { amount: number | string; currency: string; size?: number; className?: string }) {
  const has = useHasIcon(currencyIcon(currency));
  if (has === false) return <span className={className}>{`${amount} ${currency}`}</span>;
  return <Price amount={amount} currency={currency} size={size} className={className} />;
}

/** A lives count: the lives icon before the number, or "12♥" as before. */
export function Lives({ count, size = 12, className = '' }: { count: number | string; size?: number; className?: string }) {
  const has = useHasIcon('lives');
  if (has === false) return <span className={className}>{`${count}♥`}</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap ${className}`} title={`${count} lives`}>
      <UiIcon name="lives" size={size} alt="lives" />
      {count}
    </span>
  );
}
