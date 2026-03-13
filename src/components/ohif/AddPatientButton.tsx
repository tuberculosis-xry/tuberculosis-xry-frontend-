'use client';

import { useState, useRef } from 'react';
import { UserPlus, Upload, FileImage, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VIEWER_MODES } from '@/lib/ohif/types';
import type { ViewerModeId } from '@/lib/ohif/types';
import { parseDicomFilesForMissingFields, type ParsedDicomClientResult } from '@/lib/ohif/parseDicomClient';

type AddMode = 'manual' | 'upload-dicom';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Turn API error into a short, readable message for the user. */
function formatUploadError(apiError: string | undefined, status: number): string {
  if (!apiError || typeof apiError !== 'string') {
    return status === 502 || status === 503
      ? 'Upload service is not available. Please try again later.'
      : 'Upload failed. Please try again.';
  }
  const s = apiError.trim();
  if (status === 503) {
    if (s.includes('not running') || s.includes('unreachable') || s.includes('did not respond')) {
      return 'Upload service is unavailable. Please try again later.';
    }
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
  }
  if (status === 502) {
    if (s.includes('timed out')) return 'Upload timed out. Try fewer files or try again in a moment.';
    if (s.includes('unreachable') || s.includes('request failed')) {
      return 'Cannot reach the server. Please try again.';
    }
    if (s.includes('upload failed')) return 'Upload was rejected. Try again or use fewer/smaller files.';
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
  }
  if (status === 400) {
    if (s.includes('Missing required')) return s;
    if (s.includes('could not be read as DICOM')) return 'One or more files could not be read as DICOM. Check that the files are valid and try again.';
    if (s.includes('No files')) return 'No files were sent. Please select DICOM files and try again.';
    if (s.includes('Too many files')) return s;
    if (s.includes('Only X-ray')) return 'This study type is not accepted. Use X-ray (DX) files or enable other modalities in settings.';
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
  }
  return s.length > 120 ? s.slice(0, 120) + '…' : s;
}

type AddPatientButtonProps = {
  onAdded?: () => void;
};

function generateStudyInstanceUID(): string {
  return `1.2.840.${Date.now()}.${Math.random().toString(36).slice(2, 12)}`;
}

export function AddPatientButton({ onAdded }: AddPatientButtonProps) {
  const [open, setOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('upload-dicom');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMissingDataDialog, setShowMissingDataDialog] = useState(false);
  const [missingDataResult, setMissingDataResult] = useState<ParsedDicomClientResult | null>(null);
  const [dialogForm, setDialogForm] = useState({
    patientName: '',
    patientId: '',
    useGeneratedPatientId: false,
    studyDescription: '',
    accessionNumber: '',
    patientSex: '',
    patientBirthDate: '',
  });
  const [form, setForm] = useState({
    patientName: '',
    patientId: '',
    mrn: '',
    patientSex: '',
    patientBirthDate: '',
    studyDate: '',
    studyTime: '',
    studyDescription: '',
    modality: 'CT',
    accessionNumber: '',
    instances: '1',
    modes: ['basic'] as ViewerModeId[],
  });

  const doUpload = async (formData: FormData) => {
    const res = await fetch('/api/ohif/upload-dicom', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = formatUploadError(data.error, res.status);
      throw new Error(msg);
    }
  };

  const handleUploadDicom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (uploadFiles.length === 0) {
      setError('Select at least one .dcm file.');
      return;
    }
    setLoading(true);
    try {
      const result = await parseDicomFilesForMissingFields(uploadFiles);
      if (!result) {
        setError('Could not read DICOM metadata. Please upload a valid DICOM file.');
        return;
      }
      const hasMissing = result.missingRequired.length > 0 || result.missingOptional.length > 0;
      if (!hasMissing) {
        const formData = new FormData();
        uploadFiles.forEach((f) => formData.append('files', f));
        await doUpload(formData);
        setOpen(false);
        setUploadFiles([]);
        setAddMode('upload-dicom');
        onAdded?.();
        return;
      }
      setMissingDataResult(result);
      setDialogForm({
        patientName: result.values.patientName ?? '',
        patientId: result.values.patientId ?? '',
        useGeneratedPatientId: false,
        studyDescription: result.values.studyDescription ?? '',
        accessionNumber: result.values.accessionNumber ?? '',
        patientSex: result.values.patientSex ?? '',
        patientBirthDate: result.values.patientBirthDate ?? '',
      });
      setShowMissingDataDialog(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMissingDataProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!missingDataResult) return;
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      uploadFiles.forEach((f) => formData.append('files', f));
      formData.append('override_patientName', dialogForm.patientName.trim());
      if (dialogForm.useGeneratedPatientId) {
        formData.append('override_useGeneratedPatientId', 'true');
      } else {
        formData.append('override_patientId', dialogForm.patientId.trim());
      }
      formData.append('override_patientSex', dialogForm.patientSex.trim());
      formData.append('override_patientBirthDate', dialogForm.patientBirthDate.trim());
      if (missingDataResult.missingOptional.includes('studyDescription') && dialogForm.studyDescription.trim()) {
        formData.append('override_studyDescription', dialogForm.studyDescription.trim());
      }
      if (missingDataResult.missingOptional.includes('accessionNumber') && dialogForm.accessionNumber.trim()) {
        formData.append('override_accessionNumber', dialogForm.accessionNumber.trim());
      }
      await doUpload(formData);
      setOpen(false);
      setUploadFiles([]);
      setShowMissingDataDialog(false);
      setMissingDataResult(null);
      onAdded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (uploadFiles.length > 0) {
        // Manual entry with files: use upload-dicom with form values as overrides (same patient for all)
        const patientIdOrMrn = form.mrn.trim() || form.patientId.trim();
        if (!form.patientName.trim() || !patientIdOrMrn) {
          setError('When adding DICOM files, Patient name and MRN are required so all studies use the same patient.');
          setLoading(false);
          return;
        }
        if (!form.patientSex.trim() || !form.patientBirthDate.trim()) {
          setError('When adding DICOM files, Sex and Birth date are required.');
          setLoading(false);
          return;
        }
        const formData = new FormData();
        uploadFiles.forEach((f) => formData.append('files', f));
        formData.append('override_patientName', form.patientName.trim());
        formData.append('override_patientId', patientIdOrMrn);
        formData.append('override_patientSex', form.patientSex.trim());
        formData.append('override_patientBirthDate', form.patientBirthDate.trim());
        if (form.studyDescription.trim()) formData.append('override_studyDescription', form.studyDescription.trim());
        if (form.accessionNumber.trim()) formData.append('override_accessionNumber', form.accessionNumber.trim());
        await doUpload(formData);
        setUploadFiles([]);
      } else {
        // Manual entry without files: create single study via API
      const studyInstanceUID = generateStudyInstanceUID();
      const res = await fetch('/api/ohif/studies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studyInstanceUID,
          patientName: form.patientName.trim() || 'Unknown',
          patientId: form.patientId.trim() || form.mrn.trim() || '—',
          mrn: form.mrn.trim() || '—',
          studyDate: form.studyDate.trim() || new Date().toISOString().slice(0, 10),
          studyTime: form.studyTime.trim() || undefined,
          studyDescription: form.studyDescription.trim() || '',
          modality: form.modality.trim() || 'OT',
          accessionNumber: form.accessionNumber.trim() || studyInstanceUID.slice(-8),
          instances: Math.max(0, parseInt(form.instances, 10) || 1),
          availableModes: form.modes.length ? form.modes : ['basic'],
          patientSex: form.patientSex.trim() || undefined,
          patientBirthDate: form.patientBirthDate.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add patient');
        }
      }
      setOpen(false);
      setForm({
        patientName: '',
        patientId: '',
        mrn: '',
        patientSex: '',
        patientBirthDate: '',
        studyDate: new Date().toISOString().slice(0, 10),
        studyTime: '',
        studyDescription: '',
        modality: 'CT',
        accessionNumber: '',
        instances: '1',
        modes: ['basic'],
      });
      onAdded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add patient');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = (id: ViewerModeId) => {
    setForm((f) => ({
      ...f,
      modes: f.modes.includes(id) ? f.modes.filter((m) => m !== id) : [...f.modes, id],
    }));
  };

  const [dragActive, setDragActive] = useState(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const list = Array.from(e.dataTransfer.files).filter((f) => /\.(dcm|dicom)$/i.test(f.name));
    setUploadFiles((prev) => (list.length ? [...prev, ...list] : prev));
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragActive(true); };
  const onDragLeave = () => setDragActive(false);
  const removeFile = (index: number) => setUploadFiles((prev) => prev.filter((_, i) => i !== index));

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2"
      >
        <UserPlus className="w-4 h-4" />
        Add patient
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className={`bg-card border border-border rounded-2xl shadow-2xl w-full my-8 overflow-hidden ${addMode === 'manual' ? 'max-w-4xl' : 'max-w-lg'}`}>
            <div className="px-6 pt-6 pb-1">
              <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">Add patient</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {showMissingDataDialog && missingDataResult ? 'Complete the missing details below.' : 'Register a study for the OHIF viewer'}
              </p>
            </div>
            {!(showMissingDataDialog && missingDataResult) && (
              <div className="flex border-b border-border mt-4">
                <button
                  type="button"
                  onClick={() => { setAddMode('upload-dicom'); setError(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${addMode === 'upload-dicom' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                >
                  <Upload className="w-4 h-4" />
                  Upload DICOM
                </button>
                <button
                  type="button"
                  onClick={() => { setAddMode('manual'); setError(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${addMode === 'manual' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                >
                  <UserPlus className="w-4 h-4" />
                  Manual entry
                </button>
              </div>
            )}
            <div className="p-6">
            {showMissingDataDialog && missingDataResult ? (
              <form onSubmit={handleMissingDataProceed} className="space-y-4">
                <p className="text-sm text-muted-foreground">Some details are missing in the DICOM file(s). Please complete the fields below (required fields are marked with *).</p>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="dialog-patientName" className="text-foreground">Patient name *</Label>
                    <Input
                      id="dialog-patientName"
                      value={dialogForm.patientName}
                      onChange={(e) => setDialogForm((f) => ({ ...f, patientName: e.target.value }))}
                      placeholder="Full name"
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dialog-patientId" className="text-foreground">Patient ID / MRN *</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="dialog-patientId"
                        value={dialogForm.useGeneratedPatientId ? 'Will be generated on server' : dialogForm.patientId}
                        onChange={(e) => setDialogForm((f) => ({ ...f, patientId: e.target.value }))}
                        placeholder="Enter or generate"
                        required={!dialogForm.useGeneratedPatientId}
                        disabled={dialogForm.useGeneratedPatientId}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogForm((f) => ({ ...f, useGeneratedPatientId: true, patientId: '' }))}
                        className="shrink-0"
                      >
                        Generate unique ID
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="dialog-patientSex" className="text-foreground">Patient sex *</Label>
                    <select
                      id="dialog-patientSex"
                      value={dialogForm.patientSex}
                      onChange={(e) => setDialogForm((f) => ({ ...f, patientSex: e.target.value }))}
                      required
                      className="mt-1 w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="">—</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                      <option value="O">O</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="dialog-patientBirthDate" className="text-foreground">Patient birth date *</Label>
                    <Input
                      id="dialog-patientBirthDate"
                      type="date"
                      value={dialogForm.patientBirthDate}
                      onChange={(e) => setDialogForm((f) => ({ ...f, patientBirthDate: e.target.value }))}
                      max={new Date().toISOString().slice(0, 10)}
                      required
                      className="mt-1"
                    />
                  </div>
                  {missingDataResult.missingOptional.includes('studyDescription') && (
                    <div>
                      <Label htmlFor="dialog-studyDescription" className="text-foreground">Study description (optional)</Label>
                      <Input
                        id="dialog-studyDescription"
                        value={dialogForm.studyDescription}
                        onChange={(e) => setDialogForm((f) => ({ ...f, studyDescription: e.target.value }))}
                        placeholder="Study description"
                        className="mt-1"
                      />
                    </div>
                  )}
                  {missingDataResult.missingOptional.includes('accessionNumber') && (
                    <div>
                      <Label htmlFor="dialog-accessionNumber" className="text-foreground">Accession number (optional)</Label>
                      <Input
                        id="dialog-accessionNumber"
                        value={dialogForm.accessionNumber}
                        onChange={(e) => setDialogForm((f) => ({ ...f, accessionNumber: e.target.value }))}
                        placeholder="Accession #"
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                    <p className="text-sm text-destructive font-medium">{error}</p>
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setShowMissingDataDialog(false); setMissingDataResult(null); }} disabled={loading}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      loading ||
                      !dialogForm.patientName.trim() ||
                      (!dialogForm.useGeneratedPatientId && !dialogForm.patientId.trim()) ||
                      !dialogForm.patientSex.trim() ||
                      !dialogForm.patientBirthDate.trim()
                    }
                  >
                    {loading ? 'Uploading…' : 'Proceed'}
                  </Button>
                </div>
              </form>
            ) : addMode === 'upload-dicom' ? (
              <form onSubmit={handleUploadDicom} className="space-y-5">
                <div>
                  <Label className="text-sm font-medium text-foreground">DICOM files (.dcm)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">Single or multiple files supported</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".dcm,.dicom"
                    multiple
                    className="hidden"
                    onChange={(e) => setUploadFiles((prev) => {
                      const added = Array.from(e.target.files ?? []);
                      return added.length ? [...prev, ...added] : prev;
                    })}
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    className={`mt-1 rounded-xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center min-h-[140px] py-6 px-4 ${dragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 bg-muted/30 hover:border-muted-foreground/50 hover:bg-muted/50'}`}
                  >
                    <FileImage className="w-10 h-10 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium text-foreground">Drag and drop DICOM files here</p>
                    <p className="text-xs text-muted-foreground mt-0.5">or click to browse — single or multiple</p>
                  </div>
                  {uploadFiles.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">{uploadFiles.length} file(s) selected</p>
                      <ul className="max-h-32 overflow-y-auto rounded-lg border border-border bg-muted/20 divide-y divide-border">
                        {uploadFiles.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                            <span className="truncate text-foreground">{f.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(f.size)}</span>
                            <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive" aria-label="Remove file">
                              <X className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                    <p className="text-sm text-destructive font-medium">{error}</p>
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-1">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading || uploadFiles.length === 0}>
                    {loading ? 'Uploading…' : 'Upload & add'}
                  </Button>
                </div>
              </form>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Patient & study details</p>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr,200px] gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  <div className="col-span-2 sm:col-span-3 lg:col-span-4">
                    <Label htmlFor="patientName" className="text-foreground">Patient name *</Label>
                  <Input
                    id="patientName"
                    value={form.patientName}
                    onChange={(e) => setForm((f) => ({ ...f, patientName: e.target.value }))}
                    placeholder="Full name"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="mrn">MRN *</Label>
                  <Input
                    id="mrn"
                    value={form.mrn}
                    onChange={(e) => setForm((f) => ({ ...f, mrn: e.target.value }))}
                    placeholder="MRN"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="patientId">Patient ID</Label>
                  <Input
                    id="patientId"
                    value={form.patientId}
                    onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
                    placeholder="Optional"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="patientSex">Sex</Label>
                  <select
                    id="patientSex"
                    value={form.patientSex}
                    onChange={(e) => setForm((f) => ({ ...f, patientSex: e.target.value }))}
                      className="mt-1 w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="">—</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                    <option value="O">O</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="patientBirthDate">Birth date</Label>
                  <Input
                    id="patientBirthDate"
                    type="date"
                    value={form.patientBirthDate}
                    onChange={(e) => setForm((f) => ({ ...f, patientBirthDate: e.target.value }))}
                      max={new Date().toISOString().slice(0, 10)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="studyDate">Study date *</Label>
                  <Input
                    id="studyDate"
                    type="date"
                    value={form.studyDate}
                    onChange={(e) => setForm((f) => ({ ...f, studyDate: e.target.value }))}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="studyTime">Study time</Label>
                  <Input
                    id="studyTime"
                    type="time"
                    value={form.studyTime}
                    onChange={(e) => setForm((f) => ({ ...f, studyTime: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="modality">Modality *</Label>
                  <select
                    id="modality"
                    value={form.modality}
                    onChange={(e) => setForm((f) => ({ ...f, modality: e.target.value }))}
                      className="mt-1 w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="CT">CT</option>
                    <option value="MR">MR</option>
                    <option value="US">US</option>
                    <option value="PT">PT</option>
                    <option value="NM">NM</option>
                    <option value="DX">DX</option>
                    <option value="OT">OT</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="accessionNumber">Accession # *</Label>
                  <Input
                    id="accessionNumber"
                    value={form.accessionNumber}
                    onChange={(e) => setForm((f) => ({ ...f, accessionNumber: e.target.value }))}
                    placeholder="ACC001"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="instances">Instances</Label>
                  <Input
                    id="instances"
                    type="number"
                    min={1}
                    value={form.instances}
                    onChange={(e) => setForm((f) => ({ ...f, instances: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                  <div className="col-span-2 sm:col-span-3 lg:col-span-4">
                  <Label htmlFor="studyDescription">Description</Label>
                  <Input
                    id="studyDescription"
                    value={form.studyDescription}
                    onChange={(e) => setForm((f) => ({ ...f, studyDescription: e.target.value }))}
                    placeholder="Study description"
                    className="mt-1"
                  />
                </div>
                  <div className="col-span-2 sm:col-span-3 lg:col-span-4 pt-0.5">
                    <Label className="mb-1.5 block text-foreground text-sm">Viewer modes (diagnosis-based)</Label>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {VIEWER_MODES.map((m) => (
                      <label key={m.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.modes.includes(m.id)}
                          onChange={() => toggleMode(m.id)}
                          className="rounded border-input"
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                  </div>
                </div>
                {/* Optional DICOM upload — compact, right column on wide screens */}
                <div className="flex flex-col min-w-0">
                  <Label className="text-sm font-medium text-foreground">Optional: DICOM files</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-1">Same patient</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".dcm,.dicom"
                    multiple
                    className="hidden"
                    id="manual-entry-file-input"
                    onChange={(e) => setUploadFiles((prev) => {
                      const added = Array.from(e.target.files ?? []);
                      return added.length ? [...prev, ...added] : prev;
                    })}
                  />
                  <div
                    onClick={() => document.getElementById('manual-entry-file-input')?.click()}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    className={`flex-1 min-h-[72px] rounded-lg border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center py-2 px-2 ${dragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 bg-muted/30 hover:border-muted-foreground/50 hover:bg-muted/50'}`}
                  >
                    <FileImage className="w-6 h-6 text-muted-foreground shrink-0" />
                    <p className="text-xs font-medium text-foreground text-center leading-tight mt-0.5">Drop or browse</p>
                  </div>
                  {uploadFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-muted-foreground">{uploadFiles.length} file(s)</p>
                      <ul className="max-h-20 overflow-y-auto rounded border border-border bg-muted/20 divide-y divide-border text-xs">
                        {uploadFiles.map((f, i) => (
                          <li key={`manual-${f.name}-${i}`} className="flex items-center justify-between gap-1 px-2 py-1">
                            <span className="truncate text-foreground">{f.name}</span>
                            <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive shrink-0" aria-label="Remove file">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Adding…' : 'Add patient'}
                </Button>
              </div>
            </form>
            )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
