/**
 * Parse DICOM instance buffer for metadata needed for measurements (pixel spacing, dimensions).
 * Does not decode pixel data. Used by viewer to compute length in mm and area in mm².
 */

import dicomParser from 'dicom-parser';

const ROWS_TAG = 'x00280010';
const COLUMNS_TAG = 'x00280011';
const PIXEL_SPACING_TAG = 'x00280030'; // DS: "row_spacing\\column_spacing" in mm
const TRANSFER_SYNTAX_IMPLICIT_LE = '1.2.840.10008.1.2';

export interface InstanceMetadata {
  rows: number;
  columns: number;
  /** Row pixel spacing in mm (height of one pixel). */
  rowPixelSpacing: number;
  /** Column pixel spacing in mm (width of one pixel). */
  columnPixelSpacing: number;
}

/**
 * Parse DICOM buffer and return metadata for measurement calculations.
 * Returns default spacing of 1 mm if Pixel Spacing (0028,0030) is missing.
 */
export function parseInstanceMetadata(buffer: ArrayBuffer): InstanceMetadata | null {
  const byteArray = new Uint8Array(buffer);
  let dataSet: {
    string: (tag: string) => string | undefined;
    uint16: (tag: string) => number;
  };
  try {
    dataSet = dicomParser.parseDicom(byteArray) as typeof dataSet;
  } catch {
    try {
      dataSet = dicomParser.parseDicom(byteArray, { TransferSyntaxUID: TRANSFER_SYNTAX_IMPLICIT_LE }) as typeof dataSet;
    } catch {
      return null;
    }
  }
  const rows = dataSet.uint16(ROWS_TAG) || 0;
  const columns = dataSet.uint16(COLUMNS_TAG) || 0;
  if (rows === 0 || columns === 0) return null;

  let rowPixelSpacing = 1;
  let columnPixelSpacing = 1;
  const pixelSpacingStr = (dataSet.string(PIXEL_SPACING_TAG) ?? '').trim();
  if (pixelSpacingStr) {
    const parts = pixelSpacingStr.split(/[\\/]/).map((s) => parseFloat(s.trim()));
    if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1]) && parts[0] > 0 && parts[1] > 0) {
      rowPixelSpacing = parts[0];
      columnPixelSpacing = parts[1];
    }
  }

  return {
    rows,
    columns,
    rowPixelSpacing,
    columnPixelSpacing,
  };
}
