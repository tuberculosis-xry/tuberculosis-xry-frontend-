/**
 * Map viewer measurements to a DICOM SR-like structure for export (TID 1500 style).
 * Used for "Export SR" download and optional STOW to DICOM storage.
 *
 * To display SR from storage: QIDO-RS for series with Modality=SR, WADO-RS to retrieve instance,
 * then parse with a DICOM SR library (e.g. dcmjs) and render observations in the measurements panel.
 * SEG display: retrieve SEG instance via WADO, use Cornerstone segmentation APIs to render overlay.
 */

import type { Measurement } from './types';

export interface MeasurementReportSR {
  contentType: 'MeasurementReport';
  schemaVersion: '1.0';
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  observations: Array<{
    id: string;
    type: string;
    value: string;
    unit?: string;
    viewportIndex: number;
    createdAt: number;
  }>;
  generatedAt: string;
}

export function measurementsToSRJson(
  measurements: Measurement[],
  options: { studyInstanceUID?: string; seriesInstanceUID?: string } = {}
): MeasurementReportSR {
  return {
    contentType: 'MeasurementReport',
    schemaVersion: '1.0',
    studyInstanceUID: options.studyInstanceUID,
    seriesInstanceUID: options.seriesInstanceUID,
    observations: measurements.map((m) => ({
      id: m.id,
      type: m.type,
      value: m.value,
      unit: m.unit,
      viewportIndex: m.viewportIndex,
      createdAt: m.createdAt,
    })),
    generatedAt: new Date().toISOString(),
  };
}

/** Trigger download of SR JSON file. */
export function downloadSrJson(report: MeasurementReportSR, filename?: string): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `measurement-report-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
