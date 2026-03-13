'use client';

import { useEffect, useState } from 'react';

type ServerImagePreviewProps = {
    file: File;
    className?: string;
    /** Optional max height for the container (e.g. max-h-[320px]) */
    containerClassName?: string;
};

/**
 * Fetches a preview image from the backend /preview API and displays it.
 * Used for formats that don't render in the browser (e.g. TIFF) or when
 * inline preview fails (e.g. unsupported MIME in img).
 */
export function ServerImagePreview({ file, className = '', containerClassName = 'max-w-[420px] max-h-[320px]' }: ServerImagePreviewProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!file) return;

        setLoading(true);
        setError(null);
        setPreviewUrl(null);

        const formData = new FormData();
        formData.append('image', file, file.name);

        fetch('/dashboard/tuberculosis_diagnosis/api/preview', {
            method: 'POST',
            body: formData,
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.success && data.image_base64) {
                    setPreviewUrl(`data:image/png;base64,${data.image_base64}`);
                    setError(null);
                } else {
                    setError(data.message || 'Could not load preview. The file will still be analyzed.');
                }
            })
            .catch(() => {
                setError('Could not load preview. Ensure the backend is running. The file will still be analyzed.');
            })
            .finally(() => setLoading(false));
    }, [file]);

    if (error && !previewUrl) {
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
            {loading && !previewUrl && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-muted/30 z-10">
                    <span className="text-sm text-muted-foreground">Loading preview…</span>
                </div>
            )}
            <div
                className={`mx-auto overflow-hidden rounded-xl border border-border/50 bg-black/5 dark:bg-white/5 flex items-center justify-center ${containerClassName}`}
            >
                {previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- dynamic base64 from API
                    <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-w-full max-h-[320px] w-auto h-auto object-contain"
                    />
                )}
            </div>
        </div>
    );
}
