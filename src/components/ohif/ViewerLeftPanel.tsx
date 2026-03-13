'use client';

import { useState } from 'react';
import type { ViewerSeries } from '@/lib/ohif/types';
import { SeriesThumbnail } from '@/components/ohif/SeriesThumbnail';
import { LayoutGrid, List } from 'lucide-react';

const LEFT_PANEL_MIN = 200;
const LEFT_PANEL_MAX = 500;
const DEFAULT_LEFT_WIDTH = 256;

type ViewMode = 'list' | 'grid';

type ViewerLeftPanelProps = {
  studyInstanceUID: string;
  series: ViewerSeries[];
  activeSeriesUID: string | null;
  onSelectSeries: (series: ViewerSeries) => void;
  seriesError?: string | null;
  /** Panel width in px; when provided, panel is resizable by parent. */
  width?: number;
};

export function ViewerLeftPanel({
  studyInstanceUID,
  series,
  activeSeriesUID,
  onSelectSeries,
  seriesError,
  width = DEFAULT_LEFT_WIDTH,
}: ViewerLeftPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const seriesContent = series.length === 0 ? (
    <p className="text-sm text-muted-foreground">
      {seriesError ? 'Fix the issue above and refresh.' : 'No series loaded.'}
    </p>
  ) : viewMode === 'list' ? (
    <ul className="space-y-2">
      {series.map((s, idx) => (
        <li key={s.seriesInstanceUID}>
          <button
            type="button"
            onDoubleClick={() => onSelectSeries(s)}
            title="Double-click to select"
            className={`
              w-full text-left rounded-lg border transition-colors overflow-hidden
              ${activeSeriesUID === s.seriesInstanceUID ? 'bg-primary/15 border-primary/40 ring-1 ring-primary/30' : 'border-border/50 hover:bg-muted/50'}
            `}
          >
            <div className="flex gap-2 p-2">
              {s.imageIds?.[0] ? (
                <SeriesThumbnail
                  imageId={s.imageIds[0]}
                  alt={s.seriesDescription || s.modality}
                  className="shrink-0 w-14 h-14 rounded object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded bg-muted shrink-0 flex items-center justify-center text-xs font-medium text-muted-foreground">
                  {s.modality}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{s.seriesDescription || '(No description)'}</p>
                <p className="text-xs text-muted-foreground">
                  {s.modality} · S:{idx + 1} {s.numInstances}
                </p>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <div className="grid grid-cols-2 gap-2">
      {series.map((s, idx) => (
        <button
          key={s.seriesInstanceUID}
          type="button"
          onDoubleClick={() => onSelectSeries(s)}
          title="Double-click to select"
          className={`
            rounded-lg border transition-colors overflow-hidden flex flex-col items-stretch
            ${activeSeriesUID === s.seriesInstanceUID ? 'bg-primary/15 border-primary/40 ring-1 ring-primary/30' : 'border-border/50 hover:bg-muted/50'}
          `}
        >
          {s.imageIds?.[0] ? (
            <SeriesThumbnail
              imageId={s.imageIds[0]}
              alt={s.seriesDescription || s.modality}
              className="w-full aspect-square rounded-t object-cover shrink-0"
            />
          ) : (
            <div className="w-full aspect-square rounded-t bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
              {s.modality}
            </div>
          )}
          <div className="p-1.5 min-w-0">
            <p className="text-xs font-medium truncate">{s.seriesDescription || '(No description)'}</p>
            <p className="text-xs text-muted-foreground">
              S:{idx + 1} · {s.numInstances}
            </p>
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <aside
      className="shrink-0 border-r border-border/50 bg-card flex flex-col"
      style={{ width: Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, width)) }}
    >
      <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Studies</h2>
        <div className="flex items-center gap-1 text-muted-foreground">
          <button
            type="button"
            title="List view"
            className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-muted text-foreground' : 'hover:bg-muted/50'}`}
            onClick={() => setViewMode('list')}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Grid view"
            className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-muted text-foreground' : 'hover:bg-muted/50'}`}
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {studyInstanceUID && (
          <p className="text-xs text-muted-foreground mb-3 truncate" title={studyInstanceUID}>
            Study: {studyInstanceUID.slice(0, 20)}…
          </p>
        )}
        {seriesError && (
          <p className="text-xs text-destructive mb-3 p-2 rounded bg-destructive/10" title={seriesError}>
            {seriesError}
          </p>
        )}
        {seriesContent}
      </div>
    </aside>
  );
}
