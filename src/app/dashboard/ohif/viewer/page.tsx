'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ViewportGrid } from '@/components/ohif/ViewportGrid';
import { ViewerToolbar } from '@/components/ohif/ViewerToolbar';
import { ViewerLeftPanel } from '@/components/ohif/ViewerLeftPanel';
import { ViewerRightPanel, type AIResultsState } from '@/components/ohif/ViewerRightPanel';
import { ViewerErrorBoundary } from '@/components/ohif/ViewerErrorBoundary';
import type { ViewerSeries, ViewportLayout, Measurement, ViewportTransformState, ViewportAnnotationItem } from '@/lib/ohif/types';
import { DEFAULT_VIEWPORT_TRANSFORM } from '@/lib/ohif/types';
import { LAYOUT_GRID, CINE_FRAME_RATE } from '@/lib/ohif/viewerConfig';
import { getModeConfig } from '@/lib/ohif/modes';
import { runHangingProtocol } from '@/lib/ohif/hangingProtocols';
import { getHotkeys, formatHotkey } from '@/lib/ohif/hotkeys';
import { setActiveTool } from '@/lib/ohif/cornerstoneTools';
import { runInference } from '@/lib/ohif/aiApi';
import { isDicomWebConfigured, fetchSeriesWithInstancesForStudies, setDicomwebTokenGetter } from '@/lib/ohif/dicomweb';
import { measurementsToSRJson, downloadSrJson } from '@/lib/ohif/measurementSr';
import { getAuthHeaders } from '@/lib/authHeaders';

const PLACEHOLDER_IDS = ['test://placeholder'];
const DRAFT_STORAGE_KEY_PREFIX = 'ohif-reading-draft-';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const LEFT_PANEL_STORAGE_KEY = 'ohif-left-panel-width';
const LEFT_PANEL_MIN = 200;
const LEFT_PANEL_MAX = 500;
const LEFT_PANEL_DEFAULT = 256;
const RIGHT_PANEL_STORAGE_KEY = 'ohif-right-panel-width';
const RIGHT_PANEL_MIN = 200;
const RIGHT_PANEL_MAX = 500;
const RIGHT_PANEL_DEFAULT = 288;

/** Parse StudyInstanceUIDs from URL: comma-separated or single. Returns array of non-empty UIDs. */
function parseStudyInstanceUIDs(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getDraftStorageKey(studyUids: string[]): string {
  return DRAFT_STORAGE_KEY_PREFIX + [...studyUids].sort().join(',');
}

interface ReadingDraft {
  measurements: Measurement[];
  annotationsByKey: Record<string, ViewportAnnotationItem[]>;
  savedAt: number;
}

function loadReadingDraft(key: string): ReadingDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as ReadingDraft;
    if (!data || typeof data.savedAt !== 'number') return null;
    if (Date.now() - data.savedAt > DRAFT_MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function saveReadingDraft(key: string, measurements: Measurement[], annotationsByKey: Record<string, ViewportAnnotationItem[]>): void {
  if (typeof window === 'undefined') return;
  try {
    const data: ReadingDraft = { measurements, annotationsByKey, savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export default function OHIFViewerPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') ?? 'basic';
  const studyInstanceUIDsRaw = searchParams.get('StudyInstanceUIDs') ?? '';
  const studyInstanceUIDsArray = useMemo(
    () => parseStudyInstanceUIDs(studyInstanceUIDsRaw),
    [studyInstanceUIDsRaw]
  );

  const modeConfig = getModeConfig(mode);
  const [activeSeriesUID, setActiveSeriesUID] = useState<string | null>(null);
  const [layout, setLayout] = useState<ViewportLayout>(modeConfig.defaultLayout);
  const [activeViewportIndex, setActiveViewportIndex] = useState(0);
  const [activeTool, setActiveToolState] = useState<string>('StackScroll');
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [cinePlaying, setCinePlaying] = useState(false);
  const [aiResults, setAiResults] = useState<AIResultsState>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [seriesList, setSeriesList] = useState<ViewerSeries[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** Annotations per DICOM instance only (key = series|sop). Each file is separate — never merged. */
  const [annotationsByKey, setAnnotationsByKey] = useState<Record<string, ViewportAnnotationItem[]>>({});
  const [activeEditViewportIndex, setActiveEditViewportIndex] = useState<number | null>(null);
  const [annotationSaveError, setAnnotationSaveError] = useState<string | null>(null);
  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0);
  const [leftPanelWidth, setLeftPanelWidth] = useState(LEFT_PANEL_DEFAULT);
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT);
  const leftResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const rightResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const leftPanelWidthRef = useRef(leftPanelWidth);
  const rightPanelWidthRef = useRef(rightPanelWidth);
  leftPanelWidthRef.current = leftPanelWidth;
  rightPanelWidthRef.current = rightPanelWidth;

  const count = LAYOUT_GRID[layout].count;
  const [cellFrameIndices, setCellFrameIndices] = useState<number[]>(() => Array.from({ length: count }, () => 0));
  const [viewportStates, setViewportStates] = useState<ViewportTransformState[]>(() =>
    Array.from({ length: count }, () => ({ ...DEFAULT_VIEWPORT_TRANSFORM }))
  );

  const viewportImageIds = useMemo(() => {
    if (seriesList.length === 0) return Array.from({ length: count }, () => PLACEHOLDER_IDS);
    const selectedSeries = activeSeriesUID ? seriesList.find((s) => s.seriesInstanceUID === activeSeriesUID) : null;
    const primarySeries = selectedSeries ?? seriesList[0];
    const fallbackIds = primarySeries?.imageIds ?? seriesList[0]?.imageIds ?? PLACEHOLDER_IDS;

    // 1x1: single viewport shows selected (or first) series
    if (layout === '1x1' && count === 1) {
      return [fallbackIds];
    }

    // 1x2 and 2x2: active viewport shows selected series; other slots filled from remaining series in order
    const otherSeries = primarySeries
      ? seriesList.filter((s) => s.seriesInstanceUID !== primarySeries.seriesInstanceUID)
      : seriesList;
    return Array.from({ length: count }, (_, i) => {
      if (i === activeViewportIndex) return fallbackIds;
      const fillIndex = i < activeViewportIndex ? i : i - 1;
      const series = otherSeries[fillIndex % Math.max(1, otherSeries.length)] ?? otherSeries[0] ?? primarySeries;
      return series?.imageIds ?? fallbackIds;
    });
  }, [count, layout, seriesList, activeSeriesUID, activeViewportIndex]);

  useEffect(() => {
    try {
      const leftStored = localStorage.getItem(LEFT_PANEL_STORAGE_KEY);
      if (leftStored) {
        const w = parseInt(leftStored, 10);
        if (!Number.isNaN(w) && w >= LEFT_PANEL_MIN && w <= LEFT_PANEL_MAX) setLeftPanelWidth(w);
      }
      const rightStored = localStorage.getItem(RIGHT_PANEL_STORAGE_KEY);
      if (rightStored) {
        const w = parseInt(rightStored, 10);
        if (!Number.isNaN(w) && w >= RIGHT_PANEL_MIN && w <= RIGHT_PANEL_MAX) setRightPanelWidth(w);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const leftRef = leftResizeRef.current;
      if (leftRef) {
        const delta = e.clientX - leftRef.startX;
        const next = Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, leftRef.startWidth + delta));
        setLeftPanelWidth(next);
      }
      const rightRef = rightResizeRef.current;
      if (rightRef) {
        const delta = rightRef.startX - e.clientX;
        const next = Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, rightRef.startWidth + delta));
        setRightPanelWidth(next);
      }
    };
    const onUp = () => {
      if (leftResizeRef.current) {
        try {
          localStorage.setItem(LEFT_PANEL_STORAGE_KEY, String(leftPanelWidthRef.current));
        } catch {
          // ignore
        }
        leftResizeRef.current = null;
      }
      if (rightResizeRef.current) {
        try {
          localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(rightPanelWidthRef.current));
        } catch {
          // ignore
        }
        rightResizeRef.current = null;
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handleLeftResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    leftResizeRef.current = { startX: e.clientX, startWidth: leftPanelWidth };
  }, [leftPanelWidth]);

  const handleRightResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    rightResizeRef.current = { startX: e.clientX, startWidth: rightPanelWidth };
  }, [rightPanelWidth]);

  useEffect(() => {
    setCellFrameIndices((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push(0);
      return next;
    });
    setViewportStates((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push({ ...DEFAULT_VIEWPORT_TRANSFORM });
      return next;
    });
  }, [count]);

  useEffect(() => {
    setDicomwebTokenGetter(async () => {
      const h = await getAuthHeaders();
      const auth = (h as Record<string, string>).Authorization;
      if (auth?.startsWith('Bearer ')) return auth.slice(7);
      return null;
    });
    return () => setDicomwebTokenGetter(null);
  }, []);

  useEffect(() => {
    if (studyInstanceUIDsArray.length === 0) {
      setSeriesList([]);
      setSeriesError(null);
      return;
    }
    if (!isDicomWebConfigured()) {
      setSeriesList([]);
      setSeriesError('DICOM API URL not set. Set NEXT_PUBLIC_OHIF_DICOMWEB_URL to your app API (e.g. /api/ohif/dicom-web) or leave unset to use the default.');
      return;
    }
    let cancelled = false;
    setSeriesLoading(true);
    setSeriesError(null);
    fetchSeriesWithInstancesForStudies(studyInstanceUIDsArray).then(({ series, error }) => {
      if (cancelled) return;
      setSeriesLoading(false);
      if (error) {
        setSeriesError(error);
        setSeriesList([]);
        return;
      }
      if (series.length > 0) {
        setSeriesList(series.map((s) => ({ ...s, imageIds: s.imageIds?.length ? s.imageIds : PLACEHOLDER_IDS })));
      } else {
        setSeriesError('No DICOM images found for these study IDs. The study list only shows studies that have images. If you opened from an old link, use "Back to study list" and open a patient from the list, or upload DICOM via Add Patient.');
        setSeriesList([]);
      }
    });
    return () => { cancelled = true; };
  }, [studyInstanceUIDsArray, studyInstanceUIDsRaw]);

  useEffect(() => {
    if (!cinePlaying) return;
    const ms = 1000 / CINE_FRAME_RATE;
    const id = setInterval(() => {
      setCellFrameIndices((prev) => {
        const total = viewportImageIds[activeViewportIndex]?.length ?? 1;
        const next = [...prev];
        next[activeViewportIndex] = (prev[activeViewportIndex] + 1) % total;
        return next;
      });
    }, ms);
    return () => clearInterval(id);
  }, [cinePlaying, activeViewportIndex, viewportImageIds]);

  useEffect(() => {
    const first = seriesList[0];
    if (first) setActiveSeriesUID(first.seriesInstanceUID);
  }, [studyInstanceUIDsArray, seriesList]);

  // Document title for tab/window (reading UI polish)
  useEffect(() => {
    const base = 'OHIF Viewer';
    if (seriesList.length > 0) {
      const label = seriesList[0]?.modality ?? 'Study';
      document.title = `${base} – ${label}`;
    } else {
      document.title = base;
    }
    return () => { document.title = 'AImpact'; };
  }, [seriesList]);

  const draftRestoredRef = useRef(false);

  // Load viewport annotations for every study in the URL; restore draft if available (save draft reading state)
  useEffect(() => {
    if (studyInstanceUIDsArray.length === 0 || !user?.uid) {
      setAnnotationsByKey({});
      draftRestoredRef.current = false;
      return;
    }
    const draftKey = getDraftStorageKey(studyInstanceUIDsArray);
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const next: Record<string, ViewportAnnotationItem[]> = {};
        for (const studyUid of studyInstanceUIDsArray) {
          if (!studyUid || cancelled) continue;
          const params = new URLSearchParams({ studyInstanceUID: studyUid, userId: user.uid });
          const res = await fetch(`/api/ohif/annotations?${params.toString()}`, { headers });
          if (!res.ok || cancelled) continue;
          const data = (await res.json()) as { items?: Array<{ seriesInstanceUID: string; sopInstanceUID: string; payload: string }> } | null;
          if (!data?.items || !Array.isArray(data.items)) continue;
          for (const item of data.items) {
            try {
              const parsed = JSON.parse(item.payload) as ViewportAnnotationItem[];
              const key = `${studyUid}|${item.seriesInstanceUID}|${item.sopInstanceUID}`;
              next[key] = Array.isArray(parsed) ? parsed : [];
            } catch {
              // skip invalid payload
            }
          }
        }
        if (cancelled) return;
        const primaryStudy = studyInstanceUIDsArray[0];
        let serverMeasurements: Measurement[] = [];
        if (primaryStudy) {
          const measParams = new URLSearchParams({ studyInstanceUID: primaryStudy, userId: user.uid });
          const measRes = await fetch(`/api/ohif/measurements?${measParams.toString()}`, { headers });
          if (!cancelled && measRes.ok) {
            const measData = (await measRes.json()) as { measurements?: unknown };
            if (Array.isArray(measData.measurements) && measData.measurements.length > 0) {
              serverMeasurements = measData.measurements as Measurement[];
            }
          }
        }
        if (cancelled) return;
        const draft = loadReadingDraft(draftKey);
        if (serverMeasurements.length > 0) {
          setMeasurements(serverMeasurements);
          setAnnotationsByKey(draft?.annotationsByKey ?? next);
          draftRestoredRef.current = true;
        } else if (draft) {
          setMeasurements(draft.measurements);
          setAnnotationsByKey(draft.annotationsByKey);
          draftRestoredRef.current = true;
        } else {
          setMeasurements([]);
          setAnnotationsByKey(next);
          draftRestoredRef.current = false;
        }
      } catch {
        if (!cancelled) setAnnotationsByKey({});
        draftRestoredRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [studyInstanceUIDsArray, user?.uid]);

  // Persist draft (measurements + annotations) so reader can return later
  useEffect(() => {
    if (studyInstanceUIDsArray.length === 0) return;
    if (draftRestoredRef.current) {
      const t = setTimeout(() => { draftRestoredRef.current = false; }, 500);
      return () => clearTimeout(t);
    }
    const key = getDraftStorageKey(studyInstanceUIDsArray);
    const timer = setTimeout(() => {
      saveReadingDraft(key, measurements, annotationsByKey);
    }, 1500);
    return () => clearTimeout(timer);
  }, [studyInstanceUIDsArray, measurements, annotationsByKey]);

  useEffect(() => {
    if (seriesList.length === 0) return;
    const { layout: protocolLayout } = runHangingProtocol(seriesList, mode);
    setLayout(protocolLayout);
  }, [seriesList, mode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.closest('input') || e.target.closest('textarea'))) return;
      const key = e.key;
      if (e.shiftKey && key === '?') {
        setShortcutsOpen((o) => !o);
        e.preventDefault();
        return;
      }
      if (shortcutsOpen && key === 'Escape') {
        setShortcutsOpen(false);
        return;
      }
      if (key === 'Escape' && activeEditViewportIndex !== null) {
        setAnnotationSaveError(null);
        setActiveEditViewportIndex(null);
        return;
      }
      switch (key) {
        case 'r':
        case 'R':
          if (e.altKey) {
            setViewportStates((prev) => prev.map(() => ({ ...DEFAULT_VIEWPORT_TRANSFORM })));
          } else {
            setViewportStates((prev) => {
              const next = [...prev];
              if (next[activeViewportIndex]) next[activeViewportIndex] = { ...DEFAULT_VIEWPORT_TRANSFORM };
              return next;
            });
          }
          break;
        case '1':
          setLayout('1x1');
          break;
        case '2':
          setLayout('1x2');
          break;
        case '3':
          setLayout('2x2');
          break;
        case 'w':
        case 'W':
          if (!e.ctrlKey && !e.metaKey) handleToolChange('WindowLevel');
          break;
        case 'z':
        case 'Z':
          if (!e.ctrlKey && !e.metaKey) handleToolChange('Zoom');
          break;
        case 'p':
        case 'P':
          handleToolChange('Pan');
          break;
        case 's':
        case 'S':
          handleToolChange('StackScroll');
          break;
        case ' ':
          e.preventDefault();
          setCinePlaying((p) => !p);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          setCellFrameIndices((prev) => {
            const total = viewportImageIds[activeViewportIndex]?.length ?? 1;
            const next = [...prev];
            next[activeViewportIndex] = (prev[activeViewportIndex] - 1 + total) % total;
            return next;
          });
          e.preventDefault();
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          setCellFrameIndices((prev) => {
            const total = viewportImageIds[activeViewportIndex]?.length ?? 1;
            const next = [...prev];
            next[activeViewportIndex] = (prev[activeViewportIndex] + 1) % total;
            return next;
          });
          e.preventDefault();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeViewportIndex, activeEditViewportIndex, shortcutsOpen, viewportImageIds]);

  const handleSelectSeries = (series: ViewerSeries) => {
    setActiveSeriesUID(series.seriesInstanceUID);
  };

  const handleToolChange = (toolId: string) => {
    setActiveToolState(toolId);
    setActiveTool(toolId);
  };

  const handleCellFrameChange = (cellIndex: number, frameIndex: number) => {
    setCellFrameIndices((prev) => {
      const next = [...prev];
      next[cellIndex] = frameIndex;
      return next;
    });
  };

  const handleViewportStateChange = (cellIndex: number, partial: Partial<ViewportTransformState>) => {
    setViewportStates((prev) => {
      const next = [...prev];
      const current = next[cellIndex] ?? { ...DEFAULT_VIEWPORT_TRANSFORM };
      next[cellIndex] = { ...current, ...partial };
      return next;
    });
  };

  const handleZoomIn = () => {
    setViewportStates((prev) => {
      const next = [...prev];
      const cur = next[activeViewportIndex] ?? { ...DEFAULT_VIEWPORT_TRANSFORM };
      next[activeViewportIndex] = { ...cur, scale: Math.min(5, cur.scale * 1.25) };
      return next;
    });
  };

  const handleZoomOut = () => {
    setViewportStates((prev) => {
      const next = [...prev];
      const cur = next[activeViewportIndex] ?? { ...DEFAULT_VIEWPORT_TRANSFORM };
      next[activeViewportIndex] = { ...cur, scale: Math.max(0.25, cur.scale / 1.25) };
      return next;
    });
  };

  const handleResetViewport = () => {
    setViewportStates((prev) => {
      const next = [...prev];
      next[activeViewportIndex] = { ...DEFAULT_VIEWPORT_TRANSFORM };
      return next;
    });
  };

  const handleResetAllViewports = () => {
    setViewportStates((prev) => prev.map(() => ({ ...DEFAULT_VIEWPORT_TRANSFORM })));
  };

  const handleRunAI = async () => {
    setAiError(null);
    setAiLoading(true);
    try {
      const series = seriesList[activeViewportIndex] ?? seriesList[0];
      const result = await runInference({
        studyInstanceUID: studyInstanceUIDsRaw || undefined,
        seriesInstanceUID: series?.seriesInstanceUID,
        viewportIndex: activeViewportIndex,
      });
      setAiResults(result);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Inference failed');
      setAiResults(null);
    } finally {
      setAiLoading(false);
    }
  };

  const handleClearAI = () => {
    setAiResults(null);
    setAiError(null);
  };

  /** Saves annotations for a single DICOM instance only. One instance per save — never mixed. */
  const handleSaveAnnotations = useCallback(
    async (params: { study: string; series: string; sop: string; items: ViewportAnnotationItem[] }) => {
      setAnnotationSaveError(null);
      const { study, series, sop, items } = params;
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/ohif/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            studyInstanceUID: study,
            seriesInstanceUID: series,
            sopInstanceUID: sop,
            payload: JSON.stringify(items),
            ...(user?.uid && { userId: user.uid }),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to save annotations');
        const key = `${study}|${series}|${sop}`;
        setAnnotationsByKey((prev) => ({ ...prev, [key]: items }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to save annotations';
        setAnnotationSaveError(msg);
        throw e;
      }
    },
    [user?.uid]
  );

  return (
    <ViewerErrorBoundary key={errorBoundaryKey} onRetry={() => setErrorBoundaryKey((k) => k + 1)}>
      <div className="flex flex-col h-screen bg-background">
        <header className="flex flex-wrap items-center gap-3 gap-y-2 px-4 py-2 border-b border-border/50 bg-card shrink-0">
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center" aria-hidden>
                <span className="text-primary font-bold text-sm">OH</span>
              </div>
              <span className="text-sm font-semibold text-foreground hidden sm:inline">Open Health Imaging Foundation</span>
            </div>
            <Link
              href="/dashboard/ohif"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to study list
            </Link>
          </div>
          <span className="text-sm font-medium capitalize text-foreground shrink-0">
            Mode: {mode.replace(/-/g, ' ')}
          </span>
          <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={studyInstanceUIDsRaw}>
            Study: {studyInstanceUIDsArray.length > 1 ? 'Multiple studies' : studyInstanceUIDsRaw || '—'}
          </span>
          {seriesLoading && <span className="text-xs text-muted-foreground">Loading series…</span>}
          {seriesError && (
            <span className="text-xs text-destructive" role="alert" title={seriesError}>
              Series: {seriesError}
              {seriesError.includes('failed') && ' — If the server was just restarted, wait a moment and refresh.'}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border/50 shrink-0"
            title="Keyboard shortcuts (Shift+?)"
          >
            ?
          </button>
        </header>

      <div className="flex-1 flex min-h-0">
        <ViewerLeftPanel
          studyInstanceUID={studyInstanceUIDsRaw}
          series={seriesList}
          activeSeriesUID={activeSeriesUID}
          onSelectSeries={handleSelectSeries}
          seriesError={seriesError}
          width={leftPanelWidth}
        />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize left panel"
          className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors flex-shrink-0"
          onMouseDown={handleLeftResizeStart}
          style={{ userSelect: 'none' }}
        />
        <div className="flex-1 flex flex-col min-w-0 bg-muted/10">
          {/* Toolbar: dark slate (no blue) */}
          <div className="bg-slate-700 px-3 py-2 shrink-0">
            <ViewerToolbar
              layout={layout}
              onLayoutChange={setLayout}
              activeViewportIndex={activeViewportIndex}
              cinePlaying={cinePlaying}
              onCinePlayingChange={setCinePlaying}
              activeTool={activeTool}
              onToolChange={handleToolChange}
              allowedTools={modeConfig.toolbarTools}
              variant="bright"
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onResetViewport={handleResetViewport}
              onResetAllViewports={handleResetAllViewports}
            />
          </div>
          {annotationSaveError && (
            <div className="px-3 py-1.5 bg-destructive/15 text-destructive text-xs rounded" role="alert">
              {annotationSaveError}
            </div>
          )}
          <div className="flex-1 min-h-0 min-h-[400px] p-2 flex flex-col">
            <ViewportGrid
              studyInstanceUID={studyInstanceUIDsRaw}
              layout={layout}
              viewportImageIds={viewportImageIds}
              activeViewportIndex={activeViewportIndex}
              onActiveViewportChange={setActiveViewportIndex}
              onViewportDoubleClick={(i) => setActiveViewportIndex(i)}
              cellFrameIndices={cellFrameIndices}
              onCellFrameChange={handleCellFrameChange}
              viewportStates={viewportStates}
              onViewportStateChange={handleViewportStateChange}
              activeTool={activeTool}
              annotationsByKey={annotationsByKey}
              activeEditViewportIndex={activeEditViewportIndex}
              onEnterEditMode={setActiveEditViewportIndex}
              onSaveAnnotations={handleSaveAnnotations}
              onCancelEdit={() => {
                setAnnotationSaveError(null);
                setActiveEditViewportIndex(null);
              }}
              measurements={measurements}
              onMeasurementComplete={(m) => setMeasurements((prev) => [...prev, m])}
              className="w-full h-full"
            />
          </div>
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize right panel"
          className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors flex-shrink-0"
          onMouseDown={handleRightResizeStart}
          style={{ userSelect: 'none' }}
        />
        <ViewerRightPanel
          width={rightPanelWidth}
          measurements={measurements}
          onDeleteMeasurement={(id) => setMeasurements((m) => m.filter((x) => x.id !== id))}
          onExportCSV={() => {
            if (measurements.length === 0) return;
            const header = 'Type,Value,Unit,Viewport,Created\n';
            const rows = measurements.map((m) => `${m.type},${m.value},${m.unit ?? ''},${m.viewportIndex},${new Date(m.createdAt).toISOString()}`).join('\n');
            const blob = new Blob([header + rows], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `measurements-${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          onExportSR={() => {
            if (measurements.length === 0) return;
            const report = measurementsToSRJson(measurements, {
              studyInstanceUID: studyInstanceUIDsRaw || undefined,
              seriesInstanceUID: seriesList[0]?.seriesInstanceUID,
            });
            downloadSrJson(report);
          }}
          onPrintReport={() => {
            const win = window.open('', '_blank', 'noopener,noreferrer');
            if (!win) return;
            const studyLabel = studyInstanceUIDsArray.length > 1
              ? `${studyInstanceUIDsArray.length} studies`
              : (studyInstanceUIDsRaw || '—');
            const rows = measurements
              .map((m) => `<tr><td>${m.type}</td><td>${m.value}</td><td>${m.unit ?? '—'}</td><td>VP ${m.viewportIndex}</td><td>${new Date(m.createdAt).toLocaleString()}</td></tr>`)
              .join('');
            win.document.write(`
              <!DOCTYPE html><html><head><title>Measurement Report</title>
              <style>body{font-family:sans-serif;padding:1.5rem;max-width:800px;margin:0 auto}
              h1{font-size:1.25rem;margin-bottom:0.5rem} table{border-collapse:collapse;width:100%;margin-top:1rem}
              th,td{border:1px solid #ccc;padding:0.5rem;text-align:left} th{background:#f5f5f5}
              .meta{color:#666;font-size:0.875rem;margin-bottom:1rem}</style></head><body>
              <h1>Measurement Report</h1>
              <p class="meta">Study: ${studyLabel} · Generated ${new Date().toLocaleString()}</p>
              <table><thead><tr><th>Type</th><th>Value</th><th>Unit</th><th>Viewport</th><th>Date</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No measurements</td></tr>'}</tbody></table>
              </body></html>`);
            win.document.close();
            win.focus();
            setTimeout(() => { win.print(); }, 250);
          }}
          onStow={async () => {
            if (measurements.length === 0) return;
            const headers = await getAuthHeaders();
            const res = await fetch('/api/ohif/stow', {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                studyInstanceUID: studyInstanceUIDsRaw || undefined,
                measurements: measurements.map((m) => ({
                  id: m.id,
                  type: m.type,
                  value: m.value,
                  unit: m.unit,
                  viewportIndex: m.viewportIndex,
                  createdAt: m.createdAt,
                })),
                ...(user?.uid && { userId: user.uid }),
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'STOW failed');
          }}
          onSaveMeasurements={async () => {
            const studyUID = studyInstanceUIDsArray[0];
            if (!studyUID) throw new Error('No study selected');
            const headers = await getAuthHeaders();
            const res = await fetch('/api/ohif/measurements', {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                studyInstanceUID: studyUID,
                measurements,
                ...(user?.uid && { userId: user.uid }),
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Save failed');
            saveReadingDraft(getDraftStorageKey(studyInstanceUIDsArray), measurements, annotationsByKey);
          }}
          aiResults={aiResults}
          aiLoading={aiLoading}
          aiError={aiError}
          onRunAI={handleRunAI}
          onClearAI={handleClearAI}
          onSwitchToMeasurementTool={(toolId) => handleToolChange(toolId)}
        />
      </div>
      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-label="Keyboard shortcuts"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                Esc
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              {getHotkeys().map((h, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <kbd className="px-2 py-1 rounded bg-muted font-mono text-xs">{formatHotkey(h)}</kbd>
                  <span className="text-muted-foreground">{h.description}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
    </ViewerErrorBoundary>
  );
}
