/**
 * Server-side DICOM transcoding: convert unsupported transfer syntaxes (e.g. JPEG 2000)
 * to JPEG Baseline so the browser can display them. Used during upload; result is stored in DB.
 */

import dicomParser from 'dicom-parser';

const PIXEL_DATA_TAG = 'x7fe00010';
const ROWS_TAG = 'x00280010';
const COLUMNS_TAG = 'x00280011';
const BITS_ALLOCATED_TAG = 'x00280100';
const SAMPLES_PER_PIXEL_TAG = 'x00280002';
const PIXEL_REPRESENTATION_TAG = 'x00280103';
const TRANSFER_SYNTAX_UID_TAG = 'x00020010';

/** Transfer syntaxes we cannot display reliably in the browser; transcode these on upload. */
const UNSUPPORTED_TRANSFER_SYNTAX_UIDS = [
  '1.2.840.10008.1.2.4.90',  // JPEG 2000 Image Compression (Lossless Only)
  '1.2.840.10008.1.2.4.91',  // JPEG 2000 Image Compression
  '1.2.840.10008.1.2.4.80',  // JPEG-LS Lossless
  '1.2.840.10008.1.2.4.81',  // JPEG-LS Lossy
  '1.2.840.10008.1.2.5',    // RLE Lossless
];

/** Target: JPEG Baseline (8-bit) – widely supported in browsers. */
const TARGET_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.4.50';

/**
 * Returns the transfer syntax UID from the DICOM buffer, or null if parse fails.
 */
function getTransferSyntaxUid(buffer: ArrayBuffer): string | null {
  const byteArray = new Uint8Array(buffer);
  try {
    const dataSet = dicomParser.parseDicom(byteArray) as { string: (tag: string) => string | undefined };
    const uid = (dataSet.string(TRANSFER_SYNTAX_UID_TAG) ?? '').trim();
    return uid || null;
  } catch {
    try {
      const dataSet = dicomParser.parseDicom(byteArray, {
        TransferSyntaxUID: '1.2.840.10008.1.2',
      }) as { string: (tag: string) => string | undefined };
      const uid = (dataSet.string(TRANSFER_SYNTAX_UID_TAG) ?? '').trim();
      return uid || null;
    } catch {
      return null;
    }
  }
}

/**
 * Check if this buffer should be transcoded (unsupported transfer syntax).
 */
export function shouldTranscode(buffer: ArrayBuffer): boolean {
  const uid = getTransferSyntaxUid(buffer);
  return Boolean(uid && UNSUPPORTED_TRANSFER_SYNTAX_UIDS.includes(uid));
}

/**
 * Replace the File Meta Transfer Syntax UID (0002,0010) in the given buffer with the new UID.
 * Modifies buf in place. newUid is space-padded or truncated to original value length.
 */
function replaceTransferSyntaxInMeta(buf: Uint8Array, newUid: string): void {
  const newUidBytes = new TextEncoder().encode(newUid);
  for (let i = 0; i <= buf.length - 12; i++) {
    if (
      buf[i] === 0x02 && buf[i + 1] === 0x00 &&
      buf[i + 2] === 0x10 && buf[i + 3] === 0x00 &&
      buf[i + 4] === 0x55 && buf[i + 5] === 0x49
    ) {
      const valueOffset = i + 8;  // after tag(4) + VR(2) + reserved(2)
      const lengthOffset = i + 6; // UI has 2-byte length at +6, +7
      const origLen = buf[lengthOffset]! + (buf[lengthOffset + 1]! << 8);
      const maxLen = Math.min(origLen, newUidBytes.length);
      for (let j = 0; j < origLen; j++) {
        buf[valueOffset + j] = j < maxLen ? newUidBytes[j]! : 0x20; // pad with space
      }
      return;
    }
  }
}

/**
 * Build the new DICOM buffer: header up to (but not including) Pixel Data, then new Pixel Data element.
 * Encapsulated format for JPEG Baseline: Item (basic offset table length 0) + Item (frame length + jpeg bytes).
 */
function buildNewDicomBuffer(
  originalBuffer: ArrayBuffer,
  pixelDataElementStartOffset: number,
  encodedFrame: Uint8Array
): ArrayBuffer {
  const headerPart = originalBuffer.slice(0, pixelDataElementStartOffset);
  const header = new Uint8Array(headerPart);
  replaceTransferSyntaxInMeta(header, TARGET_TRANSFER_SYNTAX_UID);

  // Pixel Data (7FE0,0010), VR OB, undefined length (0xFFFFFFFF)
  const tag = new Uint8Array([0xe0, 0x7f, 0x10, 0x00, 0x4f, 0x42, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff]);
  // Item (FFFE,E000) length 0 – basic offset table
  const itemDelim = new Uint8Array([0xfe, 0xff, 0xe0, 0x00]);
  const zeroLen = new Uint8Array([0, 0, 0, 0]);
  // Item (FFFE,E000) length = encodedFrame.length
  const frameLen = new Uint8Array(4);
  new DataView(frameLen.buffer).setUint32(0, encodedFrame.length, true);
  // Sequence delimiter (FFFE,E0DD) length 0
  const seqDelim = new Uint8Array([0xfe, 0xff, 0xdd, 0xe0, 0x00, 0x00, 0x00, 0x00]);

  const totalLen =
    header.byteLength + tag.byteLength + itemDelim.byteLength + zeroLen.byteLength +
    itemDelim.byteLength + frameLen.byteLength + encodedFrame.length + seqDelim.byteLength;
  const out = new Uint8Array(totalLen);
  let off = 0;
  out.set(header, off); off += header.length;
  out.set(tag, off); off += tag.length;
  out.set(itemDelim, off); off += itemDelim.length;
  out.set(zeroLen, off); off += zeroLen.length;
  out.set(itemDelim, off); off += itemDelim.length;
  out.set(frameLen, off); off += frameLen.length;
  out.set(encodedFrame, off); off += encodedFrame.length;
  out.set(seqDelim, off);
  return out.buffer;
}

/**
 * Transcode DICOM to a browser-displayable format (JPEG Baseline) when the transfer syntax
 * is unsupported. Returns the new DICOM buffer, or null if no transcode was needed or possible.
 */
export async function transcodeIfNeeded(buffer: ArrayBuffer): Promise<ArrayBuffer | null> {
  const uid = getTransferSyntaxUid(buffer);
  if (!uid || !UNSUPPORTED_TRANSFER_SYNTAX_UIDS.includes(uid)) {
    return null;
  }

  const byteArray = new Uint8Array(buffer);
  let dataSet: {
    elements: Record<string, { dataOffset?: number; length?: number; encapsulatedPixelData?: boolean; fragments?: Array<{ offset: number; position: number; length: number }>; basicOffsetTable?: number[] }>;
    byteArray: { buffer: ArrayBuffer; byteOffset: number };
    string: (tag: string) => string | undefined;
    uint16: (tag: string) => number;
  };
  try {
    dataSet = dicomParser.parseDicom(byteArray) as typeof dataSet;
  } catch {
    try {
      dataSet = dicomParser.parseDicom(byteArray, { TransferSyntaxUID: '1.2.840.10008.1.2' }) as typeof dataSet;
    } catch (e) {
      console.error('[transcodeDicom] Parse failed:', e);
      return null;
    }
  }

  const pixelDataElement = dataSet.elements[PIXEL_DATA_TAG] as
    | { dataOffset?: number; length?: number; encapsulatedPixelData?: boolean; fragments?: Array<{ offset: number; position: number; length: number }>; basicOffsetTable?: number[] }
    | undefined;
  if (!pixelDataElement?.encapsulatedPixelData || !pixelDataElement.fragments?.length) {
    console.error('[transcodeDicom] No encapsulated pixel data or fragments');
    return null;
  }

  const rows = dataSet.uint16(ROWS_TAG) || 0;
  const columns = dataSet.uint16(COLUMNS_TAG) || 0;
  const bitsAllocated = dataSet.uint16(BITS_ALLOCATED_TAG) || 8;
  const samplesPerPixel = dataSet.uint16(SAMPLES_PER_PIXEL_TAG) || 1;
  const pixelRepresentation = dataSet.uint16(PIXEL_REPRESENTATION_TAG) ?? 0;

  if (rows === 0 || columns === 0) {
    console.error('[transcodeDicom] Invalid rows/columns');
    return null;
  }

  let encapsulatedFrame: Uint8Array;
  const ds = dataSet as unknown as dicomParser.DataSet;
  const el = pixelDataElement as unknown as dicomParser.Element;
  try {
    if (el.basicOffsetTable && el.basicOffsetTable.length > 0) {
      encapsulatedFrame = dicomParser.readEncapsulatedImageFrame(ds, el, 0) as Uint8Array;
    } else {
      encapsulatedFrame = dicomParser.readEncapsulatedPixelDataFromFragments(
        ds,
        el,
        0,
        el.fragments!.length,
        el.fragments
      ) as Uint8Array;
    }
  } catch (e) {
    console.error('[transcodeDicom] Failed to read encapsulated frame:', e);
    return null;
  }

  const imageInfo = {
    rows,
    columns,
    bitsAllocated,
    samplesPerPixel,
    signed: pixelRepresentation === 1,
    pixelRepresentation,
  };

  let result: { imageFrame: Uint8Array; imageInfo: unknown };
  try {
    const dicomCodec = await import('@cornerstonejs/dicom-codec');
    result = await dicomCodec.default.transcode(
      encapsulatedFrame,
      imageInfo,
      uid,
      TARGET_TRANSFER_SYNTAX_UID
    );
  } catch (e) {
    console.error('[transcodeDicom] Codec transcode failed:', e);
    return null;
  }

  const raw = result.imageFrame;
  const encodedFrame = new Uint8Array(raw.length);
  encodedFrame.set(raw);
  if (encodedFrame.length === 0) {
    console.error('[transcodeDicom] Empty encoded frame');
    return null;
  }

  const dataOffset = pixelDataElement.dataOffset ?? 0;
  const byteOffset = dataSet.byteArray.byteOffset;
  const pixelDataElementStart = byteOffset + dataOffset - 12;

  if (pixelDataElementStart < 0) {
    console.error('[transcodeDicom] Invalid pixel data offset');
    return null;
  }

  return buildNewDicomBuffer(buffer, pixelDataElementStart, encodedFrame);
}
