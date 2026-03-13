'use client';

import { useRef, useState, useCallback, useLayoutEffect, useEffect } from 'react';
import type { Measurement, LengthGeometry, AngleGeometry, RectangleROIGeometry, EllipseROIGeometry } from '@/lib/ohif/types';
import { getInstanceMetadata } from '@/lib/ohif/dicomweb';
import { computeLengthMm, computeAngleDegrees, computeRectangleAreaMm2, computeEllipseAreaMm2 } from '@/lib/ohif/measurementUtils';

const MEASUREMENT_TOOLS = ['Length', 'Angle', 'RectangleROI', 'EllipticalROI'] as const;
export type MeasurementToolId = (typeof MEASUREMENT_TOOLS)[number];

function screenToNormalized(clientX: number, clientY: number, imgRect: DOMRect): { x: number; y: number } {
  const x = (clientX - imgRect.left) / imgRect.width;
  const y = (clientY - imgRect.top) / imgRect.height;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

export interface MeasurementOverlayProps {
  imageRef: React.RefObject<HTMLImageElement | null>;
  imageId: string | undefined;
  viewportIndex: number;
  activeTool: string | undefined;
  measurements: Measurement[];
  onComplete: (measurement: Measurement) => void;
  className?: string;
}

export function MeasurementOverlay({
  imageRef,
  imageId,
  viewportIndex,
  activeTool,
  measurements,
  onComplete,
  className = '',
}: MeasurementOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [imgRect, setImgRect] = useState<DOMRect | null>(null);
  const [overlayRect, setOverlayRect] = useState<DOMRect | null>(null);

  const isMeasurementTool = activeTool && MEASUREMENT_TOOLS.includes(activeTool as MeasurementToolId);

  const updateRects = useCallback(() => {
    if (imageRef.current) setImgRect(imageRef.current.getBoundingClientRect());
    if (overlayRef.current) setOverlayRect(overlayRef.current.getBoundingClientRect());
  }, [imageRef]);

  useLayoutEffect(() => {
    updateRects();
  }, [updateRects, isMeasurementTool]);

  useEffect(() => {
    const img = imageRef.current;
    const ov = overlayRef.current;
    const ro = new ResizeObserver(updateRects);
    if (img) ro.observe(img);
    if (ov) ro.observe(ov);
    return () => ro.disconnect();
  }, [imageRef, updateRects]);

  // Length: [start] - one committed point, preview tracked separately
  const [lengthStart, setLengthStart] = useState<{ x: number; y: number } | null>(null);
  // Angle: [vertex] or [vertex, ray1End] - committed points only
  const [angleCommitted, setAngleCommitted] = useState<{ x: number; y: number }[] | null>(null);
  // Preview point for Length and Angle (cursor position during drawing)
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  // ROI: start point + current size (for rectangle/ellipse drag)
  const [roiStart, setRoiStart] = useState<{ x: number; y: number } | null>(null);
  const [roiCurrent, setRoiCurrent] = useState<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent) => {
      if (!isMeasurementTool || !imgRect || !imageId) return;
      e.preventDefault();
      const pt = screenToNormalized(e.clientX, e.clientY, imgRect);

      if (activeTool === 'Length') {
        if (!lengthStart) {
          // First click: set start point
          setLengthStart(pt);
          setPreviewPoint(pt);
        } else {
          // Second click: complete the measurement
          const geom: LengthGeometry = { kind: 'length', x1: lengthStart.x, y1: lengthStart.y, x2: pt.x, y2: pt.y };
          const meta = await getInstanceMetadata(imageId);
          const value = meta ? computeLengthMm(geom, meta) : 0;
          onComplete({
            id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'length',
            value: value.toFixed(2),
            unit: 'mm',
            viewportIndex,
            createdAt: Date.now(),
            imageId,
            geometry: geom,
          });
          setLengthStart(null);
          setPreviewPoint(null);
        }
        return;
      }

      if (activeTool === 'Angle') {
        if (!angleCommitted || angleCommitted.length === 0) {
          // First click: set vertex
          setAngleCommitted([pt]);
          setPreviewPoint(pt);
        } else if (angleCommitted.length === 1) {
          // Second click: set first ray end
          setAngleCommitted([angleCommitted[0], pt]);
          setPreviewPoint(pt);
        } else {
          // Third click: complete the measurement
          const [v, p1] = angleCommitted;
          const geom: AngleGeometry = { kind: 'angle', vx: v.x, vy: v.y, x1: p1.x, y1: p1.y, x2: pt.x, y2: pt.y };
          const deg = computeAngleDegrees(geom);
          onComplete({
            id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'angle',
            value: deg.toFixed(1),
            unit: '°',
            viewportIndex,
            createdAt: Date.now(),
            imageId,
            geometry: geom,
          });
          setAngleCommitted(null);
          setPreviewPoint(null);
        }
        return;
      }

      if (activeTool === 'RectangleROI' || activeTool === 'EllipticalROI') {
        if (!roiStart) {
          setRoiStart(pt);
          setRoiCurrent(pt);
        }
        return;
      }
    },
    [isMeasurementTool, imgRect, imageId, activeTool, lengthStart, angleCommitted, roiStart, viewportIndex, onComplete]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!imgRect) return;
      const pt = screenToNormalized(e.clientX, e.clientY, imgRect);
      // Update preview point for Length and Angle tools
      if (lengthStart || angleCommitted) {
        setPreviewPoint(pt);
      }
      if (roiStart) setRoiCurrent(pt);
    },
    [imgRect, lengthStart, angleCommitted, roiStart]
  );

  const handlePointerUp = useCallback(
    async () => {
      if (!imgRect || !imageId) return;
      if (activeTool === 'RectangleROI' || activeTool === 'EllipticalROI') {
        if (roiStart && roiCurrent) {
          const x = Math.min(roiStart.x, roiCurrent.x);
          const y = Math.min(roiStart.y, roiCurrent.y);
          const w = Math.abs(roiCurrent.x - roiStart.x) || 0.01;
          const h = Math.abs(roiCurrent.y - roiStart.y) || 0.01;
          const meta = await getInstanceMetadata(imageId);
          if (activeTool === 'RectangleROI') {
            const geom: RectangleROIGeometry = { kind: 'rectangle', x, y, w, h };
            const area = meta ? computeRectangleAreaMm2(geom, meta) : 0;
            onComplete({
              id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: 'rectangle',
              value: area.toFixed(2),
              unit: 'mm²',
              viewportIndex,
              createdAt: Date.now(),
              imageId,
              geometry: geom,
            });
          } else {
            const geom: EllipseROIGeometry = { kind: 'ellipse', x: x + w / 2, y: y + h / 2, w: w / 2, h: h / 2 };
            const area = meta ? computeEllipseAreaMm2(geom, meta) : 0;
            onComplete({
              id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: 'ellipse',
              value: area.toFixed(2),
              unit: 'mm²',
              viewportIndex,
              createdAt: Date.now(),
              imageId,
              geometry: geom,
            });
          }
          setRoiStart(null);
          setRoiCurrent(null);
        }
      }
    },
    [imgRect, imageId, activeTool, roiStart, roiCurrent, viewportIndex, onComplete]
  );

  const visibleMeasurements = measurements.filter(
    (m) => m.imageId === imageId
  );

  const showOverlay = isMeasurementTool || visibleMeasurements.length > 0;
  if (!showOverlay) return null;

  return (
    <div
      ref={overlayRef}
      className={`absolute inset-0 z-[9] flex items-center justify-center overflow-hidden pointer-events-none ${className}`}
      style={{ pointerEvents: isMeasurementTool ? 'auto' : 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        if (roiStart && roiCurrent) {
          setRoiStart(null);
          setRoiCurrent(null);
        }
      }}
    >
      {imgRect && overlayRect && (
        <svg
          className="absolute pointer-events-none"
          style={{
            left: imgRect.left - overlayRect.left,
            top: imgRect.top - overlayRect.top,
            width: imgRect.width,
            height: imgRect.height,
          }}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {/* Completed measurements with geometry */}
          {visibleMeasurements.map((m) => {
            if (!m.geometry) return null;
            const g = m.geometry;
            const stroke = '#22c55e';
            const sw = 0.004;
            if (g.kind === 'length') {
              return (
                <g key={m.id}>
                  <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={stroke} strokeWidth={sw} />
                  <text
                    x={(g.x1 + g.x2) / 2}
                    y={(g.y1 + g.y2) / 2 - 0.02}
                    textAnchor="middle"
                    fill={stroke}
                    fontSize={0.025}
                    fontFamily="sans-serif"
                  >
                    {m.value} {m.unit ?? 'mm'}
                  </text>
                </g>
              );
            }
            if (g.kind === 'angle') {
              const r = 0.08;
              const ax = g.vx + r * (g.x1 - g.vx) / (Math.hypot(g.x1 - g.vx, g.y1 - g.vy) || 1);
              const ay = g.vy + r * (g.y1 - g.vy) / (Math.hypot(g.x1 - g.vx, g.y1 - g.vy) || 1);
              const bx = g.vx + r * (g.x2 - g.vx) / (Math.hypot(g.x2 - g.vx, g.y2 - g.vy) || 1);
              const by = g.vy + r * (g.y2 - g.vy) / (Math.hypot(g.x2 - g.vx, g.y2 - g.vy) || 1);
              const large = 0;
              return (
                <g key={m.id}>
                  <line x1={g.vx} y1={g.vy} x2={g.x1} y2={g.y1} stroke={stroke} strokeWidth={sw} />
                  <line x1={g.vx} y1={g.vy} x2={g.x2} y2={g.y2} stroke={stroke} strokeWidth={sw} />
                  <path
                    d={`M ${ax} ${ay} A ${r} ${r} 0 ${large} 1 ${bx} ${by}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={sw}
                  />
                  <text x={g.vx + 0.03} y={g.vy} textAnchor="middle" fill={stroke} fontSize={0.025} fontFamily="sans-serif">
                    {m.value}°
                  </text>
                </g>
              );
            }
            if (g.kind === 'rectangle') {
              return (
                <g key={m.id}>
                  <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="none" stroke={stroke} strokeWidth={sw} />
                  <text
                    x={g.x + g.w / 2}
                    y={g.y + g.h / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={stroke}
                    fontSize={0.022}
                    fontFamily="sans-serif"
                  >
                    {m.value} mm²
                  </text>
                </g>
              );
            }
            if (g.kind === 'ellipse') {
              return (
                <g key={m.id}>
                  <ellipse cx={g.x} cy={g.y} rx={g.w} ry={g.h} fill="none" stroke={stroke} strokeWidth={sw} />
                  <text
                    x={g.x}
                    y={g.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={stroke}
                    fontSize={0.022}
                    fontFamily="sans-serif"
                  >
                    {m.value} mm²
                  </text>
                </g>
              );
            }
            return null;
          })}

          {/* Draft: length line with start point indicator */}
          {activeTool === 'Length' && lengthStart && previewPoint && (
            <g>
              {/* Start point indicator - always visible */}
              <circle
                cx={lengthStart.x}
                cy={lengthStart.y}
                r={0.012}
                fill="#22c55e"
                fillOpacity={0.3}
                stroke="#22c55e"
                strokeWidth={0.003}
              />
              <circle
                cx={lengthStart.x}
                cy={lengthStart.y}
                r={0.005}
                fill="#22c55e"
              />
              {/* Preview line from start to current cursor position */}
              <line
                x1={lengthStart.x}
                y1={lengthStart.y}
                x2={previewPoint.x}
                y2={previewPoint.y}
                stroke="#22c55e"
                strokeWidth={0.004}
                strokeDasharray="0.01 0.01"
              />
              {/* End point indicator (current cursor position) */}
              <circle
                cx={previewPoint.x}
                cy={previewPoint.y}
                r={0.008}
                fill="none"
                stroke="#22c55e"
                strokeWidth={0.003}
                strokeDasharray="0.006 0.006"
              />
            </g>
          )}

          {/* Draft: angle with vertex and ray indicators */}
          {activeTool === 'Angle' && angleCommitted && angleCommitted.length >= 1 && previewPoint && (
            <g>
              {/* Vertex indicator - always visible once placed */}
              <circle
                cx={angleCommitted[0].x}
                cy={angleCommitted[0].y}
                r={0.015}
                fill="#06b6d4"
                fillOpacity={0.3}
                stroke="#06b6d4"
                strokeWidth={0.003}
              />
              <circle
                cx={angleCommitted[0].x}
                cy={angleCommitted[0].y}
                r={0.006}
                fill="#06b6d4"
              />
              {/* First ray: preview (dashed) when length=1, solid when length=2 */}
              {angleCommitted.length === 1 && (
                <>
                  {/* Preview line from vertex to cursor */}
                  <line
                    x1={angleCommitted[0].x}
                    y1={angleCommitted[0].y}
                    x2={previewPoint.x}
                    y2={previewPoint.y}
                    stroke="#06b6d4"
                    strokeWidth={0.004}
                    strokeDasharray="0.01 0.01"
                  />
                  {/* Cursor indicator */}
                  <circle
                    cx={previewPoint.x}
                    cy={previewPoint.y}
                    r={0.008}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth={0.003}
                    strokeDasharray="0.006 0.006"
                  />
                </>
              )}
              {/* First ray committed (solid), second ray preview (dashed) */}
              {angleCommitted.length >= 2 && (
                <>
                  {/* First ray - solid */}
                  <line
                    x1={angleCommitted[0].x}
                    y1={angleCommitted[0].y}
                    x2={angleCommitted[1].x}
                    y2={angleCommitted[1].y}
                    stroke="#06b6d4"
                    strokeWidth={0.004}
                  />
                  {/* First ray endpoint indicator */}
                  <circle
                    cx={angleCommitted[1].x}
                    cy={angleCommitted[1].y}
                    r={0.008}
                    fill="#06b6d4"
                    fillOpacity={0.5}
                    stroke="#06b6d4"
                    strokeWidth={0.002}
                  />
                  {/* Second ray preview - dashed */}
                  <line
                    x1={angleCommitted[0].x}
                    y1={angleCommitted[0].y}
                    x2={previewPoint.x}
                    y2={previewPoint.y}
                    stroke="#06b6d4"
                    strokeWidth={0.004}
                    strokeDasharray="0.01 0.01"
                  />
                  {/* Second ray cursor indicator */}
                  <circle
                    cx={previewPoint.x}
                    cy={previewPoint.y}
                    r={0.008}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth={0.003}
                    strokeDasharray="0.006 0.006"
                  />
                </>
              )}
            </g>
          )}

          {/* Draft: rectangle/ellipse */}
          {roiStart && roiCurrent && (activeTool === 'RectangleROI' || activeTool === 'EllipticalROI') && (
            <>
              {activeTool === 'RectangleROI' && (
                <rect
                  x={Math.min(roiStart.x, roiCurrent.x)}
                  y={Math.min(roiStart.y, roiCurrent.y)}
                  width={Math.abs(roiCurrent.x - roiStart.x) || 0.01}
                  height={Math.abs(roiCurrent.y - roiStart.y) || 0.01}
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth={0.004}
                  strokeDasharray="0.01 0.01"
                />
              )}
              {activeTool === 'EllipticalROI' && (
                <ellipse
                  cx={(roiStart.x + roiCurrent.x) / 2}
                  cy={(roiStart.y + roiCurrent.y) / 2}
                  rx={Math.abs(roiCurrent.x - roiStart.x) / 2 || 0.005}
                  ry={Math.abs(roiCurrent.y - roiStart.y) / 2 || 0.005}
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth={0.004}
                  strokeDasharray="0.01 0.01"
                />
              )}
            </>
          )}
        </svg>
      )}
    </div>
  );
}
