// Extra Terram — src/ui/TowerIcon.tsx v0.3.0 — a tower's sprite image for the chrome, with a colour-dot fallback
import { useState } from 'react';
import type { TowerDef } from '../engine';
import { spriteUrl } from '../render/sprites';

interface Props {
  tower: TowerDef;
  size?: number;
  state?: 't1' | 't2' | 't3a' | 't3b';
}

export function TowerIcon({ tower, size = 32, state = 't1' }: Props) {
  const [missing, setMissing] = useState(false);
  if (missing) return <span className="inline-block shrink-0 rounded-full" style={{ width: size * 0.45, height: size * 0.45, backgroundColor: tower.color }} />;
  return (
    <img
      src={spriteUrl(tower.race, tower.id, state)}
      alt=""
      width={size}
      height={size}
      draggable={false}
      onError={() => setMissing(true)}
      className="shrink-0 object-contain"
      style={{ width: size, height: size, transform: 'scale(1.3) translateY(6%)' }}
    />
  );
}
