/**
 * Hanging protocol engine: match study/series to layout and viewport assignment.
 * Given series list and mode, returns layout and which series index goes to which viewport.
 */

import type { ViewportLayout } from './types';
import type { ViewerSeries } from './types';
import { LAYOUT_GRID } from './viewerConfig';
import { getModeConfig } from './modes';

export interface HangingProtocolResult {
  layout: ViewportLayout;
  /** For each viewport index, the series index in seriesList to display (or -1 for none). */
  viewportSeriesIndices: number[];
}

/**
 * Run hanging protocol: choose layout and assign series to viewports.
 * Rules:
 * - Single series: 1x1, that series in viewport 0.
 * - 2 series: 1x2, first two series.
 * - 3–4 series: 2x2, first four series (fill by row).
 * - Otherwise: use mode default layout and fill first N viewports with first N series.
 */
export function runHangingProtocol(
  seriesList: ViewerSeries[],
  modeId: string
): HangingProtocolResult {
  const modeConfig = getModeConfig(modeId);
  const count = seriesList.length;

  if (count === 0) {
    return {
      layout: modeConfig.defaultLayout,
      viewportSeriesIndices: [],
    };
  }

  if (count === 1) {
    const layout: ViewportLayout = '1x1';
    const viewportCount = LAYOUT_GRID[layout].count;
    const viewportSeriesIndices = Array.from({ length: viewportCount }, (_, i) => (i === 0 ? 0 : -1));
    return { layout, viewportSeriesIndices };
  }

  if (count === 2) {
    const layout: ViewportLayout = '1x2';
    const viewportCount = LAYOUT_GRID[layout].count;
    const viewportSeriesIndices = Array.from({ length: viewportCount }, (_, i) => (i < 2 ? i : -1));
    return { layout, viewportSeriesIndices };
  }

  if (count <= 4) {
    const layout: ViewportLayout = '2x2';
    const viewportCount = LAYOUT_GRID[layout].count;
    const viewportSeriesIndices = Array.from({ length: viewportCount }, (_, i) => (i < count ? i : -1));
    return { layout, viewportSeriesIndices };
  }

  // 5+ series: use mode default layout, fill viewports with first N series
  const layout = modeConfig.defaultLayout;
  const viewportCount = LAYOUT_GRID[layout].count;
  const viewportSeriesIndices = Array.from(
    { length: viewportCount },
    (_, i) => (i < count ? i : -1)
  );
  return { layout, viewportSeriesIndices };
}
