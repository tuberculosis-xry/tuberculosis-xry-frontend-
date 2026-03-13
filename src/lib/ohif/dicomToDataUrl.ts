/**
 * Decode raw DICOM buffer to a displayable image (data URL).
 * Supports: uncompressed pixel data (→ PNG), JPEG-family encapsulated (→ JPEG data URL when browser can decode).
 */

import dicomParser from 'dicom-parser';

const PIXEL_DATA_TAG = 'x7fe00010';
const ROWS_TAG = 'x00280010';
const COLUMNS_TAG = 'x00280011';
const BITS_ALLOCATED_TAG = 'x00280100';
const BITS_STORED_TAG = 'x00280101';
const PIXEL_REPRESENTATION_TAG = 'x00280103';
const RESCALE_SLOPE_TAG = 'x00281053';
const RESCALE_INTERCEPT_TAG = 'x00281052';
const TRANSFER_SYNTAX_UID_TAG = 'x00020010';
const PHOTOMETRIC_INTERPRETATION_TAG = 'x00280004';
const COMPRESSED_PREFIXES = ['1.2.840.10008.1.2.4.', '1.2.840.10008.1.2.5'];
const JPEG2000_UIDS = ['1.2.840.10008.1.2.4.90', '1.2.840.10008.1.2.4.91'];

function isCompressed(uid: string): boolean {
  const n = (uid || '').trim();
  return Boolean(n && COMPRESSED_PREFIXES.some((p) => n === p || n.startsWith(p)));
}

function isJpeg2000(uid: string): boolean {
  return JPEG2000_UIDS.includes((uid || '').trim());
}

function isBigEndian(uid: string): boolean {
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

/** Decode raw DICOM buffer to pixel array and dimensions. Throws if not uncompressed or no pixel data. */
function decodeToScalar(
  buffer: ArrayBuffer
): { scalarData: Float32Array; rows: number; columns: number; min: number; max: number; photometricInterpretation: string } {
  const byteArray = new Uint8Array(buffer);
  let dataSet: {
    elements: Record<string, { dataOffset?: number; length?: number }>;
    byteArray: { buffer: ArrayBuffer; byteOffset: number };
    string: (t: string) => string | undefined;
    uint16: (t: string) => number;
    floatString?: (t: string) => number;
    float?: (t: string) => number;
  };
  try {
    dataSet = dicomParser.parseDicom(byteArray) as typeof dataSet;
  } catch {
    dataSet = dicomParser.parseDicom(byteArray, { TransferSyntaxUID: '1.2.840.10008.1.2' }) as typeof dataSet;
  }
  const transferSyntaxUid = (dataSet.string(TRANSFER_SYNTAX_UID_TAG) || '').trim();
  if (isCompressed(transferSyntaxUid)) {
    throw new Error('Compressed DICOM not supported in browser');
  }
  const pixelDataElement = dataSet.elements[PIXEL_DATA_TAG];
  if (!pixelDataElement?.length) {
    throw new Error('No pixel data in DICOM');
  }
  const rows = dataSet.uint16(ROWS_TAG) || 0;
  const columns = dataSet.uint16(COLUMNS_TAG) || 0;
  if (rows === 0 || columns === 0) {
    throw new Error('Invalid rows/columns');
  }
  const photometricInterpretation = (dataSet.string(PHOTOMETRIC_INTERPRETATION_TAG) || '').trim().toUpperCase();
  const bitsAllocated = dataSet.uint16(BITS_ALLOCATED_TAG) || 8;
  const bitsStored = dataSet.uint16(BITS_STORED_TAG) || bitsAllocated;
  const pixelRepresentation = dataSet.uint16(PIXEL_REPRESENTATION_TAG) ?? 0;
  const slope =
    dataSet.floatString?.(RESCALE_SLOPE_TAG) ?? dataSet.float?.(RESCALE_SLOPE_TAG) ?? 1;
  const intercept =
    dataSet.floatString?.(RESCALE_INTERCEPT_TAG) ?? dataSet.float?.(RESCALE_INTERCEPT_TAG) ?? 0;
  const buf = dataSet.byteArray.buffer;
  const baseOffset = dataSet.byteArray.byteOffset + (pixelDataElement.dataOffset ?? 0);
  const pixelByteLength = pixelDataElement.length;
  const mask = bitsStored > 0 && bitsStored < 16 ? (1 << bitsStored) - 1 : 0;
  let scalarData: Float32Array;
  if (bitsAllocated === 16) {
    const workLen = pixelByteLength;
    if (workLen % 2 !== 0) throw new Error('Invalid 16-bit pixel length');
    const workBuffer = buf.slice(baseOffset, baseOffset + pixelByteLength) as ArrayBuffer;
    if (isBigEndian(transferSyntaxUid)) {
      swap16(workBuffer, 0, pixelByteLength);
    }
    const raw =
      pixelRepresentation === 1
        ? new Int16Array(workBuffer, 0, workLen / 2)
        : new Uint16Array(workBuffer, 0, workLen / 2);
    scalarData = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      let val: number = raw[i];
      if (mask) {
        val = (val as number) & mask;
        if (pixelRepresentation === 1 && (val & (1 << (bitsStored - 1)))) val -= 1 << bitsStored;
      }
      scalarData[i] = val * slope + intercept;
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
  return { scalarData, rows, columns, min, max, photometricInterpretation };
}

/** Blob to data URL (async). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('FileReader failed'));
    r.readAsDataURL(blob);
  });
}

/** Ensure a data URL actually loads as an image and has visible content; reject if not (e.g. invalid JPEG or black). */
function ensureImageLoads(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(new Error('Decoded image is empty or invalid. Re-save as uncompressed or JPEG Baseline.'));
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        let dark = 0;
        let maxVal = 0;
        for (let i = 0; i < d.length; i += 4) {
          const v = Math.max(d[i], d[i + 1], d[i + 2]);
          if (v < 20) dark++;
          if (v > maxVal) maxVal = v;
        }
        const total = (d.length / 4) | 0;
        if (total > 0 && (dark / total >= 0.99 || maxVal < 12)) {
          reject(new Error('Image decoded as black or empty. Re-save DX as uncompressed or JPEG Baseline (not JPEG 2000).'));
          return;
        }
      } catch {
        // if canvas check fails, still allow the data URL
      }
      resolve(dataUrl);
    };
    img.onerror = () => reject(new Error('Image failed to decode (format may be unsupported). Re-save as uncompressed or JPEG Baseline.'));
    img.src = dataUrl;
  });
}

/**
 * Convert raw DICOM buffer to a displayable data URL (PNG for uncompressed, JPEG for encapsulated JPEG-family).
 * For any compressed transfer syntax with encapsulated fragments, we try to extract the first frame and
 * display as image/jpeg (works for JPEG Baseline/Extended when the browser can decode).
 * Returns a Promise so compressed DICOM can be handled async.
 */
export async function dicomBufferToDataUrl(buffer: ArrayBuffer): Promise<string> {
  const byteArray = new Uint8Array(buffer);
  let dataSet: {
    elements: Record<string, { dataOffset?: number; length?: number; encapsulatedPixelData?: boolean; fragments?: Array<{ offset: number; position: number; length: number }>; basicOffsetTable?: number[] }>;
    byteArray: { buffer: ArrayBuffer; byteOffset: number };
    string: (t: string) => string | undefined;
    uint16: (t: string) => number;
    floatString?: (t: string) => number;
    float?: (t: string) => number;
  };
  try {
    dataSet = dicomParser.parseDicom(byteArray) as typeof dataSet;
  } catch {
    dataSet = dicomParser.parseDicom(byteArray, { TransferSyntaxUID: '1.2.840.10008.1.2' }) as typeof dataSet;
  }
  const transferSyntaxUid = (dataSet.string(TRANSFER_SYNTAX_UID_TAG) || '').trim();
  const pixelDataElement = dataSet.elements[PIXEL_DATA_TAG] as typeof dataSet.elements[string] & {
    encapsulatedPixelData?: boolean;
    fragments?: Array<{ offset: number; position: number; length: number }>;
    basicOffsetTable?: number[];
  } | undefined;

  if (isCompressed(transferSyntaxUid) && isJpeg2000(transferSyntaxUid)) {
    return Promise.reject(
      new Error('JPEG 2000 compressed DICOM is not supported in the browser. Re-save as uncompressed or JPEG Baseline.')
    );
  }

  if (isCompressed(transferSyntaxUid) && pixelDataElement?.encapsulatedPixelData && pixelDataElement.fragments?.length) {
    try {
      const ds = dataSet as unknown as dicomParser.DataSet;
      const el = pixelDataElement as unknown as dicomParser.Element;
      let jpegBytes: Uint8Array;
      if (el.basicOffsetTable && el.basicOffsetTable.length > 0) {
        jpegBytes = dicomParser.readEncapsulatedImageFrame(ds, el, 0) as Uint8Array;
      } else {
        jpegBytes = dicomParser.readEncapsulatedPixelDataFromFragments(
          ds,
          el,
          0,
          el.fragments!.length,
          el.fragments
        ) as Uint8Array;
      }
      const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
      const dataUrl = await blobToDataUrl(blob);
      return ensureImageLoads(dataUrl);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Failed to read compressed frame'));
    }
  }

  if (isCompressed(transferSyntaxUid)) {
    return Promise.reject(
      new Error('Unsupported compression or could not decode. Re-save as uncompressed or JPEG Baseline for best support.')
    );
  }

  const { scalarData, rows, columns, min, max, photometricInterpretation } = decodeToScalar(buffer);
  const range = max - min || 1;
  if (range <= 0 || min !== min || max !== max) {
    return Promise.reject(new Error('Image has no usable pixel range. File may be blank or unsupported.'));
  }
  const invert = photometricInterpretation === 'MONOCHROME1';
  const canvas = document.createElement('canvas');
  canvas.width = columns;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2d not available'));
  const imageData = ctx.createImageData(columns, rows);
  const data = imageData.data;
  let allSame = true;
  let firstVal: number | null = null;
  let darkCount = 0;
  const DARK_THRESHOLD = 20;
  for (let i = 0; i < scalarData.length; i++) {
    let v = Math.max(0, Math.min(255, ((scalarData[i] - min) / range) * 255));
    if (invert) v = 255 - v;
    if (v < DARK_THRESHOLD) darkCount++;
    if (firstVal === null) firstVal = v;
    else if (v !== firstVal) allSame = false;
    const j = i * 4;
    data[j] = v;
    data[j + 1] = v;
    data[j + 2] = v;
    data[j + 3] = 255;
  }
  if (allSame && scalarData.length > 0) {
    return Promise.reject(new Error('Image decoded as blank (all same pixel value). Re-save as uncompressed or JPEG Baseline.'));
  }
  if (scalarData.length > 0 && darkCount / scalarData.length >= 0.99) {
    return Promise.reject(
      new Error('Image decoded as mostly black; file may be unsupported or corrupt. Re-save DX as uncompressed or JPEG Baseline (not JPEG 2000).')
    );
  }
  let maxDisplayVal = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i];
    if (v > maxDisplayVal) maxDisplayVal = v;
  }
  if (scalarData.length > 0 && maxDisplayVal < 12) {
    return Promise.reject(
      new Error('Image has no visible content (too dark). Re-save as uncompressed or JPEG Baseline.')
    );
  }
  ctx.putImageData(imageData, 0, 0);
  return Promise.resolve(canvas.toDataURL('image/png'));
}
