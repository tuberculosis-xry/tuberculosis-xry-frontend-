/**
 * Cornerstone3D core only: init, rendering engine, multi-viewport support.
 * Client-only. WADO loader fetches raw DICOM from app API and decodes in browser.
 */

import type { Types } from '@cornerstonejs/core';
import dicomParser from 'dicom-parser';
import { parseWadoImageId, getInstanceFrame } from './dicomweb';

const PIXEL_DATA_TAG = 'x7fe00010';
const ROWS_TAG = 'x00280010';
const COLUMNS_TAG = 'x00280011';
const BITS_ALLOCATED_TAG = 'x00280100';
const PIXEL_REPRESENTATION_TAG = 'x00280103';
const RESCALE_SLOPE_TAG = 'x00281053';
const RESCALE_INTERCEPT_TAG = 'x00281052';
const TRANSFER_SYNTAX_UID_TAG = 'x00020010';
const COMPRESSED_PREFIXES = ['1.2.840.10008.1.2.4.', '1.2.840.10008.1.2.5'];

function isCompressedTransferSyntax(uid: string): boolean {
  const n = (uid || '').trim();
  return Boolean(n && COMPRESSED_PREFIXES.some((p) => n === p || n.startsWith(p)));
}

function isBigEndianTransferSyntax(uid: string): boolean {
  return (uid || '').trim() === '1.2.840.10008.1.2.2';
}

function swap16(buffer: ArrayBuffer, byteOffset: number, lengthBytes: number): void {
  const view = new Uint8Array(buffer, byteOffset, lengthBytes);
  for (let i = 0; i < lengthBytes - 1; i += 2) {
    const t = view[i];
    view[i] = view[i + 1];
    view[i + 1] = t;
  }
}

function decodeDicomToScalarData(buffer: ArrayBuffer): {
  scalarData: Float32Array;
  rows: number;
  columns: number;
  min: number;
  max: number;
} {
  const byteArray = new Uint8Array(buffer);
  let dataSet: { elements: Record<string, { dataOffset?: number; length?: number }>; byteArray: { buffer: ArrayBuffer; byteOffset: number }; string: (t: string) => string | undefined; uint16: (t: string) => number; floatString?: (t: string) => number; float?: (t: string) => number };
  try {
    dataSet = dicomParser.parseDicom(byteArray) as typeof dataSet;
  } catch {
    dataSet = dicomParser.parseDicom(byteArray, { TransferSyntaxUID: '1.2.840.10008.1.2' }) as typeof dataSet;
  }
  const transferSyntaxUid = (dataSet.string(TRANSFER_SYNTAX_UID_TAG) || '').trim();
  if (isCompressedTransferSyntax(transferSyntaxUid)) {
    throw new Error('Compressed DICOM (e.g. JPEG) is not supported in browser; use uncompressed DX.');
  }
  const pixelDataElement = dataSet.elements[PIXEL_DATA_TAG];
  if (!pixelDataElement?.length) {
    throw new Error('No pixel data in DICOM');
  }
  const rows = dataSet.uint16(ROWS_TAG) || 0;
  const columns = dataSet.uint16(COLUMNS_TAG) || 0;
  if (rows === 0 || columns === 0) {
    throw new Error('Invalid rows/columns in DICOM');
  }
  const bitsAllocated = dataSet.uint16(BITS_ALLOCATED_TAG) || 8;
  const pixelRepresentation = dataSet.uint16(PIXEL_REPRESENTATION_TAG) ?? 0;
  const slope = (dataSet as { floatString?: (t: string) => number; float?: (t: string) => number }).floatString?.(RESCALE_SLOPE_TAG) ?? (dataSet as { float?: (t: string) => number }).float?.(RESCALE_SLOPE_TAG) ?? 1;
  const intercept = (dataSet as { floatString?: (t: string) => number; float?: (t: string) => number }).floatString?.(RESCALE_INTERCEPT_TAG) ?? (dataSet as { float?: (t: string) => number }).float?.(RESCALE_INTERCEPT_TAG) ?? 0;
  const buf = dataSet.byteArray.buffer;
  const baseOffset = dataSet.byteArray.byteOffset + (pixelDataElement.dataOffset ?? 0);
  const pixelByteLength = pixelDataElement.length;
  let scalarData: Float32Array;
  if (bitsAllocated === 16) {
    const workLen = pixelByteLength;
    if (workLen % 2 !== 0) throw new Error('Invalid 16-bit pixel length');
    const workBuffer = buf.slice(baseOffset, baseOffset + pixelByteLength) as ArrayBuffer;
    if (isBigEndianTransferSyntax(transferSyntaxUid)) {
      swap16(workBuffer, 0, pixelByteLength);
    }
    const raw = pixelRepresentation === 1
      ? new Int16Array(workBuffer, 0, workLen / 2)
      : new Uint16Array(workBuffer, 0, workLen / 2);
    scalarData = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      scalarData[i] = raw[i] * slope + intercept;
    }
  } else {
    const raw = new Uint8Array(buf, baseOffset, pixelByteLength);
    scalarData = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      scalarData[i] = raw[i] * slope + intercept;
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < scalarData.length; i++) {
    const v = scalarData[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) max = min + 1;
  return { scalarData, rows, columns, min, max };
}

const RENDERING_ENGINE_ID = 'ohif-rendering-engine';
const VIEWPORT_ID_PREFIX = 'ohif-viewport-';

/** Cache for wado image metadata (populated by loader before createAndCacheLocalImage). */
const wadoMetadataCache = new Map<
  string,
  { rows: number; columns: number; rowPixelSpacing?: number; columnPixelSpacing?: number; frameOfReferenceUID?: string }
>();

let _initialized = false;
let _renderingEngine: Types.IRenderingEngine | null = null;
let _activeViewportCount = 0;

export function getViewportId(index: number): string {
  return `${VIEWPORT_ID_PREFIX}${index}`;
}

/** Initialize Cornerstone3D core and register placeholder image loader. */
export async function initCornerstone(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (_initialized) return;

  const core = await import('@cornerstonejs/core');
  await core.init();

  const size = 512;
  const numPixels = size * size;
  const pixelData = new Float32Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    const cx = size / 2;
    const cy = size / 2;
    const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    const ring = Math.sin((d / 40) * Math.PI * 2) * 0.5 + 0.5;
    pixelData[i] = ring * 4095;
  }

  // Provide imagePlaneModule for test:// imageIds so createAndCacheLocalImage can read rows/columns
  const testImagePlaneModule = {
    rows: size,
    columns: size,
    frameOfReferenceUID: 'test-frame-uid',
    rowPixelSpacing: 1,
    columnPixelSpacing: 1,
  };
  core.metaData.addProvider((type: string, imageId: string) => {
    if (type === 'imagePlaneModule' && imageId?.startsWith('test://')) {
      return testImagePlaneModule;
    }
    if (type === 'imagePlaneModule' && imageId?.startsWith('wado:')) {
      const meta = wadoMetadataCache.get(imageId);
      if (meta) {
        return {
          rows: meta.rows,
          columns: meta.columns,
          frameOfReferenceUID: meta.frameOfReferenceUID ?? 'wado-frame-uid',
          rowPixelSpacing: meta.rowPixelSpacing ?? 1,
          columnPixelSpacing: meta.columnPixelSpacing ?? 1,
        };
      }
    }
  }, 10);

  core.imageLoader.registerImageLoader('test', (imageId: string) => {
    const image = core.imageLoader.createAndCacheLocalImage(
      { scalarData: pixelData },
      imageId
    );
    return { promise: Promise.resolve(image) };
  });

  core.imageLoader.registerImageLoader('wado', (imageId: string) => {
    const promise = (async () => {
      const parsed = parseWadoImageId(imageId);
      if (!parsed) {
        throw new Error(`Invalid wado imageId: ${imageId}`);
      }
      const buffer = await getInstanceFrame(parsed.study, parsed.series, parsed.sop);
      const { scalarData, rows, columns, min, max } = decodeDicomToScalarData(buffer);
      wadoMetadataCache.set(imageId, {
        rows,
        columns,
        rowPixelSpacing: 1,
        columnPixelSpacing: 1,
        frameOfReferenceUID: `wado-${parsed.study}`,
      });
      const image = core.imageLoader.createAndCacheLocalImage(
        { scalarData },
        imageId
      );
      if (Number.isFinite(min) && Number.isFinite(max)) {
        (image as { minPixelValue: number; maxPixelValue: number }).minPixelValue = min;
        (image as { minPixelValue: number; maxPixelValue: number }).maxPixelValue = max;
      }
      return image;
    })();
    return { promise };
  });

  _initialized = true;
}

export function getRenderingEngineId(): string {
  return RENDERING_ENGINE_ID;
}

/** Call after viewports are created or container size changes so the main canvas matches the layout. */
export function resizeRenderingEngine(): void {
  if (_renderingEngine && !_renderingEngine.hasBeenDestroyed) {
    _renderingEngine.resize(true, true);
  }
}

/** Create or get RenderingEngine and enable N stack viewports on the given elements. */
export async function createViewports(elements: HTMLDivElement[]): Promise<Types.IStackViewport[]> {
  const core = await import('@cornerstonejs/core');
  await initCornerstone();

  if (!_renderingEngine) {
    _renderingEngine = new core.RenderingEngine(RENDERING_ENGINE_ID);
  }

  for (let i = 0; i < _activeViewportCount; i++) {
    try {
      _renderingEngine.disableElement(getViewportId(i));
    } catch {
      // ignore
    }
  }

  _activeViewportCount = elements.length;
  const viewports: Types.IStackViewport[] = [];

  for (let i = 0; i < elements.length; i++) {
    const viewportInput = {
      viewportId: getViewportId(i),
      element: elements[i],
      type: core.Enums.ViewportType.STACK,
    };
    _renderingEngine.enableElement(viewportInput);
    viewports.push(_renderingEngine.getViewport(getViewportId(i)) as Types.IStackViewport);
  }

  return viewports;
}

/** Single viewport (1x1): backward-compat. */
export async function createViewport(element: HTMLDivElement): Promise<Types.IStackViewport> {
  const vps = await createViewports([element]);
  return vps[0];
}

/** Set stack on a viewport by id and render. */
export async function setStack(
  viewport: Types.IStackViewport,
  imageIds: string[],
  currentIndex = 0
): Promise<void> {
  if (imageIds.length === 0) return;
  viewport.setStack(imageIds, currentIndex);
  viewport.render();
}

const PREFETCH_LIMIT = 20;

/** Prefetch first N images of a stack into cache so scrolling feels instant. */
export function prefetchStack(imageIds: string[], limit = PREFETCH_LIMIT): void {
  if (typeof window === 'undefined' || imageIds.length === 0) return;
  const toLoad = imageIds.slice(0, limit);
  import('@cornerstonejs/core').then((core) => {
    toLoad.forEach((imageId) => {
      core.imageLoader.loadAndCacheImage(imageId).catch(() => {});
    });
  });
}

export function getCurrentImageId(viewport: Types.IStackViewport): string | undefined {
  return viewport.getCurrentImageId();
}

export function getViewport(indexOrId?: number | string): Types.IStackViewport | undefined {
  if (!_renderingEngine) return undefined;
  const id = typeof indexOrId === 'number' ? getViewportId(indexOrId) : indexOrId ?? getViewportId(0);
  try {
    return _renderingEngine.getViewport(id) as Types.IStackViewport | undefined;
  } catch {
    return undefined;
  }
}

/** Scroll stack by delta. If viewportIndex undefined, scroll first viewport. */
export function scrollStack(delta: number, viewportIndex = 0): void {
  const vp = getViewport(viewportIndex);
  if (vp) {
    vp.scroll(delta);
    vp.render();
  }
}

/** Reset viewport camera. If viewportIndex undefined, reset first. */
export function resetViewport(viewportIndex?: number): void {
  const idx = viewportIndex ?? 0;
  const vp = getViewport(idx);
  if (vp) {
    vp.resetCamera();
    vp.render();
  }
}

/** Reset all active viewports. */
export function resetAllViewports(): void {
  for (let i = 0; i < _activeViewportCount; i++) {
    resetViewport(i);
  }
}

/** Zoom in/out by factor. */
export function zoomViewport(factor: number, viewportIndex = 0): void {
  const vp = getViewport(viewportIndex);
  if (!vp) return;
  const camera = vp.getCamera();
  if (camera.parallelScale) {
    camera.parallelScale /= factor;
    vp.setCamera(camera);
    vp.render();
  }
}

/** Get current VOI (window/level) from viewport. */
export function getViewportVOI(viewportIndex: number): { lower: number; upper: number } | undefined {
  const vp = getViewport(viewportIndex);
  if (!vp) return undefined;
  const props = vp.getProperties?.();
  const voi = (props as { voiRange?: { lower: number; upper: number } })?.voiRange;
  return voi ? { lower: voi.lower, upper: voi.upper } : undefined;
}

/** Get current slice index and total for overlay (e.g. "1/120"). */
export function getViewportStackInfo(viewportIndex: number): { currentIndex: number; total: number } | undefined {
  const vp = getViewport(viewportIndex);
  if (!vp) return undefined;
  const stack = vp as unknown as { imageIds?: string[]; currentImageIdIndex?: number };
  if (!stack.imageIds?.length) return undefined;
  const total = stack.imageIds.length;
  const currentIndex = typeof stack.currentImageIdIndex === 'number' ? stack.currentImageIdIndex : 0;
  return { currentIndex: currentIndex + 1, total };
}

/** Set VOI (window/level) on viewport. */
export function setViewportVOI(viewportIndex: number, lower: number, upper: number): void {
  const vp = getViewport(viewportIndex);
  if (!vp) return;
  (vp as { setProperties: (p: { voiRange?: { lower: number; upper: number } }) => void }).setProperties({ voiRange: { lower, upper } });
  vp.render();
}

/** Pan viewport by pixel delta (converted to world). */
export function panViewportByDelta(viewportIndex: number, deltaX: number, deltaY: number): void {
  const vp = getViewport(viewportIndex);
  if (!vp) return;
  const camera = vp.getCamera();
  if (camera.position && camera.focalPoint) {
    camera.position[0] -= deltaX;
    camera.position[1] -= deltaY;
    camera.focalPoint[0] -= deltaX;
    camera.focalPoint[1] -= deltaY;
    vp.setCamera(camera);
    vp.render();
  }
}

export function getActiveViewportCount(): number {
  return _activeViewportCount;
}

export async function destroyViewport(destroyEngine = false): Promise<void> {
  if (_renderingEngine) {
    for (let i = 0; i < _activeViewportCount; i++) {
      try {
        _renderingEngine.disableElement(getViewportId(i));
      } catch {
        // ignore
      }
    }
    _activeViewportCount = 0;
    if (destroyEngine) {
      _renderingEngine.destroy();
      _renderingEngine = null;
    }
  }
}
