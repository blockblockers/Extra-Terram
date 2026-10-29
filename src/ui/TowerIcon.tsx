// Extra Terram — src/ui/TowerIcon.tsx v0.5.0 — a tower that aims is shown whole: its turret composed on the body's pivot; role glyph until art exists
import { useState } from 'react';
import type { TowerDef } from '../engine';
import { turretToBody } from '../render/spriteIndex';
import { hasTurret, spriteUrl } from '../render/sprites';
import { useSpriteIndex } from './useSpriteIndex';

interface Props {
  tower: TowerDef;
  size?: number;
  state?: 't1' | 't2' | 't3a' | 't3b';
}

/** The icon's turret points up and to the right, so the barrel's length reads. */
const ICON_AIM_DEG = -40;
const FRAME = { transform: 'scale(1.3) translateY(6%)' } as const;

export function TowerIcon({ tower, size = 32, state = 't1' }: Props) {
  const index = useSpriteIndex();
  const [missing, setMissing] = useState(false);
  const known = index ? index.has(`${tower.race}/${tower.id}/${state}.png`) : true;
  if (missing || !known) return <RoleGlyph role={tower.role} color={tower.color} size={size} />;
  const body = spriteUrl(tower.race, tower.id, state);
  const turret = index !== null && hasTurret(tower) && index.hasTurretArt(tower, state);
  if (!turret) {
    return (
      <img
        src={body}
        alt=""
        width={size}
        height={size}
        draggable={false}
        onError={() => setMissing(true)}
        className="shrink-0 object-contain"
        style={{ width: size, height: size, ...FRAME }}
      />
    );
  }
  // the turret on the body's pivot, at the game's own proportions (its 128 canvas against the body's 256)
  const [px, py] = index.pivotOnCanvas(tower, state);
  const t = turretToBody(state) * size;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size, ...FRAME }} aria-hidden="true">
      <img src={body} alt="" draggable={false} onError={() => setMissing(true)} className="absolute inset-0 object-contain" style={{ width: size, height: size }} />
      <img
        src={`/sprites/${tower.race}/${tower.id}/turret-${state}.png`}
        alt=""
        draggable={false}
        className="absolute"
        style={{ width: t, height: t, left: (px / 256) * size - t / 2, top: (py / 256) * size - t / 2, transform: `rotate(${ICON_AIM_DEG}deg)` }}
      />
    </span>
  );
}

/** A small drawn glyph per role, used until a tower has painted art. */
function RoleGlyph({ role, color, size }: { role: string; color: string; size: number }) {
  const s = size;
  let shape: React.ReactNode;
  switch (role) {
    case 'splash':
      shape = (
        <>
          <circle cx="16" cy="19" r="9" fill={color} />
          <rect x="14" y="4" width="5" height="12" rx="2" fill="#3a3f44" />
        </>
      );
      break;
    case 'range':
      shape = (
        <>
          <path d="M14 28 L18 28 L17 8 L15 8 Z" fill={color} />
          <ellipse cx="16" cy="7" rx="5" ry="3.5" fill={color} />
          <ellipse cx="16" cy="7" rx="2" ry="2.5" fill="#0b1a12" />
        </>
      );
      break;
    case 'economy':
      shape = (
        <>
          <ellipse cx="16" cy="20" rx="12" ry="7" fill={color} opacity="0.5" />
          <ellipse cx="16" cy="19" rx="8" ry="4.5" fill={color} />
          <ellipse cx="14" cy="18" rx="2.5" ry="1" fill="#ffffff" opacity="0.7" />
        </>
      );
      break;
    case 'support':
      shape = (
        <>
          <path d="M14 28 L18 28 L17 8 L15 8 Z" fill={color} />
          <ellipse cx="16" cy="11" rx="10" ry="4" fill="none" stroke={color} strokeWidth="2.5" />
          <circle cx="16" cy="6" r="3" fill={color} />
        </>
      );
      break;
    case 'control':
      shape = (
        <>
          <circle cx="16" cy="18" r="11" fill={color} opacity="0.3" />
          <circle cx="16" cy="18" r="11" fill="none" stroke={color} strokeWidth="2" />
          <path d="M16 6 L19 14 L13 14 Z" fill={color} />
        </>
      );
      break;
    default:
      shape = <circle cx="16" cy="16" r="9" fill={color} />;
  }
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      {shape}
    </svg>
  );
}
