'use client';

import { useState, useEffect } from 'react';
import { parseWadoImageId, getInstancePreview, getInstanceFrame, isDicomWebConfigured } from '@/lib/ohif/dicomweb';
import { dicomBufferToDataUrl } from '@/lib/ohif/dicomToDataUrl';

type SeriesThumbnailProps = {
  /** First imageId of the series (wado:...) to fetch rendered frame as thumbnail. */
  imageId: string | undefined;
  alt?: string;
  className?: string;
};

export function SeriesThumbnail({ imageId, alt = 'Series', className = '' }: SeriesThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageId || !isDicomWebConfigured()) {
      setSrc(null);
      return;
    }
    const parsed = parseWadoImageId(imageId);
    if (!parsed) {
      setSrc(null);
      return;
    }
    let revoked = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const dataUrl = await getInstancePreview(parsed.study, parsed.series, parsed.sop);
        if (!revoked) setSrc(dataUrl);
      } catch {
        if (revoked) return;
        try {
          const buffer = await getInstanceFrame(parsed.study, parsed.series, parsed.sop);
          const dataUrl = await dicomBufferToDataUrl(buffer);
          if (!revoked) setSrc(dataUrl);
        } catch (e) {
          if (!revoked) setError(e instanceof Error ? e.message : 'Failed');
        }
      } finally {
        if (!revoked) setLoading(false);
      }
    })();
    return () => {
      revoked = true;
    };
  }, [imageId]);

  if (error) {
    return (
      <div className={`w-12 h-12 rounded bg-muted shrink-0 flex items-center justify-center text-xs text-destructive ${className}`}>
        Err
      </div>
    );
  }
  if (loading || !src) {
    return (
      <div className={`w-12 h-12 rounded bg-muted shrink-0 flex items-center justify-center text-xs text-muted-foreground animate-pulse ${className}`}>
        …
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data URL from decoded DICOM
    <img
      src={src}
      alt={alt}
      className={`w-12 h-12 rounded object-cover shrink-0 bg-muted ${className}`}
      onError={() => setError('Failed to display')}
    />
  );
}
