/**
 * Compute measurement values from normalized (0-1) geometry and DICOM instance metadata.
 * Used by on-canvas Length, Angle, and ROI/area tools.
 */

import type { InstanceMetadata } from './dicomMetadata';
import type { LengthGeometry, AngleGeometry, RectangleROIGeometry, EllipseROIGeometry } from './types';

/** Length in mm from normalized segment and pixel spacing. */
export function computeLengthMm(geom: LengthGeometry, meta: InstanceMetadata): number {
  const dxNorm = geom.x2 - geom.x1;
  const dyNorm = geom.y2 - geom.y1;
  const dxMm = dxNorm * meta.columns * meta.columnPixelSpacing;
  const dyMm = dyNorm * meta.rows * meta.rowPixelSpacing;
  return Math.sqrt(dxMm * dxMm + dyMm * dyMm);
}

/** Angle in degrees from vertex and two ray endpoints (normalized 0-1). */
export function computeAngleDegrees(geom: AngleGeometry): number {
  const ax = geom.x1 - geom.vx;
  const ay = geom.y1 - geom.vy;
  const bx = geom.x2 - geom.vx;
  const by = geom.y2 - geom.vy;
  const dot = ax * bx + ay * by;
  const cross = ax * by - ay * bx;
  const lenA = Math.sqrt(ax * ax + ay * ay) || 1e-10;
  const lenB = Math.sqrt(bx * bx + by * by) || 1e-10;
  const cos = Math.max(-1, Math.min(1, dot / (lenA * lenB)));
  let rad = Math.acos(cos);
  if (cross < 0) rad = -rad;
  const deg = (rad * 180) / Math.PI;
  return Math.abs(deg);
}

/** Area in mm² for rectangle (normalized 0-1). */
export function computeRectangleAreaMm2(geom: RectangleROIGeometry, meta: InstanceMetadata): number {
  const widthMm = geom.w * meta.columns * meta.columnPixelSpacing;
  const heightMm = geom.h * meta.rows * meta.rowPixelSpacing;
  return widthMm * heightMm;
}

/** Area in mm² for ellipse (normalized 0-1; w,h are half-width and half-height). */
export function computeEllipseAreaMm2(geom: EllipseROIGeometry, meta: InstanceMetadata): number {
  const aMm = geom.w * meta.columns * meta.columnPixelSpacing;
  const bMm = geom.h * meta.rows * meta.rowPixelSpacing;
  return Math.PI * aMm * bMm;
}
