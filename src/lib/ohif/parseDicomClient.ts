/**
 * Client-side DICOM metadata extraction for the missing-data dialog.
 * Uses dicom-parser to read tags from a File and determine which fields are missing.
 */

import dicomParser from 'dicom-parser';

const TRANSFER_SYNTAX_IMPLICIT_LE = '1.2.840.10008.1.2';

export const MISSING_KEYS = {
  required: ['patientName', 'patientId', 'patientSex', 'patientBirthDate'] as const,
  optional: ['studyDescription', 'accessionNumber'] as const,
};

export type MissingRequiredKey = (typeof MISSING_KEYS.required)[number];
export type MissingOptionalKey = (typeof MISSING_KEYS.optional)[number];

export type ParsedDicomClientResult = {
  values: Record<string, string>;
  missingRequired: MissingRequiredKey[];
  missingOptional: MissingOptionalKey[];
};

function getStr(dataSet: { string: (tag: string) => string | undefined }, tag: string): string {
  return (dataSet.string(tag) ?? '').trim();
}

function parseOne(byteArray: Uint8Array): Record<string, string> | null {
  let dataSet: { string: (tag: string) => string | undefined };
  try {
    dataSet = dicomParser.parseDicom(byteArray);
  } catch {
    try {
      dataSet = dicomParser.parseDicom(byteArray, { TransferSyntaxUID: TRANSFER_SYNTAX_IMPLICIT_LE });
    } catch {
      return null;
    }
  }
  const patientName = getStr(dataSet, 'x00100010').replace(/\^/g, ' ').trim() || '';
  const patientId = getStr(dataSet, 'x00100020') || '';
  const patientSex = getStr(dataSet, 'x00100040') || '';
  const patientBirthDate = getStr(dataSet, 'x00100030') || '';
  const studyDescription = getStr(dataSet, 'x00081030') || '';
  const accessionNumber = getStr(dataSet, 'x00080050') || '';
  return {
    patientName: patientName || '',
    patientId: patientId || '',
    patientSex: patientSex || '',
    patientBirthDate: patientBirthDate || '',
    studyDescription: studyDescription || '',
    accessionNumber: accessionNumber || '',
  };
}

function isMissingRequired(values: Record<string, string>): MissingRequiredKey[] {
  const out: MissingRequiredKey[] = [];
  if (!values.patientName) out.push('patientName');
  if (!values.patientId || values.patientId === '—') out.push('patientId');
  if (!values.patientSex) out.push('patientSex');
  if (!values.patientBirthDate) out.push('patientBirthDate');
  return out;
}

function isMissingOptional(values: Record<string, string>): MissingOptionalKey[] {
  const out: MissingOptionalKey[] = [];
  if (!values.studyDescription) out.push('studyDescription');
  if (!values.accessionNumber) out.push('accessionNumber');
  return out;
}

/**
 * Parse the first file and return extracted values plus which fields are missing.
 * Used to drive the single missing-data dialog before upload.
 */
export async function parseDicomFileForMissingFields(file: File): Promise<ParsedDicomClientResult | null> {
  const buffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(buffer);
  const values = parseOne(byteArray);
  if (!values) return null;
  return {
    values,
    missingRequired: isMissingRequired(values),
    missingOptional: isMissingOptional(values),
  };
}

/**
 * Parse multiple files and merge: a field is "present" if any file has a non-empty value.
 * Returns one result for the whole batch (one dialog).
 */
export async function parseDicomFilesForMissingFields(files: File[]): Promise<ParsedDicomClientResult | null> {
  if (files.length === 0) return null;
  const merged: Record<string, string> = {
    patientName: '',
    patientId: '',
    patientSex: '',
    patientBirthDate: '',
    studyDescription: '',
    accessionNumber: '',
  };
  let anyParsed = false;
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const byteArray = new Uint8Array(buffer);
    const one = parseOne(byteArray);
    if (!one) continue;
    anyParsed = true;
    if (one.patientName && !merged.patientName) merged.patientName = one.patientName;
    if (one.patientId && one.patientId !== '—' && !merged.patientId) merged.patientId = one.patientId;
    if (one.patientSex && !merged.patientSex) merged.patientSex = one.patientSex;
    if (one.patientBirthDate && !merged.patientBirthDate) merged.patientBirthDate = one.patientBirthDate;
    if (one.studyDescription && !merged.studyDescription) merged.studyDescription = one.studyDescription;
    if (one.accessionNumber && !merged.accessionNumber) merged.accessionNumber = one.accessionNumber;
  }
  if (!anyParsed) return null;
  return {
    values: merged,
    missingRequired: isMissingRequired(merged),
    missingOptional: isMissingOptional(merged),
  };
}
