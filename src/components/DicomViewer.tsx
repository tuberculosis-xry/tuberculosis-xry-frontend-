'use client';

import { useEffect, useRef, useState } from 'react';
import dicomParser from 'dicom-parser';

const PIXEL_DATA_TAG = 'x7fe00010';
const ROWS_TAG = 'x00280010';
const COLUMNS_TAG = 'x00280011';
const BITS_ALLOCATED_TAG = 'x00280100';
const PIXEL_REPRESENTATION_TAG = 'x00280103';
const RESCALE_SLOPE_TAG = 'x00281053';
const RESCALE_INTERCEPT_TAG = 'x00281052';
const PHOTOMETRIC_TAG = 'x00280004';
const TRANSFER_SYNTAX_UID_TAG = 'x00020010';

const COMPRESSED_PREFIXES = [
  '1.2.840.10008.1.2.4.',
  '1.2.840.10008.1.2.5',
];

function isCompressedTransferSyntax(uid: string): boolean {
  const normalized = (uid || '').trim();
  if (!normalized) return false;
  return COMPRESSED_PREFIXES.some((p) => normalized === p || normalized.startsWith(p));
}

function isBigEndianTransferSyntax(uid: string): boolean {
  const normalized = (uid || '').trim();
  return normalized === '1.2.840.10008.1.2.2';
}

function swap16(buffer: ArrayBuffer, byteOffset: number, lengthBytes: number): void {
  const view = new Uint8Array(buffer, byteOffset, lengthBytes);
  for (let i = 0; i < lengthBytes - 1; i += 2) {
    const t = view[i];
    view[i] = view[i + 1];
    view[i + 1] = t;
  }
}

type DicomViewerProps = {
  file: File;
  className?: string;
};

export function DicomViewer({ file, className = '' }: DicomViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverPreviewUrl, setServerPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!file) return;

    setError(null);
    setLoading(true);
    setServerPreviewUrl(null);

    const tryServerPreview = () => {
      const formData = new FormData();
      formData.append('image', file, file.name);
      fetch('/dashboard/tuberculosis_diagnosis/api/preview', {
        method: 'POST',
        body: formData,
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.image_base64) {
            setServerPreviewUrl(`data:image/png;base64,${data.image_base64}`);
            setError(null);
          } else {
            setError(data.message || 'Could not load preview. The file will still be analyzed.');
          }
        })
        .catch(() => {
          setError('Could not load preview. Ensure the backend is running. The file will still be analyzed.');
        })
        .finally(() => setLoading(false));
    };

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const byteArray = new Uint8Array(arrayBuffer);
        const dataSet = dicomParser.parseDicom(byteArray);

        const transferSyntaxUid = (dataSet.string(TRANSFER_SYNTAX_UID_TAG) || '').trim();
        if (isCompressedTransferSyntax(transferSyntaxUid)) {
          tryServerPreview();
          return;
        }

        const pixelDataElement = dataSet.elements[PIXEL_DATA_TAG];
        if (!pixelDataElement || pixelDataElement.length === undefined || pixelDataElement.length === 0) {
          tryServerPreview();
          return;
        }

        const rows = dataSet.uint16(ROWS_TAG) || 0;
        const columns = dataSet.uint16(COLUMNS_TAG) || 0;
        if (rows === 0 || columns === 0) {
          tryServerPreview();
          return;
        }

        const bitsAllocated = dataSet.uint16(BITS_ALLOCATED_TAG) || 8;
        const pixelRepresentation = dataSet.uint16(PIXEL_REPRESENTATION_TAG) ?? 0;
        const slope =
          dataSet.floatString?.(RESCALE_SLOPE_TAG) ??
          dataSet.float?.(RESCALE_SLOPE_TAG) ??
          1;
        const intercept =
          dataSet.floatString?.(RESCALE_INTERCEPT_TAG) ??
          dataSet.float?.(RESCALE_INTERCEPT_TAG) ??
          0;
        const photometric = (dataSet.string(PHOTOMETRIC_TAG) || '').toUpperCase();
        const isBigEndian = isBigEndianTransferSyntax(transferSyntaxUid);

        const buffer = dataSet.byteArray.buffer;
        const baseOffset = dataSet.byteArray.byteOffset + pixelDataElement.dataOffset;
        const pixelByteLength = pixelDataElement.length;

        let pixelData: Float32Array;
        if (bitsAllocated === 16) {
          if (pixelByteLength % 2 !== 0) {
            tryServerPreview();
            return;
          }
          const numPixels = pixelByteLength / 2;
          const workBuffer = buffer.slice(baseOffset, baseOffset + pixelByteLength) as ArrayBuffer;
          if (isBigEndian) swap16(workBuffer, 0, pixelByteLength);
          const raw = pixelRepresentation === 1
            ? new Int16Array(workBuffer, 0, numPixels)
            : new Uint16Array(workBuffer, 0, numPixels);
          pixelData = new Float32Array(raw.length);
          for (let i = 0; i < raw.length; i++) {
            pixelData[i] = raw[i] * slope + intercept;
          }
        } else {
          const raw = new Uint8Array(buffer, baseOffset, pixelByteLength);
          pixelData = new Float32Array(raw.length);
          for (let i = 0; i < raw.length; i++) {
            pixelData[i] = raw[i] * slope + intercept;
          }
        }

        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < pixelData.length; i++) {
          const v = pixelData[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        if (min === max) max = min + 1;

        const range = max - min;
        const imageData = new Uint8ClampedArray(rows * columns * 4);
        for (let i = 0; i < pixelData.length; i++) {
          let val = Math.round(((pixelData[i] - min) / range) * 255);
          val = Math.max(0, Math.min(255, val));
          if (photometric === 'MONOCHROME1') val = 255 - val;
          imageData[i * 4] = val;
          imageData[i * 4 + 1] = val;
          imageData[i * 4 + 2] = val;
          imageData[i * 4 + 3] = 255;
        }

        if (!canvas) {
          setLoading(false);
          return;
        }
        canvas.width = columns;
        canvas.height = rows;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          tryServerPreview();
          return;
        }
        const imageDataObj = new ImageData(
          new Uint8ClampedArray(imageData),
          columns,
          rows
        );
        ctx.putImageData(imageDataObj, 0, 0);
        setLoading(false);
      } catch {
        tryServerPreview();
      }
    };
    reader.onerror = () => {
      tryServerPreview();
    };
    reader.readAsArrayBuffer(file);

    return () => reader.abort();
  }, [file]);

  if (error && !serverPreviewUrl) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl border border-border/50 bg-muted/30 py-10 text-center ${className}`}
      >
        <p className="text-sm font-medium text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {loading && !serverPreviewUrl && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-muted/30 z-10">
          <span className="text-sm text-muted-foreground">Loading preview…</span>
        </div>
      )}
      <div className="max-w-[420px] max-h-[320px] mx-auto overflow-hidden rounded-xl border border-border/50 bg-black/5 dark:bg-white/5 flex items-center justify-center">
        {serverPreviewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- dynamic base64 from API
          <img
            src={serverPreviewUrl}
            alt="DICOM preview"
            className="max-w-full max-h-[320px] w-auto h-auto object-contain"
          />
        ) : (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[320px] w-auto h-auto object-contain"
            style={{ display: loading ? 'none' : 'block' }}
          />
        )}
      </div>
    </div>
  );
}
