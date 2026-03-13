import type { ViewportLayout } from './types';

export const LAYOUT_GRID: Record<ViewportLayout, { rows: number; cols: number; count: number }> = {
  '1x1': { rows: 1, cols: 1, count: 1 },
  '1x2': { rows: 1, cols: 2, count: 2 },
  '2x2': { rows: 2, cols: 2, count: 4 },
};

export const CINE_FRAME_RATE = 10;
