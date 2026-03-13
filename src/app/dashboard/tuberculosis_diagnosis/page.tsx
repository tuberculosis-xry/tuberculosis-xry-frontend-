'use client';

import { useState, useCallback, useRef, useMemo, ChangeEvent, FormEvent, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCachedScans, invalidateCacheForUser } from '@/hooks/useCachedApi';
import { getAuthHeaders } from '@/lib/authHeaders';
import { DicomViewer } from '@/components/DicomViewer';
import { ServerImagePreview } from '@/components/ServerImagePreview';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import {
    Upload,
    FileImage,
    AlertTriangle,
    CheckCircle2,
    Loader2,
    X,
    Stethoscope,
    BarChart3,
    Shield,
    Clock,
    Filter,
    Calendar,
    Search,
    ChevronDown,
    Activity,
} from 'lucide-react';

/* ─── Types ─── */
type PredictionResult = {
    most_common_class: string;
    confidence_score: number;
    confidence: string;
    probabilities: Record<string, number>;
    tta_results?: {
        individual_predictions: string[];
        agreement_score: number;
    };
};

type ScanRecord = {
    id: string;
    timestamp: Date;
    result: string;
    confidence: number;
    patientName: string;
    patientId?: string;
    patientSex?: string;
    patientBirthDate?: string;
    studyDate?: string;
    studyTime?: string;
};

type ScanDetail = {
    id: string;
    timestamp: Date;
    result: string;
    confidence: number;
    patientName: string;
    patientId?: string;
    patientSex?: string;
    patientBirthDate?: string;
    studyDate?: string;
    studyTime?: string;
    imageDataUrl: string;
};

/** Placeholder image when saving DICOM (no browser preview). 1x1 transparent PNG. */
const PLACEHOLDER_IMAGE_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Timeout for prediction request (backend may take 10–30s for TTA). */
const PREDICT_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(
    url: string,
    options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
    const { timeoutMs = PREDICT_TIMEOUT_MS, ...fetchOptions } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
        clearTimeout(id);
        return res;
    } catch (e) {
        clearTimeout(id);
        if (e instanceof Error && e.name === 'AbortError') {
            throw new Error('REQUEST_TIMEOUT');
        }
        throw e;
    }
}

/** Whether the file is DICOM (.dcm). */
function isDicomFile(file: File): boolean {
    return file.name.toLowerCase().endsWith('.dcm');
}

/** Whether the file is TIFF (browsers often cannot display TIFF in img). */
function isTiffFile(file: File): boolean {
    const name = file.name.toLowerCase();
    const type = (file.type || '').toLowerCase();
    return /\.(tiff?|tif)$/.test(name) || type === 'image/tiff' || type === 'image/x-tiff';
}

/** Format DICOM StudyDate (YYYYMMDD) for display. */
function formatStudyDate(studyDate?: string): string | null {
    if (!studyDate || studyDate.length < 8) return null;
    const y = studyDate.slice(0, 4), m = studyDate.slice(4, 6), d = studyDate.slice(6, 8);
    return `${d}/${m}/${y}`;
}

/** Format DICOM StudyTime (HHMM or HHMMSS) for display. */
function formatStudyTime(studyTime?: string): string | null {
    if (!studyTime || !studyTime.trim()) return null;
    const t = studyTime.trim();
    if (t.length >= 4) {
        const h = t.slice(0, 2).padStart(2, '0');
        const m = t.slice(2, 4).padStart(2, '0');
        return t.length >= 6 ? `${h}:${m}:${t.slice(4, 6).padStart(2, '0')}` : `${h}:${m}`;
    }
    return t;
}

/** Format DICOM PatientSex (M/F/O) for display. */
function formatSex(sex?: string): string | null {
    if (!sex || !sex.trim()) return null;
    const s = sex.trim().toUpperCase();
    if (s === 'M') return 'Male';
    if (s === 'F') return 'Female';
    if (s === 'O') return 'Other';
    return sex.trim();
}

/** Compute age in years from DICOM PatientBirthDate (YYYYMMDD), using reference date or today. */
function computeAgeFromBirthDate(birthDate?: string, referenceDate?: string): number | null {
    if (!birthDate || birthDate.length < 4) return null;
    try {
        const ref = referenceDate && referenceDate.length >= 8 ? referenceDate.slice(0, 8) : new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const by = parseInt(birthDate.slice(0, 4), 10);
        const bm = birthDate.length >= 6 ? parseInt(birthDate.slice(4, 6), 10) : 1;
        const bd = birthDate.length >= 8 ? parseInt(birthDate.slice(6, 8), 10) : 1;
        const ry = parseInt(ref.slice(0, 4), 10);
        const rm = ref.length >= 6 ? parseInt(ref.slice(4, 6), 10) : 1;
        const rd = ref.length >= 8 ? parseInt(ref.slice(6, 8), 10) : 1;
        let age = ry - by;
        if (rm < bm || (rm === bm && rd < bd)) age -= 1;
        return age >= 0 ? age : null;
    } catch {
        return null;
    }
}

/* ─── Probability Bar ─── */
function ProbabilityBar({ label, value, isHighest }: { label: string; value: number; isHighest: boolean }) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
                <span className={`font-medium capitalize ${isHighest ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {label}
                </span>
                <span className={`font-mono font-bold ${isHighest ? 'text-primary' : 'text-muted-foreground'}`}>
                    {typeof value === 'number' ? `${value.toFixed(1)}%` : `${value}%`}
                </span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${isHighest
                        ? 'bg-gradient-to-r from-primary to-primary/70'
                        : 'bg-muted-foreground/30'
                        }`}
                    style={{ width: `${Math.min(value, 100)}%` }}
                />
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   TB Diagnosis Page
   ════════════════════════════════════════════════════════════════ */
export default function TBDiagnosisPage() {
    const { user } = useAuth();
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewSrc, setPreviewSrc] = useState<string | null>(null);
    const [inlinePreviewFailed, setInlinePreviewFailed] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [prediction, setPrediction] = useState<PredictionResult | null>(null);
    const [lastPatientInfo, setLastPatientInfo] = useState<Record<string, unknown> | null>(null);
    const [error, setError] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const SCAN_PAGE_SIZE = 50;
    const {
        scans: scansFromHook,
        hasMore: scanHistoryHasMore,
        loading: scanHistoryLoading,
        error: scanHistoryError,
        loadMore: loadMoreScans,
        refetch: refetchScans,
    } = useCachedScans(user?.uid, { limit: SCAN_PAGE_SIZE });
    const scanHistory: ScanRecord[] = useMemo(
        () =>
            scansFromHook.map((s) => ({
                id: s.id,
                timestamp: new Date(s.timestamp),
                result: s.result,
                confidence: s.confidence,
                patientName: s.patientName,
                patientId: s.patientId,
                patientSex: s.patientSex,
                patientBirthDate: s.patientBirthDate,
                studyDate: s.studyDate,
                studyTime: s.studyTime,
            })),
        [scansFromHook]
    );
    const loadingMoreScans = scanHistoryLoading;

    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterSearch, setFilterSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    const [detailsOpen, setDetailsOpen] = useState(false);
    const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
    const [scanDetail, setScanDetail] = useState<ScanDetail | null>(null);
    const [scanDetailLoading, setScanDetailLoading] = useState(false);
    const [scanDetailError, setScanDetailError] = useState<string | null>(null);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterStatus, filterSearch]);

    useEffect(() => {
        if (!selectedScanId || !user?.uid) {
            setScanDetail(null);
            setScanDetailError(null);
            return;
        }
        let cancelled = false;
        setScanDetailLoading(true);
        setScanDetailError(null);
        (async () => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/scans/${selectedScanId}?userId=${encodeURIComponent(user.uid)}`, { headers });
                if (!res.ok) throw new Error(res.status === 404 ? 'Scan not found' : 'Failed to load scan');
                const data = await res.json();
                if (cancelled || !data.scan) return;
                setScanDetail({
                    ...data.scan,
                    timestamp: new Date(data.scan.timestamp),
                });
            } catch (e) {
                if (!cancelled) setScanDetailError(e instanceof Error ? e.message : 'Failed to load scan');
            } finally {
                if (!cancelled) setScanDetailLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedScanId, user?.uid]);

    /* ─── File Handling ─── */
    const handleFile = useCallback((file: File) => {
        const isDicom = isDicomFile(file);

        if (!isDicom && !file.type.startsWith('image/')) {
            setError('Please select a valid image file (JPEG, PNG, BMP, TIFF, WebP) or a DICOM (.dcm) file.');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setError('File size exceeds 10MB limit.');
            return;
        }

        setSelectedFile(file);
        setError('');
        setPrediction(null);
        setInlinePreviewFailed(false);

        if (isDicom) {
            setPreviewSrc(null);
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => setPreviewSrc(reader.result as string);
        reader.readAsDataURL(file);
    }, []);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    };

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
        },
        [handleFile]
    );

    const clearSelection = () => {
        setSelectedFile(null);
        setPreviewSrc(null);
        setInlinePreviewFailed(false);
        setPrediction(null);
        setLastPatientInfo(null);
        setError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    /* ─── Submit ─── */
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!selectedFile) {
            setError('Please select an X-ray image.');
            return;
        }

        setUploading(true);
        setError('');
        setPrediction(null);

        const formData = new FormData();
        formData.append('image', selectedFile);

        try {
            // Try direct backend first (with timeout)
            const response = await fetchWithTimeout(`${API_URL}/predict`, {
                method: 'POST',
                body: formData,
                timeoutMs: PREDICT_TIMEOUT_MS,
            });

            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                const msg =
                    typeof errBody.detail === 'string'
                        ? errBody.detail
                        : errBody.error || errBody.message || `Server error: ${response.status}`;
                throw new Error(msg);
            }

            const data = await response.json();

            if (data.success && data.prediction) {
                setPrediction(data.prediction);
                setLastPatientInfo(data.patient_info && typeof data.patient_info === 'object' ? data.patient_info as Record<string, unknown> : null);

                if (user?.uid) {
                    const info = data.patient_info || {};
                    const imagePayload = data.image_base64 ?? previewSrc ?? PLACEHOLDER_IMAGE_BASE64;
                    const patientName = (info.patient_name != null && String(info.patient_name).trim()) ? String(info.patient_name).trim() : 'Anonymous';
                    const resultClass = (data.prediction.most_common_class || '').toLowerCase();
                    try {
                        const authHeaders = await getAuthHeaders();
                        const saveRes = await fetch('/api/scans', {
                            method: 'POST',
                            headers: { ...authHeaders, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: user.uid,
                                class: resultClass === 'tuberculosis' || resultClass === 'normal' ? resultClass : 'normal',
                                confidenceScore: data.prediction.confidence_score,
                                patientName,
                                patientId: info.patient_id != null ? String(info.patient_id).trim() || undefined : undefined,
                                patientSex: info.patient_sex != null ? String(info.patient_sex).trim() || undefined : undefined,
                                patientBirthDate: info.patient_birth_date != null ? String(info.patient_birth_date).trim() || undefined : undefined,
                                studyDate: info.study_date != null ? String(info.study_date).trim() || undefined : undefined,
                                studyTime: info.study_time != null ? String(info.study_time).trim() || undefined : undefined,
                                imageBase64: imagePayload,
                            }),
                        });
                        const saveJson = await saveRes.json().catch(() => ({}));
                        if (!saveRes.ok) {
                            setError(saveJson?.error || 'Scan could not be saved. Please try again.');
                        }
                        invalidateCacheForUser(user.uid);
                        await refetchScans();
                    } catch {
                        setError('Failed to save scan to history. Please try again.');
                        invalidateCacheForUser(user.uid);
                        await refetchScans();
                    }
                }
            } else {
                setError(data.error || 'Prediction failed. Please try again.');
            }
        } catch (firstErr) {
            const isTimeout =
                firstErr instanceof Error && firstErr.message === 'REQUEST_TIMEOUT';
            if (isTimeout) {
                setError('Request timed out. Please try again.');
                setUploading(false);
                return;
            }
            const firstErrMsg =
                firstErr instanceof Error ? firstErr.message : 'Prediction request failed.';
            // Fallback to API route proxy
            try {
                const proxyResponse = await fetchWithTimeout(
                    '/dashboard/tuberculosis_diagnosis/api',
                    { method: 'POST', body: formData, timeoutMs: PREDICT_TIMEOUT_MS }
                );
                const proxyData = await proxyResponse.json();
                if (proxyData.success && proxyData.prediction) {
                    setPrediction(proxyData.prediction);
                    setLastPatientInfo(proxyData.patient_info && typeof proxyData.patient_info === 'object' ? proxyData.patient_info as Record<string, unknown> : null);

                    if (user?.uid) {
                        const info = proxyData.patient_info || {};
                        const imagePayload = proxyData.image_base64 ?? previewSrc ?? PLACEHOLDER_IMAGE_BASE64;
                        const patientName = (info.patient_name != null && String(info.patient_name).trim()) ? String(info.patient_name).trim() : 'Anonymous';
                        const resultClass = (proxyData.prediction.most_common_class || '').toLowerCase();
                        try {
                            const authHeaders = await getAuthHeaders();
                            const saveRes = await fetch('/api/scans', {
                                method: 'POST',
                                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    userId: user.uid,
                                    class: resultClass === 'tuberculosis' || resultClass === 'normal' ? resultClass : 'normal',
                                    confidenceScore: proxyData.prediction.confidence_score ?? 0,
                                    patientName,
                                    patientId: info.patient_id != null ? String(info.patient_id).trim() || undefined : undefined,
                                    patientSex: info.patient_sex != null ? String(info.patient_sex).trim() || undefined : undefined,
                                    patientBirthDate: info.patient_birth_date != null ? String(info.patient_birth_date).trim() || undefined : undefined,
                                    studyDate: info.study_date != null ? String(info.study_date).trim() || undefined : undefined,
                                    studyTime: info.study_time != null ? String(info.study_time).trim() || undefined : undefined,
                                    imageBase64: imagePayload,
                                }),
                            });
                            const saveJson = await saveRes.json().catch(() => ({}));
                            if (!saveRes.ok) {
                                setError(saveJson?.error || 'Scan could not be saved. Please try again.');
                            }
                            invalidateCacheForUser(user.uid);
                            await refetchScans();
                        } catch {
                            setError('Failed to save scan to history. Please try again.');
                            invalidateCacheForUser(user.uid);
                            await refetchScans();
                        }
                    }
                } else {
                    const proxyErrMsg =
                        typeof proxyData.error === 'object' && proxyData.error && typeof (proxyData.error as { detail?: string }).detail === 'string'
                            ? (proxyData.error as { detail: string }).detail
                            : typeof proxyData.error === 'string'
                                ? proxyData.error
                                : proxyData.message;
                    setError(
                        proxyErrMsg ||
                            'Unable to connect to the AI model. Please ensure the backend is running.'
                    );
                }
            } catch (proxyErr) {
                const proxyTimeout =
                    proxyErr instanceof Error && proxyErr.message === 'REQUEST_TIMEOUT';
                setError(
                    proxyTimeout
                        ? 'Request timed out. Please try again.'
                        : firstErrMsg || 'Unable to connect to the AI model. Please ensure the backend is running on ' + API_URL
                );
            }
        } finally {
            setUploading(false);
        }
    };

    /* ─── Filter History ─── */
    const filteredHistory = scanHistory.filter((record) => {
        if (filterStatus !== 'all' && record.result !== filterStatus) return false;
        if (filterSearch) {
            const q = filterSearch.toLowerCase();
            const matchName = (record.patientName || '').toLowerCase().includes(q);
            const matchId = (record.patientId || '').toLowerCase().includes(q) || record.id.toLowerCase().includes(q);
            const matchDate = (record.studyDate || '').toLowerCase().includes(q);
            const matchSex = (formatSex(record.patientSex) || record.patientSex || '').toLowerCase().includes(q);
            if (!matchName && !matchId && !matchDate && !matchSex) return false;
        }
        return true;
    });

    const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
    const paginatedHistory = filteredHistory.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const getPageNumbers = () => {
        const pages = [];
        const maxPagesToShow = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = startPage + maxPagesToShow - 1;

        if (endPage > totalPages) {
            endPage = totalPages;
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }
        return pages;
    };

    const isTB = prediction?.most_common_class === 'tuberculosis';
    const confidencePercent = prediction ? (prediction.confidence_score * 100) : 0;

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* ─── Page Header ─── */}
            <div className="animate-slide-up">
                <h1 className="font-display text-3xl font-bold mb-2">
                    <span className="gradient-text">TB</span> X-ray Diagnosis
                </h1>
                <p className="text-muted-foreground">
                    Upload a chest X-ray image for AI-powered tuberculosis analysis
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ═══════════════ Upload & Form Panel ═══════════════ */}
                <div className="lg:col-span-2 space-y-6">
                    <form onSubmit={handleSubmit}>
                        {/* Upload Zone */}
                        <div className="glass-card rounded-2xl p-6 animate-slide-up opacity-0 delay-100">
                            <h2 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
                                <FileImage className="w-5 h-5 text-primary" />
                                File Upload
                            </h2>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".dcm,image/*"
                                onChange={handleFileChange}
                                className="hidden"
                                id="file-upload"
                            />

                            {!selectedFile ? (
                                <label
                                    htmlFor="file-upload"
                                    className={`upload-zone min-h-[200px] ${dragOver ? 'drag-over' : ''}`}
                                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={handleDrop}
                                >
                                    <Upload className="w-10 h-10 text-muted-foreground mb-4" />
                                    <p className="font-medium mb-1">Drop image or DICOM file here, or click to browse</p>
                                    <p className="text-xs text-muted-foreground">
                                        JPEG, PNG, BMP, TIFF, WebP, DICOM (.dcm) • Max 10MB
                                    </p>
                                </label>
                            ) : selectedFile && isDicomFile(selectedFile) ? (
                                <div className="relative">
                                    <div className="max-w-[420px] max-h-[320px] mx-auto">
                                        <DicomViewer file={selectedFile} />
                                    </div>
                                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                        <span className="font-medium text-foreground shrink-0">File uploaded</span>
                                        <span className="truncate">{selectedFile?.name}</span>
                                        <span className="text-xs shrink-0">
                                            ({((selectedFile?.size || 0) / 1024 / 1024).toFixed(2)} MB)
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearSelection}
                                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-destructive/20 hover:text-destructive transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : selectedFile && (isTiffFile(selectedFile) || inlinePreviewFailed) ? (
                                <div className="relative">
                                    <ServerImagePreview
                                        file={selectedFile}
                                        containerClassName="max-w-full max-h-[350px]"
                                    />
                                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                        <span className="font-medium text-foreground shrink-0">File uploaded</span>
                                        <span className="truncate">{selectedFile?.name}</span>
                                        <span className="text-xs shrink-0">
                                            ({((selectedFile?.size || 0) / 1024 / 1024).toFixed(2)} MB)
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearSelection}
                                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-destructive/20 hover:text-destructive transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : previewSrc ? (
                                <div className="relative">
                                    <div className="relative rounded-xl overflow-hidden border border-border/50">
                                        {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview; onError fallback for unsupported formats */}
                                        <img
                                            src={previewSrc}
                                            alt="Preview"
                                            className="w-full h-auto max-h-[350px] object-contain bg-black/5 dark:bg-white/5"
                                            onError={() => setInlinePreviewFailed(true)}
                                        />
                                        <button
                                            type="button"
                                            onClick={clearSelection}
                                            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-destructive/20 hover:text-destructive transition-all"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                        <span className="font-medium text-foreground shrink-0">File uploaded</span>
                                        <span className="truncate">{selectedFile?.name}</span>
                                        <span className="text-xs">
                                            ({((selectedFile?.size || 0) / 1024 / 1024).toFixed(2)} MB)
                                        </span>
                                    </div>
                                </div>
                            ) : selectedFile ? (
                                <div className="relative flex flex-col items-center justify-center py-12 rounded-xl border border-border/50 bg-muted/30">
                                    <Loader2 className="w-8 h-8 text-muted-foreground animate-spin mb-2" />
                                    <p className="text-sm text-muted-foreground">Loading preview…</p>
                                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                        <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearSelection}
                                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-destructive/20 hover:text-destructive transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : null}
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-xl px-4 py-3 mt-4 animate-slide-up">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        {selectedFile && (
                            <button
                                type="submit"
                                disabled={uploading}
                                className="btn-premium w-full py-4 rounded-2xl text-primary-foreground font-semibold text-base flex items-center justify-center gap-2 mt-4 disabled:opacity-50 animate-slide-up opacity-0 delay-300"
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Analyzing X-ray...
                                    </>
                                ) : (
                                    <>
                                        <Stethoscope className="w-5 h-5" />
                                        Analyze X-ray
                                    </>
                                )}
                            </button>
                        )}
                    </form>
                </div>

                {/* ═══════════════ Results Panel ═══════════════ */}
                <div className="space-y-6" aria-live="polite" aria-atomic="true">
                    {/* Results */}
                    {prediction ? (
                        <div className="glass-card rounded-2xl p-6 animate-slide-up" role="status" aria-label={`Result: ${isTB ? 'Tuberculosis detected' : 'Normal'}, confidence ${confidencePercent.toFixed(1)}%`}>
                            {/* Verdict Badge */}
                            <div className={`text-center p-6 rounded-2xl mb-6 ${isTB
                                ? 'bg-destructive/10 border border-destructive/20'
                                : 'bg-success/10 border border-success/20'
                                }`}>
                                <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${isTB ? 'bg-destructive/20' : 'bg-success/20'
                                    }`}>
                                    {isTB ? (
                                        <AlertTriangle className="w-8 h-8 text-destructive" />
                                    ) : (
                                        <CheckCircle2 className="w-8 h-8 text-success" />
                                    )}
                                </div>
                                <h3 className={`font-display text-xl font-bold mb-1 ${isTB ? 'text-destructive' : 'text-success'
                                    }`}>
                                    {isTB ? 'TB Detected' : 'Normal'}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {isTB ? 'Tuberculosis indicators found in X-ray' : 'No tuberculosis indicators detected'}
                                </p>
                            </div>

                            {/* Confidence Meter */}
                            <div className="mb-6">
                                <div className="flex items-center justify-between text-sm mb-2">
                                    <span className="font-medium flex items-center gap-1.5">
                                        <Shield className="w-4 h-4 text-primary" />
                                        Confidence
                                    </span>
                                    <span className={`font-mono font-bold text-lg ${prediction.confidence === 'High' ? 'text-success' :
                                        prediction.confidence === 'Medium' ? 'text-accent' : 'text-destructive'
                                        }`}>
                                        {confidencePercent.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="confidence-meter">
                                    <div
                                        className="confidence-meter-fill"
                                        style={{ width: `${confidencePercent}%` }}
                                    />
                                </div>
                                <div className="flex justify-between mt-1.5">
                                    <span className="text-xs text-muted-foreground">Low</span>
                                    <span className={`text-xs font-semibold ${prediction.confidence === 'High' ? 'text-success' :
                                        prediction.confidence === 'Medium' ? 'text-accent' : 'text-destructive'
                                        }`}>
                                        {prediction.confidence} Confidence
                                    </span>
                                    <span className="text-xs text-muted-foreground">High</span>
                                </div>
                            </div>

                            {/* Probability Breakdown */}
                            <div className="mb-6">
                                <h3 className="font-display text-sm font-bold mb-3 flex items-center gap-1.5">
                                    <BarChart3 className="w-4 h-4 text-primary" />
                                    Probability Breakdown
                                </h3>
                                <div className="space-y-3">
                                    {Object.entries(prediction.probabilities)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([label, value]) => (
                                            <ProbabilityBar
                                                key={label}
                                                label={label}
                                                value={value}
                                                isHighest={label === prediction.most_common_class}
                                            />
                                        ))}
                                </div>
                            </div>

                            {/* Patient details (from DICOM) */}
                            {lastPatientInfo && Object.keys(lastPatientInfo).length > 0 && (
                                <div className="mb-6">
                                    <h3 className="font-display text-sm font-bold mb-2">Patient details</h3>
                                    <dl className="grid gap-1.5 text-sm p-4 rounded-xl bg-secondary/30">
                                        {lastPatientInfo.patient_name != null && String(lastPatientInfo.patient_name).trim() !== '' && (
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Name:</dt>
                                                <dd className="min-w-0">{String(lastPatientInfo.patient_name).trim()}</dd>
                                            </div>
                                        )}
                                        {lastPatientInfo.patient_id != null && String(lastPatientInfo.patient_id).trim() !== '' && (
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Patient ID:</dt>
                                                <dd className="min-w-0">{String(lastPatientInfo.patient_id).trim()}</dd>
                                            </div>
                                        )}
                                        {lastPatientInfo.patient_sex != null && String(lastPatientInfo.patient_sex).trim() !== '' && (
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Sex:</dt>
                                                <dd className="min-w-0">{formatSex(String(lastPatientInfo.patient_sex).trim()) ?? String(lastPatientInfo.patient_sex ?? '')}</dd>
                                            </div>
                                        )}
                                        {lastPatientInfo.patient_birth_date != null && String(lastPatientInfo.patient_birth_date).trim() !== '' && (
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Date of birth:</dt>
                                                <dd className="min-w-0">{formatStudyDate(String(lastPatientInfo.patient_birth_date).trim()) ?? String(lastPatientInfo.patient_birth_date ?? '')}</dd>
                                            </div>
                                        )}
                                        {(lastPatientInfo.patient_age != null || (lastPatientInfo.patient_age_str != null && String(lastPatientInfo.patient_age_str).trim() !== '')) && (
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Age:</dt>
                                                <dd className="min-w-0">
                                                    {lastPatientInfo.patient_age_str != null && String(lastPatientInfo.patient_age_str).trim() !== ''
                                                        ? String(lastPatientInfo.patient_age_str).trim()
                                                        : lastPatientInfo.patient_age != null
                                                            ? `${lastPatientInfo.patient_age} yrs`
                                                            : '—'}
                                                </dd>
                                            </div>
                                        )}
                                        {lastPatientInfo.study_date != null && String(lastPatientInfo.study_date).trim() !== '' && (
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Study date:</dt>
                                                <dd className="min-w-0">{formatStudyDate(String(lastPatientInfo.study_date).trim()) ?? String(lastPatientInfo.study_date ?? '')}</dd>
                                            </div>
                                        )}
                                        {lastPatientInfo.study_time != null && String(lastPatientInfo.study_time).trim() !== '' && (
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Study time:</dt>
                                                <dd className="min-w-0">{formatStudyTime(String(lastPatientInfo.study_time).trim()) ?? String(lastPatientInfo.study_time ?? '')}</dd>
                                            </div>
                                        )}
                                        {lastPatientInfo.patient_weight != null && String(lastPatientInfo.patient_weight).trim() !== '' && (
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Weight:</dt>
                                                <dd className="min-w-0">{String(lastPatientInfo.patient_weight).trim()}</dd>
                                            </div>
                                        )}
                                    </dl>
                                </div>
                            )}

                            {/* TTA Info */}
                            {prediction.tta_results && (
                                <div className="p-4 rounded-xl bg-secondary/30 text-sm">
                                    <p className="font-medium mb-1 flex items-center gap-1.5">
                                        <Activity className="w-3.5 h-3.5 text-primary" />
                                        TTA Analysis
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {prediction.tta_results.individual_predictions.length} passes •
                                        Agreement: {(prediction.tta_results.agreement_score * 100).toFixed(0)}%
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="glass-card rounded-2xl p-6 animate-slide-up opacity-0 delay-100">
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                    <Stethoscope className="w-7 h-7 text-muted-foreground" />
                                </div>
                                <p className="font-medium mb-1">Awaiting Analysis</p>
                                <p className="text-sm text-muted-foreground">
                                    Upload an X-ray image and click Analyze to see results
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════════ Scan History ═══════════════ */}
            <div className="glass-card rounded-2xl p-6 animate-slide-up opacity-0 delay-400">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-display text-xl font-bold flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary" />
                        Scan History
                    </h2>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-all ${showFilters ? 'bg-primary/10 text-primary' : 'hover:bg-secondary/50 text-muted-foreground'
                            }`}
                    >
                        <Filter className="w-3.5 h-3.5" />
                        Filters
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                {/* Filters */}
                {showFilters && (
                    <div className="flex flex-wrap gap-3 mb-6 animate-slide-up">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                value={filterSearch}
                                onChange={(e) => setFilterSearch(e.target.value)}
                                className="input-premium pl-10 text-sm py-2"
                                placeholder="Search by patient name or scan ID..."
                            />
                        </div>
                        <div className="flex gap-2">
                            {['all', 'normal', 'tuberculosis'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all ${filterStatus === status
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                                        }`}
                                >
                                    {status === 'all' ? 'All' : status}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* History List */}
                {scanHistoryLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
                        <p className="font-medium mb-1">Loading scan history...</p>
                        <p className="text-sm text-muted-foreground">Fetching from database</p>
                    </div>
                ) : scanHistoryError ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <AlertTriangle className="w-10 h-10 text-destructive mb-3" />
                        <p className="font-medium mb-1">Could not load scan history</p>
                        <p className="text-sm text-muted-foreground mb-3">Check your connection and try again.</p>
                        <button
                            type="button"
                            onClick={() => refetchScans()}
                            className="text-sm px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                        >
                            Retry
                        </button>
                    </div>
                ) : filteredHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Calendar className="w-10 h-10 text-muted-foreground mb-3" />
                        <p className="font-medium mb-1">
                            {!user ? 'Sign in to save and view scan history' : 'No scan records'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {!user
                                ? 'Your analysis results are shown above. Sign in so future scans are saved here.'
                                : scanHistory.length === 0
                                    ? 'Completed scans will appear here after you analyze an X-ray.'
                                    : 'No scans match your filters'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {paginatedHistory.map((record) => (
                            <button
                                key={record.id}
                                type="button"
                                onClick={() => {
                                    setSelectedScanId(record.id);
                                    setDetailsOpen(true);
                                }}
                                className="scan-row w-full text-left cursor-pointer"
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${record.result === 'tuberculosis' ? 'bg-destructive/10' : 'bg-success/10'
                                    }`}>
                                    {record.result === 'tuberculosis' ? (
                                        <AlertTriangle className="w-5 h-5 text-destructive" />
                                    ) : (
                                        <CheckCircle2 className="w-5 h-5 text-success" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm">
                                        {record.patientName && record.patientName.trim() !== '' && record.patientName !== 'Anonymous'
                                            ? record.patientName
                                            : record.patientId
                                                ? `ID: ${record.patientId}`
                                                : 'Patient (no details)'}
                                    </div>
                                    {(record.patientBirthDate || record.patientSex) && (
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            {[
                                                record.patientBirthDate != null
                                                    ? (() => {
                                                        const age = computeAgeFromBirthDate(record.patientBirthDate, record.studyDate);
                                                        return age != null ? `Age: ${age} yrs` : null;
                                                    })()
                                                    : null,
                                                record.patientSex != null ? `Sex: ${formatSex(record.patientSex) ?? '—'}` : null,
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </div>
                                    )}
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        {(record.studyDate || record.patientId) ? (
                                            <span>
                                                {record.studyDate && (
                                                    <span>Study: {formatStudyDate(record.studyDate) ?? record.studyDate}</span>
                                                )}
                                                {record.studyDate && record.patientId && <span> · </span>}
                                                {record.patientId && <span>ID: {record.patientId}</span>}
                                            </span>
                                        ) : (
                                            <span className="truncate block">{record.id}</span>
                                        )}
                                    </div>
                                    <span className="text-xs text-muted-foreground block mt-0.5">
                                        Processed: {record.timestamp.toLocaleString()}
                                    </span>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full ${record.result === 'tuberculosis'
                                        ? 'bg-destructive/10 text-destructive'
                                        : 'bg-success/10 text-success'
                                        }`}>
                                        {record.result}
                                    </span>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {record.confidence.toFixed(1)}% confidence
                                    </p>
                                </div>
                            </button>
                        ))}
                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="pt-6 flex justify-center items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 text-sm font-medium rounded-lg text-muted-foreground hover:bg-secondary/50 disabled:opacity-50 disabled:hover:bg-transparent transition-all"
                                >
                                    Previous
                                </button>
                                <div className="flex items-center gap-1">
                                    {getPageNumbers()[0] > 1 && (
                                        <>
                                            <button
                                                onClick={() => setCurrentPage(1)}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium hover:bg-secondary/50 text-muted-foreground transition-all"
                                            >
                                                1
                                            </button>
                                            {getPageNumbers()[0] > 2 && (
                                                <span className="text-muted-foreground px-1">...</span>
                                            )}
                                        </>
                                    )}
                                    {getPageNumbers().map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setCurrentPage(p)}
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium transition-all ${currentPage === p
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'hover:bg-secondary/50 text-muted-foreground'
                                                }`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                    {getPageNumbers()[getPageNumbers().length - 1] < totalPages && (
                                        <>
                                            {getPageNumbers()[getPageNumbers().length - 1] < totalPages - 1 && (
                                                <span className="text-muted-foreground px-1">...</span>
                                            )}
                                            <button
                                                onClick={() => setCurrentPage(totalPages)}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium hover:bg-secondary/50 text-muted-foreground transition-all"
                                            >
                                                {totalPages}
                                            </button>
                                        </>
                                    )}
                                </div>
                                <button
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 text-sm font-medium rounded-lg text-muted-foreground hover:bg-secondary/50 disabled:opacity-50 disabled:hover:bg-transparent transition-all"
                                >
                                    Next
                                </button>
                            </div>
                        )}
                        {scanHistoryHasMore && (
                            <div className="pt-4 flex justify-center">
                                <button
                                    type="button"
                                    onClick={loadMoreScans}
                                    disabled={loadingMoreScans}
                                    className="btn-outline-premium px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                                >
                                    {loadingMoreScans ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Loading...
                                        </>
                                    ) : (
                                        'Load older scans from server'
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Scan details modal */}
            <Sheet open={detailsOpen} onOpenChange={(open) => { setDetailsOpen(open); if (!open) setSelectedScanId(null); }}>
                <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Scan details</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                        {scanDetailLoading && (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                        )}
                        {scanDetailError && (
                            <p className="text-sm text-destructive">{scanDetailError}</p>
                        )}
                        {!scanDetailLoading && !scanDetailError && scanDetail && (
                            <>
                                <div className="max-w-full max-h-[300px] overflow-hidden rounded-xl border border-border/50 bg-black/5 dark:bg-white/5 flex items-center justify-center">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={scanDetail.imageDataUrl}
                                        alt="X-ray"
                                        className="max-w-full max-h-[300px] w-auto h-auto object-contain"
                                    />
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground mb-2">Patient details</h3>
                                        <dl className="grid gap-1.5 text-sm">
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Name:</dt>
                                                <dd className="min-w-0">{scanDetail.patientName && scanDetail.patientName !== 'Anonymous' ? scanDetail.patientName : '—'}</dd>
                                            </div>
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Patient ID:</dt>
                                                <dd className="min-w-0">{scanDetail.patientId ?? '—'}</dd>
                                            </div>
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Sex:</dt>
                                                <dd className="min-w-0">{scanDetail.patientSex != null ? (formatSex(scanDetail.patientSex) ?? scanDetail.patientSex) : '—'}</dd>
                                            </div>
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Date of birth:</dt>
                                                <dd className="min-w-0">{scanDetail.patientBirthDate ? (formatStudyDate(scanDetail.patientBirthDate) ?? scanDetail.patientBirthDate) : '—'}</dd>
                                            </div>
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Age:</dt>
                                                <dd className="min-w-0">
                                                    {scanDetail.patientBirthDate
                                                        ? (() => {
                                                            const age = computeAgeFromBirthDate(scanDetail.patientBirthDate, scanDetail.studyDate);
                                                            return age != null ? `${age} yrs` : '—';
                                                        })()
                                                        : '—'}
                                                </dd>
                                            </div>
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Study date:</dt>
                                                <dd className="min-w-0">{scanDetail.studyDate ? (formatStudyDate(scanDetail.studyDate) ?? scanDetail.studyDate) : '—'}</dd>
                                            </div>
                                            <div className="flex gap-2">
                                                <dt className="text-muted-foreground shrink-0 w-24">Study time:</dt>
                                                <dd className="min-w-0">{scanDetail.studyTime ? (formatStudyTime(scanDetail.studyTime) ?? scanDetail.studyTime) : '—'}</dd>
                                            </div>
                                        </dl>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Processed: {scanDetail.timestamp.toLocaleString()}
                                    </p>
                                    <div className="pt-2">
                                        <span className={`text-sm font-semibold capitalize px-2 py-1 rounded-full ${scanDetail.result === 'tuberculosis' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                                            {scanDetail.result}
                                        </span>
                                        <p className="text-xs text-muted-foreground mt-1">{scanDetail.confidence.toFixed(1)}% confidence</p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
