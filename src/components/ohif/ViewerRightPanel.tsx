'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { Measurement } from '@/lib/ohif/types';
import { Trash2, Download, Plus, Sparkles, Loader2, XCircle, Upload, ChevronDown, Printer, Save, ChevronRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type AIResultsState = {
  report?: string;
  overlays?: unknown;
} | null;

const RIGHT_PANEL_MIN = 220;
const RIGHT_PANEL_MAX = 520;
const RIGHT_PANEL_DEFAULT = 320;
/** Below this width (px) the tab strip shows short labels (VP 1) instead of "Viewport 1". */
const TAB_SHORT_LABEL_WIDTH = 260;

const MEASUREMENT_TOOL_OPTIONS: { id: string; label: string }[] = [
  { id: 'Length', label: 'Length' },
  { id: 'Angle', label: 'Angle' },
  { id: 'RectangleROI', label: 'Rectangle ROI' },
  { id: 'EllipticalROI', label: 'Ellipse ROI' },
];

type ViewerRightPanelProps = {
  measurements: Measurement[];
  onDeleteMeasurement: (id: string) => void;
  /** Switch active tool to a measurement tool so user can draw on the image. */
  onSwitchToMeasurementTool?: (toolId: string) => void;
  onExportCSV: () => void;
  onExportSR?: () => void;
  onPrintReport?: () => void;
  onStow?: () => Promise<void>;
  /** Save measurements to database */
  onSaveMeasurements?: () => Promise<void>;
  /** AI section */
  aiResults: AIResultsState;
  aiLoading: boolean;
  aiError: string | null;
  onRunAI: () => void;
  onClearAI: () => void;
  /** Panel width in px; when provided, panel uses this width. */
  width?: number;
};

export function ViewerRightPanel({
  measurements,
  onDeleteMeasurement,
  onSwitchToMeasurementTool,
  onExportCSV,
  onExportSR,
  onPrintReport,
  onStow,
  onSaveMeasurements,
  aiResults,
  aiLoading,
  aiError,
  onRunAI,
  onClearAI,
  width = RIGHT_PANEL_DEFAULT,
}: ViewerRightPanelProps) {
  const [stowLoading, setStowLoading] = useState(false);
  const [stowError, setStowError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [selectedViewportIndex, setSelectedViewportIndex] = useState<number | null>(null);
  const [useShortTabLabels, setUseShortTabLabels] = useState(false);
  const tabStripRef = useRef<HTMLDivElement>(null);
  const panelWidth = Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, width));

  useEffect(() => {
    const el = tabStripRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number') setUseShortTabLabels(w < TAB_SHORT_LABEL_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [measurements.length]);

  const viewportIndicesWithMeasurements = useMemo(() => {
    const indices = Array.from(new Set(measurements.map((m) => m.viewportIndex))).sort((a, b) => a - b);
    return indices;
  }, [measurements]);

  const measurementsByViewport = useMemo(() => {
    const map = new Map<number, Measurement[]>();
    for (const m of measurements) {
      const list = map.get(m.viewportIndex) ?? [];
      list.push(m);
      map.set(m.viewportIndex, list);
    }
    return map;
  }, [measurements]);

  const effectiveSelectedViewport = useMemo(() => {
    if (viewportIndicesWithMeasurements.length === 0) return null;
    if (selectedViewportIndex !== null && viewportIndicesWithMeasurements.includes(selectedViewportIndex)) {
      return selectedViewportIndex;
    }
    return viewportIndicesWithMeasurements[0];
  }, [selectedViewportIndex, viewportIndicesWithMeasurements]);

  useEffect(() => {
    if (effectiveSelectedViewport !== null && selectedViewportIndex !== effectiveSelectedViewport) {
      setSelectedViewportIndex(effectiveSelectedViewport);
    }
  }, [effectiveSelectedViewport, selectedViewportIndex]);

  const selectedMeasurements = effectiveSelectedViewport !== null
    ? (measurementsByViewport.get(effectiveSelectedViewport) ?? [])
    : [];

  const handleSave = async () => {
    if (!onSaveMeasurements) return;
    setSaveError(null);
    setSaveLoading(true);
    try {
      await onSaveMeasurements();
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleStow = async () => {
    if (!onStow) return;
    setStowError(null);
    setStowLoading(true);
    try {
      await onStow();
    } catch (e) {
      setStowError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setStowLoading(false);
    }
  };

  return (
    <aside
      className="shrink-0 border-l border-border/50 bg-card flex flex-col min-w-0"
      style={{ width: panelWidth }}
    >
      <div className="px-3 py-2 border-b border-border/50">
        <h2 className="text-sm font-semibold text-foreground">Tools</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Measurements &amp; AI</p>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 p-3 space-y-4 text-sm">
        <section className="min-w-0">
          <div className="flex flex-col gap-2 mb-2">
            <h3 className="font-medium text-foreground shrink-0">Measurements</h3>
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {onSwitchToMeasurementTool && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary/15 text-primary hover:bg-primary/25"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {MEASUREMENT_TOOL_OPTIONS.map(({ id, label }) => (
                      <DropdownMenuItem
                        key={id}
                        onClick={() => onSwitchToMeasurementTool(id)}
                      >
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {measurements.length > 0 && (
                <>
                  {onSaveMeasurements && (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saveLoading}
                      className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                      title="Save measurements to database"
                    >
                      {saveLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      {savedAt ? 'Saved' : 'Save'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onExportCSV}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Download className="w-3 h-3" />
                    CSV
                  </button>
                  {onExportSR && (
                    <button
                      type="button"
                      onClick={onExportSR}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                      title="Export as DICOM SR (JSON)"
                    >
                      <Download className="w-3 h-3" />
                      SR
                    </button>
                  )}
                  {onPrintReport && (
                    <button
                      type="button"
                      onClick={onPrintReport}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                      title="Print measurement report"
                    >
                      <Printer className="w-3 h-3" />
                      Print
                    </button>
                  )}
                  {onStow && (
                    <button
                      type="button"
                      onClick={handleStow}
                      disabled={stowLoading}
                      className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                      title="Send measurement report to DICOM storage (STOW-RS)"
                    >
                      {stowLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      STOW
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {(stowError || saveError) && (
            <p className="text-xs text-destructive mt-1">{saveError ?? stowError}</p>
          )}
          {measurements.length === 0 ? (
            <p className="text-xs text-muted-foreground">Select Length, Angle, or ROI in the toolbar and draw on the image to measure.</p>
          ) : (
            <>
              <div ref={tabStripRef} className="overflow-x-auto overflow-y-hidden min-w-0" role="tablist" aria-label="Viewport measurements">
                <div className="flex border-b border-border/50 mb-2 min-w-max">
                  {viewportIndicesWithMeasurements.map((vpIndex) => (
                    <button
                      key={vpIndex}
                      type="button"
                      role="tab"
                      aria-selected={effectiveSelectedViewport === vpIndex}
                      onClick={() => setSelectedViewportIndex(vpIndex)}
                      className={`px-2 py-1.5 text-xs font-medium border-b-2 -mb-px transition shrink-0 whitespace-nowrap ${
                        effectiveSelectedViewport === vpIndex
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {useShortTabLabels ? `VP ${vpIndex + 1}` : `Viewport ${vpIndex + 1}`}
                    </button>
                  ))}
                </div>
              </div>
              {effectiveSelectedViewport !== null && (
                <details className="group mt-1" open>
                  <summary className="flex items-center gap-1 cursor-pointer list-none py-1.5 text-xs font-medium text-foreground hover:text-primary [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="w-3.5 h-3.5 transition group-open:rotate-90" />
                    Measurements ({selectedMeasurements.length})
                  </summary>
                  <ul className="space-y-2 mt-2 pl-1 min-w-0">
                    {selectedMeasurements.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 py-2 px-2 rounded-lg bg-muted/40 border border-border/30 min-w-0"
                      >
                        <div className="min-w-0 truncate">
                          <span className="font-medium capitalize">{m.type}</span>
                          <span className="text-muted-foreground ml-1">{m.value}{m.unit ? ` ${m.unit}` : ''}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteMeasurement(m.id)}
                          title="Delete"
                          className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
        <section className="min-w-0">
          <div className="flex flex-col gap-2 mb-2">
            <h3 className="font-medium text-foreground shrink-0">AI Results</h3>
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {(aiResults?.report != null || aiResults?.overlays != null) && (
                <button
                  type="button"
                  onClick={onClearAI}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground shrink-0"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={onRunAI}
                disabled={aiLoading}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none shrink-0"
              >
                {aiLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Run AI
              </button>
            </div>
          </div>
          {aiError && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{aiError}</span>
            </div>
          )}
          {aiLoading && !aiResults && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running inference…
            </p>
          )}
          {!aiLoading && aiResults?.report != null && (
            <div className="p-2 rounded-lg bg-muted/40 border border-border/30 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
              {aiResults.report}
            </div>
          )}
          {!aiLoading && aiResults != null && aiResults.report == null && aiResults.overlays == null && (
            <p className="text-xs text-muted-foreground">No results returned.</p>
          )}
          {!aiLoading && !aiResults && !aiError && (
            <p className="text-xs text-muted-foreground">Click Run AI to analyze the current series.</p>
          )}
        </section>
      </div>
    </aside>
  );
}
