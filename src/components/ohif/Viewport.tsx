'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createViewport,
  setStack,
  destroyViewport,
  getViewportId,
  scrollStack,
} from '@/lib/ohif/cornerstone';

const PLACEHOLDER_IMAGE_IDS = ['test://placeholder'];

type ViewportProps = {
  studyInstanceUID: string;
  imageIds?: string[];
  className?: string;
};

export function Viewport({ studyInstanceUID, imageIds, className = '' }: ViewportProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const wheelCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    let mounted = true;
    setError(null);
    wheelCleanupRef.current = null;

    (async () => {
      try {
        const viewport = await createViewport(el);
        const ids = imageIds && imageIds.length > 0 ? imageIds : PLACEHOLDER_IMAGE_IDS;
        await setStack(viewport, ids, 0);
        if (mounted) {
          const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            scrollStack(e.deltaY > 0 ? 1 : -1);
          };
          el.addEventListener('wheel', onWheel, { passive: false });
          wheelCleanupRef.current = () => el.removeEventListener('wheel', onWheel);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to init viewport';
        if (mounted) setError(msg);
      }
    })();

    return () => {
      mounted = false;
      wheelCleanupRef.current?.();
      destroyViewport(false);
    };
  }, [studyInstanceUID, imageIds]);

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-lg border border-border/30 ${className}`}>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div
      id={getViewportId(0)}
      ref={elementRef}
      className={`viewport-container bg-black rounded-lg overflow-hidden ${className}`}
      style={{ minHeight: 400 }}
    />
  );
}
