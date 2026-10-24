// Extra Terram — src/ui/TowerIcon.tsx v0.4.0 — sprite image, or a role glyph in the tower's colour
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
  if (missing) return <RoleGlyph role={tower.role} color={tower.color} size={size} />;
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
