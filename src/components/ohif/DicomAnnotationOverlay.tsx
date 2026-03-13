'use client';

import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import type {
  ViewportAnnotationItem,
  NormPoint,
  AnnotationToolType,
  CommentType,
  MarkType,
} from '@/lib/ohif/types';
import { Square, Circle, ArrowRight, Type, Star, Save, X, ChevronDown, Ruler, Undo2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ffffff',
  '#000000',
];

const COMMENT_TYPES: { value: CommentType; label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'finding', label: 'Finding' },
  { value: 'question', label: 'Question' },
  { value: 'critical', label: 'Critical' },
  { value: 'info', label: 'Info' },
];

const MARK_TYPES: { value: MarkType; label: string }[] = [
  { value: 'circle', label: '○' },
  { value: 'arrow', label: '→' },
  { value: 'star', label: '★' },
  { value: 'check', label: '✓' },
  { value: 'x', label: '✕' },
];

/** Font size for text comments (normalized 0–1 for SVG viewBox). 20pt–40pt for readability. */
const FONT_SIZE_OPTIONS: { value: number; label: string }[] = [
  { value: 0.025, label: '20' },
  { value: 0.03, label: '24' },
  { value: 0.036, label: '28' },
  { value: 0.042, label: '32' },
  { value: 0.048, label: '36' },
  { value: 0.055, label: '40' },
];

/** Default normalized size of text comment box. */
const TEXT_BOX_W = 0.15;
const TEXT_BOX_H = 0.06;
/** Min size when resizing. */
const TEXT_BOX_MIN_W = 0.08;
const TEXT_BOX_MIN_H = 0.04;
/** Resize handle size (normalized). */
const RESIZE_HANDLE = 0.02;

function genId(): string {
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function screenToNormalized(
  clientX: number,
  clientY: number,
  imgRect: DOMRect
): NormPoint {
  const x = (clientX - imgRect.left) / imgRect.width;
  const y = (clientY - imgRect.top) / imgRect.height;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

function cloneAnnotations(items: ViewportAnnotationItem[]): ViewportAnnotationItem[] {
  return items.map((item) => ({ ...item }));
}

export interface DicomAnnotationOverlayProps {
  imageRef: React.RefObject<HTMLImageElement | null>;
  annotations: ViewportAnnotationItem[];
  isEditMode: boolean;
  isDirty?: boolean;
  canUndo?: boolean;
  onUndo?: () => void;
  onAnnotationsChange: (items: ViewportAnnotationItem[]) => void;
  onCommitEditAction?: (action: { before: ViewportAnnotationItem[]; after: ViewportAnnotationItem[] }) => void;
  onSave: (items: ViewportAnnotationItem[]) => void;
  onCancel: () => void;
  className?: string;
}

export function DicomAnnotationOverlay({
  imageRef,
  annotations,
  isEditMode,
  isDirty = false,
  canUndo = false,
  onUndo,
  onAnnotationsChange,
  onCommitEditAction,
  onSave,
  onCancel,
  className = '',
}: DicomAnnotationOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<ViewportAnnotationItem | null>(null);
  const imgRectRef = useRef<DOMRect | null>(null);
  const [tool, setTool] = useState<AnnotationToolType>('rectangle');
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [commentType, setCommentType] = useState<CommentType>('note');
  const [commentFontSize, setCommentFontSize] = useState<number>(0.025);
  const [markType, setMarkType] = useState<MarkType>('circle');
  const [draft, setDraft] = useState<ViewportAnnotationItem | null>(null);
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState<NormPoint | null>(null);
  const [draggingCommentId, setDraggingCommentId] = useState<string | null>(null);
  const [resizingCommentId, setResizingCommentId] = useState<string | null>(null);
  const [imgRect, setImgRect] = useState<DOMRect | null>(null);
  const [overlayRect, setOverlayRect] = useState<DOMRect | null>(null);
  const annotationsRef = useRef<ViewportAnnotationItem[]>(annotations);
  const dragOrResizeChangedRef = useRef(false);
  const interactionStartAnnotationsRef = useRef<ViewportAnnotationItem[]>([]);

  draftRef.current = draft;
  imgRectRef.current = imgRect;
  annotationsRef.current = annotations;

  const updateRects = useCallback(() => {
    const img = imageRef.current;
    const ov = overlayRef.current;
    if (img) setImgRect(img.getBoundingClientRect());
    if (ov) setOverlayRect(ov.getBoundingClientRect());
  }, [imageRef]);

  useLayoutEffect(() => {
    updateRects();
  }, [updateRects, isEditMode]);

  useEffect(() => {
    const img = imageRef.current;
    const ov = overlayRef.current;
    const ro = new ResizeObserver(updateRects);
    if (img) ro.observe(img);
    if (ov) ro.observe(ov);
    return () => ro.disconnect();
  }, [imageRef, updateRects]);

  const commitAction = useCallback(
    (beforeItems: ViewportAnnotationItem[], afterItems: ViewportAnnotationItem[]) => {
      const before = cloneAnnotations(beforeItems);
      const after = cloneAnnotations(afterItems);
      onAnnotationsChange(after);
      onCommitEditAction?.({ before, after });
    },
    [onAnnotationsChange, onCommitEditAction]
  );

  const addAnnotation = useCallback(
    (item: ViewportAnnotationItem, beforeItems?: ViewportAnnotationItem[]) => {
      const before = beforeItems ?? annotations;
      const next = [...before, item];
      commitAction(before, next);
      setDraft(null);
      setTextPosition(null);
      setTextInput('');
    },
    [annotations, commitAction]
  );

  const getTextBoxSize = useCallback((item: { w?: number; h?: number }) => ({
    w: typeof item.w === 'number' && item.w >= TEXT_BOX_MIN_W ? item.w : TEXT_BOX_W,
    h: typeof item.h === 'number' && item.h >= TEXT_BOX_MIN_H ? item.h : TEXT_BOX_H,
  }), []);

  /** Find topmost text annotation containing normalized point (for drag hit-test). */
  const getTextAnnotationAt = useCallback(
    (pt: NormPoint): ViewportAnnotationItem | undefined => {
      for (let i = annotations.length - 1; i >= 0; i--) {
        const item = annotations[i];
        if (item.type !== 'text') continue;
        const { w, h } = getTextBoxSize(item);
        if (pt.x >= item.x && pt.x <= item.x + w && pt.y >= item.y && pt.y <= item.y + h) {
          return item;
        }
      }
      return undefined;
    },
    [annotations, getTextBoxSize]
  );

  /** Find text annotation whose resize handle (bottom-right) contains pt. */
  const getTextResizeHit = useCallback(
    (pt: NormPoint): ViewportAnnotationItem | undefined => {
      for (let i = annotations.length - 1; i >= 0; i--) {
        const item = annotations[i];
        if (item.type !== 'text') continue;
        const { w, h } = getTextBoxSize(item);
        const rx = item.x + w;
        const ry = item.y + h;
        if (
          pt.x >= rx - RESIZE_HANDLE && pt.x <= rx &&
          pt.y >= ry - RESIZE_HANDLE && pt.y <= ry
        ) {
          return item;
        }
      }
      return undefined;
    },
    [annotations, getTextBoxSize]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isEditMode || !imgRect) return;
      e.preventDefault();
      const pt = screenToNormalized(e.clientX, e.clientY, imgRect);
      if (tool === 'text') {
        const resizeHit = getTextResizeHit(pt);
        if (resizeHit) {
          interactionStartAnnotationsRef.current = cloneAnnotations(annotations);
          dragOrResizeChangedRef.current = false;
          setResizingCommentId(resizeHit.id);
        } else {
          const hit = getTextAnnotationAt(pt);
          if (hit) {
            interactionStartAnnotationsRef.current = cloneAnnotations(annotations);
            dragOrResizeChangedRef.current = false;
            setDraggingCommentId(hit.id);
          } else {
            setTextPosition(pt);
          }
        }
      } else if (tool === 'rectangle' || tool === 'ellipse') {
        const next = {
          id: genId(),
          type: tool,
          x: pt.x,
          y: pt.y,
          w: 0,
          h: 0,
          color,
          strokeWidth,
          createdAt: Date.now(),
        } as ViewportAnnotationItem;
        interactionStartAnnotationsRef.current = cloneAnnotations(annotations);
        draftRef.current = next;
        setDraft(next);
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (tool === 'arrow') {
        const next = {
          id: genId(),
          type: 'arrow',
          x1: pt.x,
          y1: pt.y,
          x2: pt.x,
          y2: pt.y,
          color,
          strokeWidth,
          createdAt: Date.now(),
        } as ViewportAnnotationItem;
        interactionStartAnnotationsRef.current = cloneAnnotations(annotations);
        draftRef.current = next;
        setDraft(next);
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (tool === 'ruler') {
        const next = {
          id: genId(),
          type: 'ruler',
          x1: pt.x,
          y1: pt.y,
          x2: pt.x,
          y2: pt.y,
          color,
          strokeWidth,
          createdAt: Date.now(),
        } as ViewportAnnotationItem;
        interactionStartAnnotationsRef.current = cloneAnnotations(annotations);
        draftRef.current = next;
        setDraft(next);
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (tool === 'mark') {
        const before = cloneAnnotations(annotations);
        addAnnotation({
          id: genId(),
          type: 'mark',
          x: pt.x,
          y: pt.y,
          markType,
          color,
          size: 0.03,
          createdAt: Date.now(),
        }, before);
      }
    },
    [
      isEditMode,
      imgRect,
      annotations,
      tool,
      color,
      strokeWidth,
      markType,
      addAnnotation,
      getTextAnnotationAt,
      getTextResizeHit,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isEditMode || !imgRect) return;
      const pt = screenToNormalized(e.clientX, e.clientY, imgRect);
      if (resizingCommentId) {
        const idx = annotations.findIndex((a) => a.type === 'text' && a.id === resizingCommentId);
        if (idx >= 0) {
          const item = annotations[idx];
          if (item.type === 'text') {
            const w = Math.max(TEXT_BOX_MIN_W, Math.min(1 - item.x, pt.x - item.x));
            const h = Math.max(TEXT_BOX_MIN_H, Math.min(1 - item.y, pt.y - item.y));
            const updated = { ...item, w, h };
            const next = [...annotations];
            next[idx] = updated;
            onAnnotationsChange(next);
            dragOrResizeChangedRef.current = true;
          }
        }
        return;
      }
      if (draggingCommentId) {
        const idx = annotations.findIndex((a) => a.type === 'text' && a.id === draggingCommentId);
        if (idx >= 0) {
          const item = annotations[idx];
          if (item.type === 'text') {
            const { w, h } = getTextBoxSize(item);
            const x = Math.max(0, Math.min(1 - w, pt.x));
            const y = Math.max(0, Math.min(1 - h, pt.y));
            const updated = { ...item, x, y };
            const next = [...annotations];
            next[idx] = updated;
            onAnnotationsChange(next);
            dragOrResizeChangedRef.current = true;
          }
        }
        return;
      }
      const current = draftRef.current;
      if (!current) return;
      if (current.type === 'rectangle' || current.type === 'ellipse') {
        const w = pt.x - current.x;
        const h = pt.y - current.y;
        const next = { ...current, w, h };
        draftRef.current = next;
        setDraft(next);
      } else if (current.type === 'arrow' || current.type === 'ruler') {
        const next = { ...current, x2: pt.x, y2: pt.y };
        draftRef.current = next;
        setDraft(next);
      }
    },
    [isEditMode, imgRect, resizingCommentId, draggingCommentId, annotations, onAnnotationsChange, getTextBoxSize]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const hadTextDragOrResize = draggingCommentId !== null || resizingCommentId !== null;
      setDraggingCommentId(null);
      setResizingCommentId(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      const cur = draftRef.current;
      if (cur) {
        if (
          (cur.type === 'rectangle' || cur.type === 'ellipse') &&
          (Math.abs(cur.w) > 0.01 || Math.abs(cur.h) > 0.01)
        ) {
          const normalized = {
            ...cur,
            x: cur.w < 0 ? cur.x + cur.w : cur.x,
            y: cur.h < 0 ? cur.y + cur.h : cur.y,
            w: Math.abs(cur.w),
            h: Math.abs(cur.h),
          };
          addAnnotation(normalized, interactionStartAnnotationsRef.current);
        } else if (cur.type === 'arrow' || cur.type === 'ruler') {
          const len = Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1);
          if (len >= 0.001) addAnnotation(cur, interactionStartAnnotationsRef.current);
        }
      }
      if (hadTextDragOrResize && dragOrResizeChangedRef.current) {
        commitAction(interactionStartAnnotationsRef.current, annotationsRef.current);
      }
      dragOrResizeChangedRef.current = false;
      draftRef.current = null;
      setDraft(null);
    },
    [addAnnotation, draggingCommentId, resizingCommentId, commitAction]
  );

  const submitText = useCallback(() => {
    if (textPosition && textInput.trim()) {
      const before = cloneAnnotations(annotations);
      addAnnotation({
        id: genId(),
        type: 'text',
        x: textPosition.x,
        y: textPosition.y,
        w: TEXT_BOX_W,
        h: TEXT_BOX_H,
        text: textInput.trim(),
        commentType,
        color,
        fontSize: commentFontSize,
        createdAt: Date.now(),
      }, before);
      setTextInput('');
      setTextPosition(null);
    }
  }, [annotations, textPosition, textInput, commentType, commentFontSize, color, addAnnotation]);

  useEffect(() => {
    if (!isEditMode || !onUndo) return;
    const handleUndoShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      if (!canUndo) return;
      event.preventDefault();
      onUndo();
    };
    window.addEventListener('keydown', handleUndoShortcut);
    return () => window.removeEventListener('keydown', handleUndoShortcut);
  }, [isEditMode, canUndo, onUndo]);

  const renderItem = (item: ViewportAnnotationItem, isDraft = false) => {
    const opacity = isDraft ? 0.8 : 1;
    const stroke = item.color ?? '#ffffff';
    const baseSw = (item.strokeWidth ?? 2) * 0.004;
    const sw = Math.max(0.003, Math.min(0.03, baseSw));

    if (item.type === 'rectangle' && typeof item.w === 'number' && typeof item.h === 'number') {
      return (
        <rect
          key={item.id}
          x={item.x}
          y={item.y}
          width={Math.abs(item.w)}
          height={Math.abs(item.h)}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          opacity={opacity}
        />
      );
    }
    if (item.type === 'ellipse' && typeof item.w === 'number' && typeof item.h === 'number') {
      const rw = Math.abs(item.w) / 2;
      const rh = Math.abs(item.h) / 2;
      if (rw < 1e-6 && rh < 1e-6) return null;
      return (
        <ellipse
          key={item.id}
          cx={item.x + item.w / 2}
          cy={item.y + item.h / 2}
          rx={rw}
          ry={rh}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          opacity={opacity}
        />
      );
    }
    if (
      item.type === 'arrow' &&
      typeof item.x1 === 'number' &&
      typeof item.y1 === 'number' &&
      typeof item.x2 === 'number' &&
      typeof item.y2 === 'number'
    ) {
      const dx = item.x2 - item.x1;
      const dy = item.y2 - item.y1;
      const len = Math.hypot(dx, dy) || 0.001;
      const ux = dx / len;
      const uy = dy / len;
      const arrowSize = 0.03;
      return (
        <g key={item.id} opacity={opacity}>
          <line
            x1={item.x1}
            y1={item.y1}
            x2={item.x2}
            y2={item.y2}
            stroke={stroke}
            strokeWidth={sw}
            vectorEffect="non-scaling-stroke"
          />
          {len >= 1e-6 && (
            <polygon
              points={`${item.x2},${item.y2} ${item.x2 - ux * arrowSize + uy * arrowSize * 0.5},${item.y2 - uy * arrowSize - ux * arrowSize * 0.5} ${item.x2 - ux * arrowSize - uy * arrowSize * 0.5},${item.y2 - uy * arrowSize + ux * arrowSize * 0.5}`}
              fill={stroke}
            />
          )}
        </g>
      );
    }
    if (
      item.type === 'ruler' &&
      typeof item.x1 === 'number' &&
      typeof item.y1 === 'number' &&
      typeof item.x2 === 'number' &&
      typeof item.y2 === 'number'
    ) {
      const dx = item.x2 - item.x1;
      const dy = item.y2 - item.y1;
      const len = Math.hypot(dx, dy) || 0.001;
      const ux = dx / len;
      const uy = dy / len;
      const arrowSize = 0.03;
      return (
        <g key={item.id} opacity={opacity}>
          <line
            x1={item.x1}
            y1={item.y1}
            x2={item.x2}
            y2={item.y2}
            stroke={stroke}
            strokeWidth={sw}
            vectorEffect="non-scaling-stroke"
          />
          {len >= 1e-6 && (
            <>
              <polygon
                points={`${item.x2},${item.y2} ${item.x2 - ux * arrowSize + uy * arrowSize * 0.5},${item.y2 - uy * arrowSize - ux * arrowSize * 0.5} ${item.x2 - ux * arrowSize - uy * arrowSize * 0.5},${item.y2 - uy * arrowSize + ux * arrowSize * 0.5}`}
                fill={stroke}
              />
              <polygon
                points={`${item.x1},${item.y1} ${item.x1 + ux * arrowSize - uy * arrowSize * 0.5},${item.y1 + uy * arrowSize + ux * arrowSize * 0.5} ${item.x1 + ux * arrowSize + uy * arrowSize * 0.5},${item.y1 + uy * arrowSize - ux * arrowSize * 0.5}`}
                fill={stroke}
              />
            </>
          )}
        </g>
      );
    }
    if (item.type === 'text' && typeof item.text === 'string') {
      const boxW = typeof item.w === 'number' && item.w >= TEXT_BOX_MIN_W ? item.w : TEXT_BOX_W;
      const boxH = typeof item.h === 'number' && item.h >= TEXT_BOX_MIN_H ? item.h : TEXT_BOX_H;
      return (
        <g key={item.id} opacity={opacity}>
          <rect
            x={item.x}
            y={item.y}
            width={boxW}
            height={boxH}
            fill="rgba(0,0,0,0.6)"
            rx={0.005}
          />
          <text
            x={item.x + 0.01}
            y={item.y + boxH / 2}
            fill={stroke}
            fontSize={Math.min(
              typeof item.fontSize === 'number' && item.fontSize >= 0.01 && item.fontSize <= 0.06
                ? item.fontSize
                : 0.025,
              boxH * 0.7
            )}
            fontFamily="sans-serif"
          >
            {item.text}
          </text>
          {isEditMode && (
            <rect
              x={item.x + boxW - RESIZE_HANDLE}
              y={item.y + boxH - RESIZE_HANDLE}
              width={RESIZE_HANDLE}
              height={RESIZE_HANDLE}
              fill="rgba(255,255,255,0.6)"
              rx={0.002}
            />
          )}
        </g>
      );
    }
    if (item.type === 'mark' && typeof item.x === 'number' && typeof item.y === 'number') {
      const r = item.size ?? 0.02;
      if (item.markType === 'circle') {
        return (
          <circle
            key={item.id}
            cx={item.x}
            cy={item.y}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            opacity={opacity}
          />
        );
      }
      return (
        <text
          key={item.id}
          x={item.x}
          y={item.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={stroke}
          fontSize={r * 2}
          opacity={opacity}
        >
          {item.markType === 'arrow' ? '→' : item.markType === 'star' ? '★' : item.markType === 'check' ? '✓' : '✕'}
        </text>
      );
    }
    return null;
  };

  const allItems = draft ? [...annotations, draft] : annotations;

  return (
    <>
      <div
        ref={overlayRef}
        className={`absolute inset-0 z-10 flex items-center justify-center overflow-hidden ${className}`}
        style={{
          pointerEvents: isEditMode ? 'auto' : 'none',
          cursor: resizingCommentId ? 'nwse-resize' : draggingCommentId ? 'move' : isEditMode ? 'crosshair' : 'default',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {imgRect && overlayRect && (
          <svg
            className="absolute"
            style={{
              left: imgRect.left - overlayRect.left,
              top: imgRect.top - overlayRect.top,
              width: imgRect.width,
              height: imgRect.height,
              pointerEvents: 'none',
            }}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            {allItems.map((item) => renderItem(item, item === draft))}
          </svg>
        )}
      </div>

      {isEditMode && (
        <div className="absolute top-1 left-1 right-1 z-20 flex flex-wrap items-center gap-1 rounded bg-black/70 p-1.5">
          <div className="flex items-center gap-0.5">
            {(
              [
                ['rectangle', Square],
                ['ellipse', Circle],
                ['ruler', Ruler],
                ['arrow', ArrowRight],
                ['text', Type],
                ['mark', Star],
              ] as const
            ).map(([t, Icon]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTool(t)}
                className={`rounded p-1.5 transition ${tool === t ? 'bg-primary text-primary-foreground' : 'text-white hover:bg-white/20'}`}
                title={t}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-5 w-5 rounded border-2 border-white/50 transition hover:scale-110"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 min-w-[3rem] items-center justify-between gap-1 rounded border-0 bg-white/20 px-2 text-xs text-white hover:bg-white/30"
              >
                {strokeWidth}px
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[100] min-w-[4rem] bg-slate-800 text-white border-slate-600">
              {[1, 2, 3, 4].map((n) => (
                <DropdownMenuItem
                  key={n}
                  onClick={() => setStrokeWidth(n)}
                  className="cursor-pointer focus:bg-white/20 focus:text-white"
                >
                  {n}px
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {tool === 'text' && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-7 min-w-[4.5rem] items-center justify-between gap-1 rounded border-0 bg-white/20 px-2 text-xs text-white hover:bg-white/30"
                  >
                    {COMMENT_TYPES.find((c) => c.value === commentType)?.label ?? commentType}
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="z-[100] min-w-[6rem] bg-slate-800 text-white border-slate-600">
                  {COMMENT_TYPES.map(({ value, label }) => (
                    <DropdownMenuItem
                      key={value}
                      onClick={() => setCommentType(value)}
                      className="cursor-pointer focus:bg-white/20 focus:text-white"
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-7 min-w-[3.5rem] items-center justify-between gap-1 rounded border-0 bg-white/20 px-2 text-xs text-white hover:bg-white/30"
                    title="Font size"
                  >
                    {FONT_SIZE_OPTIONS.find((f) => f.value === commentFontSize)?.label ?? '20'}pt
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="z-[100] min-w-[4rem] bg-slate-800 text-white border-slate-600">
                  {FONT_SIZE_OPTIONS.map(({ value, label }) => (
                    <DropdownMenuItem
                      key={value}
                      onClick={() => setCommentFontSize(value)}
                      className="cursor-pointer focus:bg-white/20 focus:text-white"
                    >
                      {label}pt
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          {tool === 'mark' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 min-w-[2.5rem] items-center justify-between gap-1 rounded border-0 bg-white/20 px-2 text-xs text-white hover:bg-white/30"
                >
                  {MARK_TYPES.find((m) => m.value === markType)?.label ?? markType}
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="z-[100] min-w-[4rem] bg-slate-800 text-white border-slate-600">
                {MARK_TYPES.map(({ value, label }) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => setMarkType(value)}
                    className="cursor-pointer focus:bg-white/20 focus:text-white"
                  >
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {textPosition && (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitText()}
                placeholder="Comment..."
                className="rounded border-0 bg-white/90 px-2 py-1 text-xs text-black"
                autoFocus
              />
              <button
                type="button"
                onClick={submitText}
                className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setTextPosition(null)}
                className="rounded bg-white/20 px-2 py-1 text-xs text-white"
              >
                Cancel
              </button>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex items-center gap-1 rounded bg-white/20 px-2 py-1.5 text-xs text-white hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-40"
              title="Undo last edit (Ctrl/Cmd+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </button>
            {isDirty && (
              <button
                type="button"
                onClick={() => onSave(allItems)}
                className="flex items-center gap-1 rounded bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1 rounded bg-white/20 px-2 py-1.5 text-xs text-white hover:bg-white/30"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
