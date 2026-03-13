'use client';

import {
  Sun,
  ZoomIn,
  ZoomOut,
  Hand,
  Layers,
  RotateCcw,
  LayoutGrid,
  Play,
  Square,
  Ruler,
  Move,
  RectangleHorizontal,
  Circle,
} from 'lucide-react';
import type { ViewportLayout } from '@/lib/ohif/types';

export const TOOLS = [
  { id: 'WindowLevel', label: 'Window/Level', icon: Sun },
  { id: 'Zoom', label: 'Zoom', icon: ZoomIn },
  { id: 'Pan', label: 'Pan', icon: Hand },
  { id: 'StackScroll', label: 'Stack Scroll', icon: Layers },
  { id: 'Length', label: 'Length', icon: Ruler },
  { id: 'Angle', label: 'Angle', icon: Move },
  { id: 'RectangleROI', label: 'Rectangle ROI', icon: RectangleHorizontal },
  { id: 'EllipticalROI', label: 'Ellipse ROI', icon: Circle },
] as const;

const LAYOUTS: { id: ViewportLayout; label: string }[] = [
  { id: '1x1', label: '1×1' },
  { id: '1x2', label: '1×2' },
  { id: '2x2', label: '2×2' },
];

type ViewerToolbarProps = {
  layout: ViewportLayout;
  onLayoutChange: (layout: ViewportLayout) => void;
  activeViewportIndex: number;
  cinePlaying: boolean;
  onCinePlayingChange: (playing: boolean) => void;
  activeTool?: string;
  onToolChange?: (toolId: string) => void;
  /** If provided, only these tool IDs are shown (mode-specific). */
  allowedTools?: string[];
  /** 'bright' = light icons/text on dark/blue background (ohif.org style). */
  variant?: 'default' | 'bright';
  /** Callbacks for img-based viewport; when provided, toolbar drives viewport state. */
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetViewport?: () => void;
  onResetAllViewports?: () => void;
};

export function ViewerToolbar({
  layout,
  onLayoutChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- passed by parent for future use
  activeViewportIndex,
  cinePlaying,
  onCinePlayingChange,
  activeTool: activeToolProp = 'StackScroll',
  onToolChange,
  allowedTools,
  variant = 'default',
  onZoomIn,
  onZoomOut,
  onResetViewport,
  onResetAllViewports,
}: ViewerToolbarProps) {
  const activeTool = activeToolProp;
  const toolsToShow = allowedTools?.length ? TOOLS.filter((t) => allowedTools.includes(t.id)) : TOOLS;
  const bright = variant === 'bright';
  const btnBase = bright
    ? 'flex items-center justify-center w-9 h-9 rounded-lg transition-colors text-white/90 hover:text-white hover:bg-white/20'
    : 'flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-muted/60 text-muted-foreground hover:text-foreground';
  const btnActive = bright ? 'bg-white/30 text-white' : 'bg-primary text-primary-foreground';
  const sep = bright ? 'w-px h-6 bg-white/30 mx-1' : 'w-px h-6 bg-border/50 mx-1';
  const layoutLabel = bright ? 'text-xs text-white/80 mr-1' : 'text-xs text-muted-foreground mr-1';
  const layoutBtn = bright
    ? 'px-2 py-1 rounded text-xs font-medium transition-colors text-white/90 hover:bg-white/20'
    : 'px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-muted/60 text-muted-foreground';
  const layoutBtnActive = bright ? 'bg-white/30 text-white' : 'bg-primary text-primary-foreground';

  const handleTool = (toolId: string) => {
    onToolChange?.(toolId);
  };

  const handleZoomIn = () => onZoomIn?.();
  const handleZoomOut = () => onZoomOut?.();
  const handleReset = () => onResetViewport?.();
  const handleResetAll = () => onResetAllViewports?.();

  return (
    <div className={`flex items-center gap-2 py-1.5 shrink-0 flex-wrap ${bright ? '' : 'px-2 border-b border-border/30 bg-muted/20'}`}>
      {toolsToShow.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => handleTool(id)}
          title={label}
          className={`${btnBase} ${activeTool === id ? btnActive : ''}`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
      <button type="button" onClick={handleZoomIn} title="Zoom in" className={btnBase}>
        <ZoomIn className="w-4 h-4" />
      </button>
      <button type="button" onClick={handleZoomOut} title="Zoom out" className={btnBase}>
        <ZoomOut className="w-4 h-4" />
      </button>
      <div className={sep} />
      <button type="button" onClick={handleReset} title="Reset active viewport" className={btnBase}>
        <RotateCcw className="w-4 h-4" />
      </button>
      <button type="button" onClick={handleResetAll} title="Reset all viewports" className={btnBase}>
        <LayoutGrid className="w-4 h-4" />
      </button>
      <div className={sep} />
      <div className="flex items-center gap-1">
        <span className={layoutLabel}>Layout</span>
        {LAYOUTS.map(({ id, label: l }) => (
          <button
            key={id}
            type="button"
            onClick={() => onLayoutChange(id)}
            title={`Layout ${l}`}
            className={`${layoutBtn} ${layout === id ? layoutBtnActive : ''}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className={sep} />
      <button
        type="button"
        onClick={() => onCinePlayingChange(!cinePlaying)}
        title={cinePlaying ? 'Stop cine' : 'Play cine'}
        className={`${btnBase} ${cinePlaying ? btnActive : ''}`}
      >
        {cinePlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
    </div>
  );
}
