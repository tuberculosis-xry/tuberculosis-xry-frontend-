'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil, Undo2 } from 'lucide-react';
import { parseWadoImageId, getInstancePreview, getInstanceFrame, isDicomWebConfigured } from '@/lib/ohif/dicomweb';
import { dicomBufferToDataUrl } from '@/lib/ohif/dicomToDataUrl';
import type { ViewportTransformState, ViewportAnnotationItem, Measurement } from '@/lib/ohif/types';
import { MeasurementOverlay } from '@/components/ohif/MeasurementOverlay';
import { DEFAULT_VIEWPORT_TRANSFORM } from '@/lib/ohif/types';
import { DicomAnnotationOverlay } from '@/components/ohif/DicomAnnotationOverlay';

function cloneAnnotations(items: ViewportAnnotationItem[]): ViewportAnnotationItem[] {
  return items.map((item) => ({ ...item }));
}

function stableAnnotation(item: ViewportAnnotationItem): Record<string, unknown> {
  const sortedEntries = Object.entries(item).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(sortedEntries);
}

function serializeAnnotations(items: ViewportAnnotationItem[]): string {
  return JSON.stringify(items.map((item) => stableAnnotation(item)));
}

function areAnnotationsEqual(a: ViewportAnnotationItem[], b: ViewportAnnotationItem[]): boolean {
  if (a.length !== b.length) return false;
  return serializeAnnotations(a) === serializeAnnotations(b);
}

function buildPreloadedUndoPast(items: ViewportAnnotationItem[]): ViewportAnnotationItem[][] {
  if (items.length === 0) return [];
  const base = cloneAnnotations(items);
  const removalOrder = base
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aCreated = typeof a.item.createdAt === 'number' ? a.item.createdAt : Number.NEGATIVE_INFINITY;
      const bCreated = typeof b.item.createdAt === 'number' ? b.item.createdAt : Number.NEGATIVE_INFINITY;
      if (bCreated !== aCreated) return bCreated - aCreated;
      // Deterministic fallback: tail-first current order (latest rendered last).
      return b.index - a.index;
    })
    .map((entry) => entry.item.id);

  const states: ViewportAnnotationItem[][] = [];
  let current = base;
  for (const id of removalOrder) {
    current = current.filter((annotation) => annotation.id !== id);
    states.push(cloneAnnotations(current));
  }
  // Undo pops from the end of `past`, so reverse for stepwise behavior.
  return states.reverse();
}

export interface DicomViewportCellProps {
  /** WADO-RS image IDs for this viewport (e.g. wado:base|study|series|sop). */
  imageIds: string[];
  /** Current frame index in the stack (0-based). */
  currentIndex?: number;
  /** Called when the user changes the current frame (e.g. wheel or keyboard). */
  onIndexChange?: (index: number) => void;
  /** Whether this cell is the active viewport (keyboard focus and styling). */
  active?: boolean;
  /** Optional viewport index for ARIA and analytics. */
  viewportIndex?: number;
  /** Optional series description for accessibility. */
  seriesDescription?: string;
  /** Zoom (scale), pan, and window/level applied to the image. */
  transform?: ViewportTransformState;
  /** Called when user drags to pan or adjust WL (e.g. Pan or WindowLevel tool). */
  onTransformChange?: (partial: Partial<ViewportTransformState>) => void;
  /** Active tool; Pan and WindowLevel use drag on image to update transform. */
  activeTool?: string;
  /** Annotations for this cell's current image only (one DICOM instance — never from another file). */
  annotations?: ViewportAnnotationItem[];
  /** Whether this cell is in annotation edit mode. */
  isEditMode?: boolean;
  /** Called when user clicks Edit on this cell. */
  onEnterEditMode?: () => void;
  /** Called when user saves annotations in this cell. May return a Promise; edit mode exits only after success. */
  onSaveAnnotations?: (items: ViewportAnnotationItem[]) => void | Promise<void>;
  /** Called when user cancels edit mode. */
  onCancelEdit?: () => void;
  /** All measurements (for display); completed on-canvas measurements are added by parent. */
  measurements?: Measurement[];
  /** Called when user completes a measurement on canvas (length, angle, ROI). */
  onMeasurementComplete?: (measurement: Measurement) => void;
  className?: string;
}

/**
 * DICOM viewport cell: displays a single frame or stack from a series using the
 * application’s WADO-RS rendered endpoint. Uses the same fetch path as the study
 * list thumbnails for consistent, reliable display. Supports stack scroll via
 * mouse wheel and keyboard (arrow keys). Production-ready: cleanup, accessibility,
 * loading and error states.
 */
export function DicomViewportCell({
  imageIds,
  currentIndex = 0,
  onIndexChange,
  active = false,
  viewportIndex = 0,
  seriesDescription,
  transform: transformProp,
  onTransformChange,
  activeTool = 'StackScroll',
  annotations = [],
  isEditMode = false,
  onEnterEditMode,
  onSaveAnnotations,
  onCancelEdit,
  measurements = [],
  onMeasurementComplete,
  className = '',
}: DicomViewportCellProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const transform = transformProp ?? DEFAULT_VIEWPORT_TRANSFORM;
  const [isDragging, setIsDragging] = useState(false);
  const [localAnnotations, setLocalAnnotations] = useState<ViewportAnnotationItem[]>(() => cloneAnnotations(annotations));
  const [savedSnapshot, setSavedSnapshot] = useState<ViewportAnnotationItem[]>(() => cloneAnnotations(annotations));
  const [pastAnnotations, setPastAnnotations] = useState<ViewportAnnotationItem[][]>([]);
  const imageRef = useRef<HTMLImageElement>(null);
  const panStartRef = useRef<{ x: number; y: number; translateX: number; translateY: number } | null>(null);
  const wlStartRef = useRef<{ x: number; y: number; brightness: number; contrast: number } | null>(null);
  const pendingUndoAfterEnterRef = useRef(false);

  const total = imageIds.length;
  const index = total === 0 ? 0 : Math.max(0, Math.min(currentIndex, total - 1));
  const imageId = total > 0 ? imageIds[index] : undefined;

  const resetInstanceState = useCallback((items: ViewportAnnotationItem[]) => {
    const snapshot = cloneAnnotations(items);
    setLocalAnnotations(snapshot);
    setSavedSnapshot(snapshot);
    setPastAnnotations(buildPreloadedUndoPast(snapshot));
  }, []);

  const applyOverlayPreview = useCallback((items: ViewportAnnotationItem[]) => {
    const next = cloneAnnotations(items);
    setLocalAnnotations((prev) => {
      if (areAnnotationsEqual(prev, next)) return prev;
      return next;
    });
  }, []);

  const applyCommittedEdit = useCallback((before: ViewportAnnotationItem[], after: ViewportAnnotationItem[]) => {
    const prevState = cloneAnnotations(before);
    const nextState = cloneAnnotations(after);
    if (areAnnotationsEqual(prevState, nextState)) return;
    setPastAnnotations((past) => [...past, prevState]);
    setLocalAnnotations(nextState);
  }, []);

  const handleUndo = useCallback(() => {
    setPastAnnotations((past) => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      setLocalAnnotations(cloneAnnotations(previous));
      return past.slice(0, -1);
    });
  }, []);

  const isDirty = !areAnnotationsEqual(localAnnotations, savedSnapshot);
  const canUndo = pastAnnotations.length > 0;

  // Keep local/saved annotations in sync with server data when there are no local edits yet.
  useEffect(() => {
    if (!isDirty && pastAnnotations.length === 0) {
      const incoming = cloneAnnotations(annotations);
      setLocalAnnotations(incoming);
      setSavedSnapshot(incoming);
      setPastAnnotations(buildPreloadedUndoPast(incoming));
    }
  }, [annotations, isDirty, pastAnnotations.length]);

  // When the current image changes (e.g. user scrolled to another frame), always load that image's annotations
  // so we never show or edit the wrong instance's data.
  const prevImageIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (imageId !== prevImageIdRef.current) {
      prevImageIdRef.current = imageId;
      resetInstanceState(annotations);
    }
  }, [imageId, annotations, resetInstanceState]);

  useEffect(() => {
    if (isEditMode && pendingUndoAfterEnterRef.current) {
      pendingUndoAfterEnterRef.current = false;
      handleUndo();
    }
  }, [isEditMode, handleUndo]);

  useEffect(() => {
    if (!imageId || !isDicomWebConfigured() || !imageId.startsWith('wado:')) {
      setSrc(null);
      setError(null);
      return;
    }
    const parsed = parseWadoImageId(imageId);
    if (!parsed) {
      setSrc(null);
      setError('Invalid image reference');
      return;
    }
    setError(null);
    setLoading(true);
    let revoked = false;
    (async () => {
      try {
        const dataUrl = await getInstancePreview(parsed.study, parsed.series, parsed.sop);
        if (!revoked) setSrc(dataUrl);
      } catch {
        if (revoked) return;
        try {
          const buffer = await getInstanceFrame(parsed.study, parsed.series, parsed.sop);
          const dataUrl = await dicomBufferToDataUrl(buffer);
          if (!revoked) setSrc(dataUrl);
        } catch (e) {
          if (!revoked) setError(e instanceof Error ? e.message : 'Failed to load image');
        }
      } finally {
        if (!revoked) setLoading(false);
      }
    })();
    return () => {
      revoked = true;
    };
  }, [imageId, retryCount]);

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (activeTool === 'Zoom' && onTransformChange) {
        const factor = e.deltaY > 0 ? 1 / 1.25 : 1.25;
        const nextScale = Math.max(0.25, Math.min(5, transform.scale * factor));
        if (nextScale !== transform.scale) onTransformChange({ scale: nextScale });
        return;
      }
      if (total > 1 && onIndexChange) {
        const next = e.deltaY > 0 ? index + 1 : index - 1;
        const clamped = Math.max(0, Math.min(next, total - 1));
        if (clamped !== index) onIndexChange(clamped);
      }
    },
    [activeTool, total, index, onIndexChange, onTransformChange, transform.scale]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (total <= 1 || !onIndexChange) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        onIndexChange(Math.min(index + 1, total - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        onIndexChange(Math.max(index - 1, 0));
      }
    },
    [total, index, onIndexChange]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onTransformChange || !active) return;
      if (activeTool === 'Pan') {
        panStartRef.current = { x: e.clientX, y: e.clientY, translateX: transform.translateX, translateY: transform.translateY };
        setIsDragging(true);
      } else if (activeTool === 'WindowLevel') {
        wlStartRef.current = { x: e.clientX, y: e.clientY, brightness: transform.brightness, contrast: transform.contrast };
        setIsDragging(true);
      }
    },
    [active, activeTool, onTransformChange, transform.translateX, transform.translateY, transform.brightness, transform.contrast]
  );

  useEffect(() => {
    if (!onTransformChange || !active) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        onTransformChange({ translateX: panStartRef.current.translateX + dx, translateY: panStartRef.current.translateY + dy });
      } else if (wlStartRef.current) {
        const dx = (e.clientX - wlStartRef.current.x) * 0.01;
        const dy = (e.clientY - wlStartRef.current.y) * 0.01;
        onTransformChange({
          brightness: Math.max(0.2, Math.min(2, wlStartRef.current.brightness + dy)),
          contrast: Math.max(0.2, Math.min(3, wlStartRef.current.contrast + dx)),
        });
      }
    };
    const handleMouseUp = () => {
      if (panStartRef.current || wlStartRef.current) setIsDragging(false);
      panStartRef.current = null;
      wlStartRef.current = null;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [active, onTransformChange]);

  const sliceLabel = total > 0 ? `${index + 1} / ${total}` : null;
  const ariaLabel = seriesDescription
    ? `Viewport ${viewportIndex + 1}: ${seriesDescription}${sliceLabel ? `, frame ${sliceLabel}` : ''}`
    : `Viewport ${viewportIndex + 1}${sliceLabel ? `, frame ${sliceLabel}` : ''}`;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      aria-busy={loading}
      aria-live="polite"
      tabIndex={active ? 0 : -1}
      className={`relative bg-black rounded min-h-[200px] w-full h-full overflow-hidden outline-none flex items-center justify-center focus:ring-2 focus:ring-primary focus:ring-inset ${active ? 'ring-2 ring-primary ring-inset' : ''} ${className}`}
      style={{ minWidth: 0, minHeight: 0 }}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
    >
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-sm bg-black/90 p-4 text-center">
          <p className="text-destructive font-medium">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
        </div>
      )}
      {loading && !src && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50" aria-hidden>
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}
      {src && !error && (
        <>
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden"
            style={{
              transformOrigin: 'center center',
              transform: `scale(${transform.scale}) translate(${transform.translateX}px, ${transform.translateY}px)`,
              filter: `brightness(${transform.brightness}) contrast(${transform.contrast})`,
              cursor:
                isEditMode
                  ? 'crosshair'
                  : activeTool === 'Pan'
                    ? isDragging
                      ? 'grabbing'
                      : 'grab'
                    : activeTool === 'WindowLevel'
                      ? 'ns-resize'
                      : 'default',
            }}
            onMouseDown={!isEditMode ? handleMouseDown : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- DICOM decoded to data URL */}
            <img
              ref={imageRef}
              src={src}
              alt=""
              className="max-w-full max-h-full w-auto h-auto object-contain select-none pointer-events-none"
              draggable={false}
              style={{ maxHeight: '100%' }}
              loading="eager"
              decoding="async"
              onError={() => setError('Image failed to load (format may be unsupported). Re-save as uncompressed or JPEG Baseline.')}
            />
            <DicomAnnotationOverlay
              imageRef={imageRef}
              annotations={localAnnotations}
              isEditMode={isEditMode}
              isDirty={isDirty}
              canUndo={canUndo}
              onUndo={handleUndo}
              onAnnotationsChange={applyOverlayPreview}
              onCommitEditAction={({ before, after }) => applyCommittedEdit(before, after)}
              onSave={async (items) => {
                const itemsToSave = cloneAnnotations(items);
                setLocalAnnotations(itemsToSave);
                try {
                  await Promise.resolve(onSaveAnnotations?.(itemsToSave));
                  setSavedSnapshot(itemsToSave);
                  setPastAnnotations([]);
                  onCancelEdit?.();
                } catch {
                  // Leave edit mode open; parent shows save error
                }
              }}
              onCancel={() => onCancelEdit?.()}
            />
            {!isEditMode && (
              <MeasurementOverlay
                imageRef={imageRef}
                imageId={imageId}
                viewportIndex={viewportIndex}
                activeTool={activeTool}
                measurements={measurements}
                onComplete={(m) => onMeasurementComplete?.(m)}
              />
            )}
          </div>
          {!isEditMode && imageId && (
            <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canUndo || !onEnterEditMode) return;
                  pendingUndoAfterEnterRef.current = true;
                  onEnterEditMode();
                }}
                disabled={!canUndo || !onEnterEditMode}
                className="flex h-7 w-7 items-center justify-center rounded bg-black/60 text-white transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                title="Undo last annotation edit"
                aria-label="Undo last annotation edit"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              {onEnterEditMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnterEditMode();
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded bg-black/60 text-white hover:bg-primary hover:text-primary-foreground transition-colors"
                  title="Edit annotations (draw, comment, mark)"
                  aria-label="Edit annotations"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {sliceLabel && (
            <div
              className="absolute bottom-1 left-1 text-xs text-white/90 drop-shadow-md pointer-events-none px-1.5 py-0.5 rounded bg-black/40"
              aria-hidden
            >
              {sliceLabel}
            </div>
          )}
        </>
      )}
      {!imageId && !loading && !error && (
        <div className="text-muted-foreground text-sm" aria-hidden>
          No image
        </div>
      )}
    </div>
  );
}
