// Extra Terram — src/ui/useSpriteIndex.ts v0.1.0 — the sprite index for components: null until loaded, then the shared index
import { useEffect, useState } from 'react';
import { onSpriteIndex, spriteIndexNow, type SpriteIndex } from '../render/spriteIndex';

export function useSpriteIndex(): SpriteIndex | null {
  const [index, setIndex] = useState<SpriteIndex | null>(() => spriteIndexNow());
  useEffect(() => {
    if (index) return;
    const off = onSpriteIndex(setIndex);
    return () => off();
  }, [index]);
  return index;
}
