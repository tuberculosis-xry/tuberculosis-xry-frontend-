/**
 * Mode-specific configuration: default layout, toolbar tools, panels.
 * Used by viewer to render mode-specific UI.
 */

import type { ViewportLayout } from './types';
import type { ViewerModeId } from './types';

export interface ModeConfig {
  id: ViewerModeId;
  displayName: string;
  defaultLayout: ViewportLayout;
  /** Tool IDs to show in toolbar (e.g. WindowLevel, Pan, Zoom, StackScroll). */
  toolbarTools: string[];
  /** Whether to show measurement tools in toolbar. */
  showMeasurements?: boolean;
  /** Whether to show segmentation panel/tools. */
  showSegmentation?: boolean;
}

export const MODE_CONFIGS: Record<ViewerModeId, ModeConfig> = {
  basic: {
    id: 'basic',
    displayName: 'Basic Viewer',
    defaultLayout: '1x1',
    toolbarTools: ['WindowLevel', 'Zoom', 'Pan', 'StackScroll', 'Length', 'Angle', 'RectangleROI', 'EllipticalROI'],
    showMeasurements: true,
  },
  segmentation: {
    id: 'segmentation',
    displayName: 'Segmentation',
    defaultLayout: '1x2',
    toolbarTools: ['WindowLevel', 'Zoom', 'Pan', 'StackScroll', 'Length', 'Angle', 'RectangleROI', 'EllipticalROI'],
    showMeasurements: true,
    showSegmentation: true,
  },
  'preclinical-4d': {
    id: 'preclinical-4d',
    displayName: 'Preclinical 4D',
    defaultLayout: '1x1',
    toolbarTools: ['WindowLevel', 'Zoom', 'Pan', 'StackScroll'],
    showMeasurements: false,
  },
  microscopy: {
    id: 'microscopy',
    displayName: 'Microscopy',
    defaultLayout: '1x1',
    toolbarTools: ['WindowLevel', 'Zoom', 'Pan', 'StackScroll', 'Length', 'Angle', 'RectangleROI', 'EllipticalROI'],
    showMeasurements: true,
  },
  'us-pleura': {
    id: 'us-pleura',
    displayName: 'US Pleura B-line Annotations',
    defaultLayout: '1x1',
    toolbarTools: ['WindowLevel', 'Zoom', 'Pan', 'StackScroll', 'Length', 'Angle', 'RectangleROI', 'EllipticalROI'],
    showMeasurements: true,
  },
  tmtv: {
    id: 'tmtv',
    displayName: 'Total Metabolic Tumor Volume',
    defaultLayout: '2x2',
    toolbarTools: ['WindowLevel', 'Zoom', 'Pan', 'StackScroll', 'Length', 'Angle', 'RectangleROI', 'EllipticalROI'],
    showMeasurements: true,
  },
};

export function getModeConfig(modeId: string): ModeConfig {
  const id = modeId as ViewerModeId;
  return MODE_CONFIGS[id] ?? MODE_CONFIGS.basic;
}
