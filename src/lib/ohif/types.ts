/**
 * OHIF viewer types — patient/study and viewer mode.
 * Data can come from DICOMweb (QIDO), local JSON, or backend API.
 */

export type ViewerModeId =
  | 'basic'
  | 'segmentation'
  | 'preclinical-4d'
  | 'microscopy'
  | 'us-pleura'
  | 'tmtv';

export interface ViewerMode {
  id: ViewerModeId;
  label: string;
}

export const VIEWER_MODES: ViewerMode[] = [
  { id: 'basic', label: 'Basic Viewer' },
  { id: 'segmentation', label: 'Segmentation' },
  { id: 'preclinical-4d', label: 'Preclinical 4D' },
  { id: 'microscopy', label: 'Microscopy' },
  { id: 'us-pleura', label: 'US Pleura B-line Annotations' },
  { id: 'tmtv', label: 'Total Metabolic Tumor Volume' },
];

export interface PatientStudy {
  /** Database id (for delete). Present when loaded from API. */
  id?: string;
  studyInstanceUID: string;
  patientName: string;
  patientId: string;
  mrn: string;
  studyDate: string;
  /** Optional study time (e.g. "14:05" or "02:05 PM"). */
  studyTime?: string;
  studyDescription: string;
  modality: string;
  accessionNumber: string;
  instances: number;
  /** Number of series (from DB, populated on upload). */
  seriesCount?: number | null;
  /** Which viewer modes are available for this study (based on diagnosis/modality). */
  availableModes: ViewerModeId[];
  patientSex?: string;
  patientBirthDate?: string;
}

/** One patient with all their studies (for table: one row = one patient). */
export interface PatientWithStudies {
  patientName: string;
  mrn: string;
  studies: PatientStudy[];
}

/** Series summary for viewer left panel (from DICOMweb or mock). */
export interface ViewerSeries {
  seriesInstanceUID: string;
  seriesNumber?: string;
  modality: string;
  seriesDescription: string;
  numInstances: number;
  /** WADO-RS imageIds for this series, or empty if not loaded. */
  imageIds?: string[];
}

/** Layout preset for viewport grid. */
export type ViewportLayout = '1x1' | '1x2' | '2x2';

/** Measurement types for Phase 3. */
export type MeasurementType = 'length' | 'angle' | 'rectangle' | 'ellipse';

/** Normalized (0-1) line for length: start (x1,y1) to end (x2,y2). */
export interface LengthGeometry {
  kind: 'length';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Normalized (0-1) angle: vertex (vx,vy), first ray end (x1,y1), second ray end (x2,y2). */
export interface AngleGeometry {
  kind: 'angle';
  vx: number;
  vy: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Normalized (0-1) rectangle ROI: top-left (x,y), width w, height h. */
export interface RectangleROIGeometry {
  kind: 'rectangle';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Normalized (0-1) ellipse ROI: center (x,y), half-width w, half-height h (radii). */
export interface EllipseROIGeometry {
  kind: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
}

export type MeasurementGeometry =
  | LengthGeometry
  | AngleGeometry
  | RectangleROIGeometry
  | EllipseROIGeometry;

export interface Measurement {
  id: string;
  type: MeasurementType;
  label?: string;
  value: string;
  unit?: string;
  viewportIndex: number;
  createdAt: number;
  /** ImageId (e.g. wado:...) for which this measurement was taken; used for re-display. */
  imageId?: string;
  /** Geometry in normalized 0-1 coords for re-render and recompute (e.g. when spacing loads). */
  geometry?: MeasurementGeometry;
}

/** Per-viewport transform and window/level for img-based viewport (zoom, pan, brightness/contrast). */
export interface ViewportTransformState {
  scale: number;
  translateX: number;
  translateY: number;
  brightness: number;
  contrast: number;
}

export const DEFAULT_VIEWPORT_TRANSFORM: ViewportTransformState = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  brightness: 1,
  contrast: 1,
};

/** AI inference request context (sent to backend). */
export interface AIInferenceRequest {
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  instanceId?: string;
  viewportIndex?: number;
  /** Optional: model or task selector if backend supports it */
  task?: string;
}

/** AI result: text/report and/or overlay data for viewport. */
export interface AIInferenceResult {
  report?: string;
  /** Optional: segmentation/detection overlay; format depends on backend (e.g. mask URL, boxes) */
  overlays?: unknown;
}

// --- DICOM viewport annotations (per-instance, normalized 0-1 coords) ---

/** Normalized point (0-1) for layout-independent annotations. */
export interface NormPoint {
  x: number;
  y: number;
}

export type AnnotationToolType =
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'ruler'
  | 'text'
  | 'mark';

export type CommentType = 'note' | 'finding' | 'question' | 'critical' | 'info';

export type MarkType = 'circle' | 'arrow' | 'star' | 'check' | 'x';

export interface BaseAnnotationItem {
  id: string;
  type: AnnotationToolType;
  color: string;
  strokeWidth?: number;
  createdAt: number;
}

export interface RectangleAnnotation extends BaseAnnotationItem {
  type: 'rectangle';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EllipseAnnotation extends BaseAnnotationItem {
  type: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArrowAnnotation extends BaseAnnotationItem {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RulerAnnotation extends BaseAnnotationItem {
  type: 'ruler';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextAnnotation extends BaseAnnotationItem {
  type: 'text';
  x: number;
  y: number;
  /** Normalized width of comment box (0-1). Optional; default applied in UI. */
  w?: number;
  /** Normalized height of comment box (0-1). Optional; default applied in UI. */
  h?: number;
  text: string;
  commentType?: CommentType;
  fontSize?: number; // normalized 0-1 scale or px
}

export interface MarkAnnotation extends BaseAnnotationItem {
  type: 'mark';
  x: number;
  y: number;
  markType: MarkType;
  size?: number;
}

export type ViewportAnnotationItem =
  | RectangleAnnotation
  | EllipseAnnotation
  | ArrowAnnotation
  | RulerAnnotation
  | TextAnnotation
  | MarkAnnotation;
