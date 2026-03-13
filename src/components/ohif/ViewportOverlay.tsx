'use client';

import { useState, useEffect } from 'react';
import { getViewportVOI, getViewportStackInfo } from '@/lib/ohif/cornerstone';

type ViewportOverlayProps = {
  viewportIndex: number;
  className?: string;
};

/** Bottom-left overlay: W/L and slice index (ohif.org style). */
export function ViewportOverlay({ viewportIndex, className = '' }: ViewportOverlayProps) {
  const [voi, setVoi] = useState<{ lower: number; upper: number } | null>(null);
  const [stack, setStack] = useState<{ currentIndex: number; total: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const v = getViewportVOI(viewportIndex);
      const s = getViewportStackInfo(viewportIndex);
      setVoi(v ?? null);
      setStack(s ?? null);
    };
    update();
    const id = setInterval(update, 400);
    return () => clearInterval(id);
  }, [viewportIndex]);

  const w = voi ? Math.round(voi.upper - voi.lower) : null;
  const l = voi ? Math.round((voi.upper + voi.lower) / 2) : null;
  const sliceStr = stack ? `${stack.currentIndex}/${stack.total}` : null;

  if (!w && !l && !sliceStr) return null;

  return (
    <div
      className={`absolute bottom-1 left-1 right-1 flex items-center justify-between pointer-events-none text-xs text-white/90 drop-shadow-md ${className}`}
      aria-hidden
    >
      <span>
        {w != null && l != null && `W: ${w} L: ${l}`}
        {stack && (
          <span className={w != null && l != null ? ' ml-2' : ''}>
            1:1 ({sliceStr})
          </span>
        )}
      </span>
    </div>
  );
}
