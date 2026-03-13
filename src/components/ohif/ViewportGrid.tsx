'use client';

import { useCallback } from 'react';
import { DicomViewportCell } from '@/components/ohif/DicomViewportCell';
import { parseWadoImageId } from '@/lib/ohif/dicomweb';
import type { ViewportLayout, ViewportTransformState, ViewportAnnotationItem, Measurement } from '@/lib/ohif/types';
import { LAYOUT_GRID } from '@/lib/ohif/viewerConfig';

/**
 * Key for annotations map: one key per DICOM instance (study|series|sop).
 * Must include study so multiple studies' images never share or overwrite each other.
 */
export function annotationKeyForImageId(imageId: string): string | null {
  const parsed = parseWadoImageId(imageId);
  return parsed ? `${parsed.study}|${parsed.series}|${parsed.sop}` : null;
}

export interface ViewportGridProps {
  /** Study instance UID(s) for context (e.g. analytics or ARIA). */
  studyInstanceUID: string;
  /** Layout: 1x1, 1x2, or 2x2. */
  layout: ViewportLayout;
  /** Per-cell image ID lists. viewportImageIds[i] = image IDs for cell i. */
  viewportImageIds: string[][];
  /** Index of the currently active viewport (focus and styling). */
  activeViewportIndex: number;
  /** Called when the active viewport changes (e.g. on double-click). */
  onActiveViewportChange?: (index: number) => void;
  /** Called when the user double-clicks a viewport (activate and load selected series). No hover. */
  onViewportDoubleClick: (index: number) => void;
  /** Per-cell frame index (stack position). Controlled by parent for cine/keyboard. */
  cellFrameIndices: number[];
  /** Called when user changes frame in a cell (wheel, arrows). */
  onCellFrameChange: (cellIndex: number, frameIndex: number) => void;
  /** Per-cell zoom/pan/WL state. */
  viewportStates: ViewportTransformState[];
  /** Called when user changes transform in a cell (pan drag, WL drag). */
  onViewportStateChange: (cellIndex: number, partial: Partial<ViewportTransformState>) => void;
  /** Active tool (Zoom, Pan, StackScroll, WindowLevel). */
  activeTool?: string;
  /** Annotations per DICOM instance only. Key = study|series|sop; each file has its own array — never combined. */
  annotationsByKey?: Record<string, ViewportAnnotationItem[]>;
  /** Viewport index currently in annotation edit mode, or null. */
  activeEditViewportIndex?: number | null;
  /** Called when user clicks Edit on a viewport cell. */
  onEnterEditMode?: (viewportIndex: number) => void;
  /** Called when user saves annotations for a specific instance (imageId, parsed study/series/sop). */
  onSaveAnnotations?: (params: { study: string; series: string; sop: string; items: ViewportAnnotationItem[] }) => void;
  /** Called when user cancels edit mode. */
  onCancelEdit?: () => void;
  /** All measurements (for on-canvas display and new measurements). */
  measurements?: Measurement[];
  /** Called when user completes a measurement on canvas. */
  onMeasurementComplete?: (measurement: Measurement) => void;
  className?: string;
}

/**
 * DICOM viewport grid: arranges multiple viewport cells in a 1×1, 1×2, or 2×2
 * layout. Each cell displays a series from the same WADO-RS path as the study
 * list. Frame indices and transform state are controlled by the parent for
 * toolbar (zoom, pan, reset, cine) and keyboard.
 */
export function ViewportGrid({
  layout,
  viewportImageIds,
  activeViewportIndex,
  onActiveViewportChange,
  onViewportDoubleClick,
  cellFrameIndices,
  onCellFrameChange,
  viewportStates,
  onViewportStateChange,
  activeTool = 'StackScroll',
  annotationsByKey = {},
  activeEditViewportIndex = null,
  onEnterEditMode,
  onSaveAnnotations,
  onCancelEdit,
  measurements = [],
  onMeasurementComplete,
  className = '',
}: ViewportGridProps) {
  const { rows, cols, count } = LAYOUT_GRID[layout];

  const handleIndexChange = useCallback(
    (cellIndex: number, frameIndex: number) => {
      onCellFrameChange(cellIndex, frameIndex);
    },
    [onCellFrameChange]
  );

  return (
    <div
      className={`grid gap-1 bg-muted/20 rounded-lg overflow-hidden min-h-[400px] w-full h-full ${className}`}
      style={{
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      }}
      role="application"
      aria-label="DICOM viewport grid"
    >
      {Array.from({ length: count }, (_, i) => {
        const imageIds = viewportImageIds[i] ?? [];
        const frameIndex = cellFrameIndices[i] ?? 0;
        const currentImageId = imageIds.length > 0 ? imageIds[Math.min(frameIndex, imageIds.length - 1)] : undefined;
        // One key per instance: this cell gets only this image's annotations (never from another DICOM file).
        const annKey = currentImageId ? annotationKeyForImageId(currentImageId) : null;
        const rawAnnotations = annKey ? annotationsByKey[annKey] : undefined;
        const annotations: ViewportAnnotationItem[] = Array.isArray(rawAnnotations) ? rawAnnotations : [];
        const parsed = currentImageId ? parseWadoImageId(currentImageId) : null;

        return (
          <div
            key={i}
            role="presentation"
            tabIndex={-1}
            className="min-h-[200px] w-full h-full min-w-0 flex focus:outline-none"
            style={{ minHeight: 0 }}
            onDoubleClick={() => {
              onActiveViewportChange?.(i);
              onViewportDoubleClick(i);
            }}
            title="Double-click to activate and load selected series"
          >
            <DicomViewportCell
              imageIds={imageIds}
              currentIndex={frameIndex}
              onIndexChange={(idx) => handleIndexChange(i, idx)}
              active={activeViewportIndex === i}
              viewportIndex={i}
              transform={viewportStates[i]}
              onTransformChange={(partial) => onViewportStateChange(i, partial)}
              activeTool={activeTool}
              annotations={annotations}
              isEditMode={activeEditViewportIndex === i}
              onEnterEditMode={onEnterEditMode ? () => onEnterEditMode(i) : undefined}
              onSaveAnnotations={
                onSaveAnnotations && parsed
                  ? (items) => {
                      // Save only this cell's current DICOM instance — never mix with other viewports or images.
                      onSaveAnnotations({ study: parsed.study, series: parsed.series, sop: parsed.sop, items });
                    }
                  : undefined
              }
              onCancelEdit={onCancelEdit}
              measurements={measurements}
              onMeasurementComplete={onMeasurementComplete}
              className="w-full h-full"
            />
          </div>
        );
      })}
    </div>
  );
}
