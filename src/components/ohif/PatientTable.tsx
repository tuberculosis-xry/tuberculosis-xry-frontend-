'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ArrowRight, Trash2, FileStack, Pencil, Check, X, Info, GitCompare } from 'lucide-react';
import type { PatientStudy, PatientWithStudies } from '@/lib/ohif/types';
import { VIEWER_MODES } from '@/lib/ohif/types';
import { Button } from '@/components/ui/button';

type PatientTableProps = {
  patients: PatientWithStudies[];
  onDeleted?: () => void;
};

/** Format study date for display: YYYYMMDD → YYYY-MM-DD; leave as-is if already hyphenated. */
function formatStudyDate(date?: string): string {
  if (!date || !date.trim()) return '—';
  const s = date.trim();
  if (s.length >= 8 && /^\d{8}/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

/** Format study time for display (e.g. "14:05" → "02:05 PM"; leave as-is if already "02:05 PM"). */
function formatStudyTime(time?: string): string {
  if (!time || !time.trim()) return '—';
  const t = time.trim();
  if (/[AP]M/i.test(t)) return t;
  const match = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return t;
  const hour = parseInt(match[1], 10);
  const min = match[2];
  if (hour === 0) return `12:${min} AM`;
  if (hour === 12) return `12:${min} PM`;
  if (hour < 12) return `${hour}:${min} AM`;
  return `${hour - 12}:${min} PM`;
}

/** Single study row inside an expanded patient (description edit + delete only; no per-study viewer buttons). */
function StudyRow({
  study,
  onDelete,
  onDeleted,
  onDescriptionUpdated,
}: {
  study: PatientStudy;
  onDelete: () => void;
  onDeleted?: () => void;
  onDescriptionUpdated?: () => void;
}) {
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDescValue, setEditDescValue] = useState(study.studyDescription ?? '');
  const [saveLoading, setSaveLoading] = useState(false);

  const startEdit = () => {
    setEditDescValue(study.studyDescription ?? '');
    setIsEditingDesc(true);
  };

  const cancelEdit = () => {
    setIsEditingDesc(false);
    setEditDescValue(study.studyDescription ?? '');
  };

  const saveDescription = async () => {
    if (!study.id || !onDescriptionUpdated) return;
    setSaveLoading(true);
    try {
      const res = await fetch(`/api/ohif/studies/${study.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studyDescription: editDescValue }),
      });
      if (!res.ok) throw new Error('Update failed');
      setIsEditingDesc(false);
      onDescriptionUpdated();
    } catch {
      setSaveLoading(false);
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/10">
      <td className="px-3 py-2 text-foreground max-w-[14rem] text-sm align-middle">
        {isEditingDesc ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={editDescValue}
              onChange={(e) => setEditDescValue(e.target.value)}
              className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-1 text-sm"
              placeholder="Description"
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-primary hover:bg-primary/10"
              onClick={saveDescription}
              disabled={saveLoading}
              title="Save"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted"
              onClick={cancelEdit}
              disabled={saveLoading}
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="truncate min-w-0" title={study.studyDescription ?? undefined}>
              {study.studyDescription || '—'}
            </span>
            {onDescriptionUpdated && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={startEdit}
                title="Edit description"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-foreground text-sm tabular-nums">
        {study.seriesCount != null ? `${study.seriesCount} ${study.seriesCount === 1 ? 'series' : 'series'}` : '—'}
      </td>
      <td className="px-3 py-2 text-foreground whitespace-nowrap text-sm">{study.modality}</td>
      <td className="px-3 py-2 text-muted-foreground truncate max-w-[8rem] text-sm" title={study.accessionNumber}>
        {study.accessionNumber || '—'}
      </td>
      <td className="px-3 py-2 text-foreground tabular-nums text-sm">{study.instances}</td>
      <td className="px-3 py-2">
        {study.id && onDeleted && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            title="Delete this study"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </td>
    </tr>
  );
}

/** One patient row: summary + expandable list of studies. */
function PatientCard({
  patient,
  isExpanded,
  onToggle,
  onDeleteStudy,
  onDeletePatient,
  onDeleted,
}: {
  patient: PatientWithStudies;
  isExpanded: boolean;
  onToggle: () => void;
  onDeleteStudy: (study: PatientStudy) => void;
  onDeletePatient: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [comparePriorOpen, setComparePriorOpen] = useState(false);
  const [compareCurrentUid, setCompareCurrentUid] = useState(patient.studies[0]?.studyInstanceUID ?? '');
  const [comparePriorUid, setComparePriorUid] = useState(patient.studies[1]?.studyInstanceUID ?? '');

  const first = patient.studies[0];
  if (!first) return null;

  const totalInstances = patient.studies.reduce((n, s) => n + s.instances, 0);
  const modalities = [...new Set(patient.studies.map((s) => s.modality))];
  /** Modes available for this patient (union of all studies' availableModes). */
  const patientModes = new Set(patient.studies.flatMap((s) => s.availableModes ?? []));
  const handleOpenViewer = (modeId: string) => {
    // Only this patient's studies from DB. Viewer loads series/instances from app DICOMweb API.
    const uidsForViewer = patient.studies.map((s) => s.studyInstanceUID).filter(Boolean);
    const params = new URLSearchParams({
      mode: modeId,
      StudyInstanceUIDs: uidsForViewer.join(','),
    });
    router.push(`/dashboard/ohif/viewer?${params.toString()}`);
  };

  const canCompareWithPrior = patient.studies.length >= 2;
  const handleOpenCompareWithPrior = () => {
    if (!compareCurrentUid || !comparePriorUid) return;
    const params = new URLSearchParams({
      mode: 'basic',
      StudyInstanceUIDs: [compareCurrentUid, comparePriorUid].join(','),
    });
    router.push(`/dashboard/ohif/viewer?${params.toString()}`);
    setComparePriorOpen(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Summary row — one patient */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
        className="study-card-summary grid gap-3 items-center px-4 py-3 border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer min-w-0"
      >
        <div className="flex items-center justify-center w-8 h-8 shrink-0 text-muted-foreground">
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ease-out ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
            aria-hidden
          />
        </div>
        <span className="font-medium text-foreground truncate min-w-0" title={patient.patientName}>
          {patient.patientName}
        </span>
        <span className="text-muted-foreground truncate min-w-0 text-sm" title={patient.mrn}>
          {patient.mrn}
        </span>
        <span className="text-foreground whitespace-nowrap text-sm">
          {formatStudyDate(first.studyDate)}
        </span>
        <span className="text-muted-foreground whitespace-nowrap text-sm">
          {formatStudyTime(first.studyTime)}
        </span>
        <span className="text-foreground truncate min-w-0 text-sm" title={first.studyDescription}>
          {first.studyDescription || '—'}
        </span>
        <span className="text-foreground whitespace-nowrap text-sm">
          {modalities.length > 1 ? 'Multiple' : first.modality}
        </span>
        <span className="text-muted-foreground truncate min-w-0 text-sm" title={first.accessionNumber}>
          {first.accessionNumber || '—'}
        </span>
        <div className="flex items-center gap-1.5 text-foreground text-sm tabular-nums">
          <FileStack className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          <span>{totalInstances}</span>
        </div>
        <div className="w-8 shrink-0 flex items-center justify-center" onClick={(e) => e.stopPropagation()} aria-hidden>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDeletePatient}
            title="Delete entire patient"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Expanded: action bar (OHIF-style) + list of studies for this patient */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="bg-muted/10 border-t border-border/50 p-4">
            {/* Patient-level action bar: one button per viewer mode; active if data supports it */}
            <div className="flex flex-wrap gap-2 mb-4">
              {VIEWER_MODES.map((mode) => {
                const isActive = patientModes.has(mode.id);
                return isActive ? (
                  <Button
                    key={mode.id}
                    variant="secondary"
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => handleOpenViewer(mode.id)}
                  >
                    {mode.label}
                    <ArrowRight className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                ) : (
                  <Button
                    key={mode.id}
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs h-8 text-muted-foreground cursor-default hover:bg-muted/50"
                    disabled
                    title={`Not available for this patient's data`}
                  >
                    <Info className="h-3.5 w-3.5" />
                    {mode.label}
                  </Button>
                );
              })}
              {canCompareWithPrior && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => {
                      setCompareCurrentUid(patient.studies[0]?.studyInstanceUID ?? '');
                      setComparePriorUid(patient.studies[1]?.studyInstanceUID ?? '');
                      setComparePriorOpen(true);
                    }}
                  >
                    <GitCompare className="h-3.5 w-3.5 opacity-70" />
                    Compare with prior
                  </Button>
                  {comparePriorOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Compare with prior study">
                      <div className="bg-card rounded-xl shadow-xl max-w-md w-full p-6 border border-border">
                        <h3 className="text-lg font-semibold mb-4">Compare with prior study</h3>
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <label className="text-sm font-medium">Current study</label>
                            <select
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={compareCurrentUid}
                              onChange={(e) => setCompareCurrentUid(e.target.value)}
                            >
                              {patient.studies.map((s) => (
                                <option key={s.studyInstanceUID} value={s.studyInstanceUID}>
                                  {formatStudyDate(s.studyDate)} — {s.studyDescription || s.modality}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid gap-2">
                            <label className="text-sm font-medium">Prior study</label>
                            <select
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={comparePriorUid}
                              onChange={(e) => setComparePriorUid(e.target.value)}
                            >
                              {patient.studies.map((s) => (
                                <option key={s.studyInstanceUID} value={s.studyInstanceUID}>
                                  {formatStudyDate(s.studyDate)} — {s.studyDescription || s.modality}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" className="flex-1" onClick={() => setComparePriorOpen(false)}>
                              Cancel
                            </Button>
                            <Button
                              className="flex-1"
                              onClick={handleOpenCompareWithPrior}
                              disabled={compareCurrentUid === comparePriorUid}
                            >
                              Open comparison
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Studies ({patient.studies.length})
            </h4>
            <div className="rounded-lg border border-border overflow-hidden bg-background/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left font-medium text-foreground px-3 py-2">Description</th>
                    <th className="text-left font-medium text-foreground px-3 py-2">Series</th>
                    <th className="text-left font-medium text-foreground px-3 py-2">Modality</th>
                    <th className="text-left font-medium text-foreground px-3 py-2">Accession #</th>
                    <th className="text-left font-medium text-foreground px-3 py-2">Instances</th>
                    <th className="text-left font-medium text-foreground px-3 py-2 w-10">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {patient.studies.map((study) => (
                    <StudyRow
                      key={study.id ?? study.studyInstanceUID}
                      study={study}
                      onDelete={() => onDeleteStudy(study)}
                      onDeleted={onDeleted}
                      onDescriptionUpdated={onDeleted}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PatientTable({ patients, onDeleted }: PatientTableProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmPatientKey, setDeleteConfirmPatientKey] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const allStudies = patients.flatMap((p) => p.studies);
  const rowToDelete = allStudies.find((s) => s.id === deleteConfirmId);
  const patientToDelete = deleteConfirmPatientKey
    ? patients.find((p) => (p.mrn || p.studies[0]?.studyInstanceUID) === deleteConfirmPatientKey)
    : null;

  const handleDeleteStudy = (study: PatientStudy) => {
    if (study.id) setDeleteConfirmId(study.id);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId || !onDeleted) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/ohif/studies/${deleteConfirmId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setDeleteConfirmId(null);
      setExpandedKey(null);
      onDeleted();
    } catch {
      setDeleteLoading(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeletePatientConfirm = async () => {
    if (!patientToDelete || !onDeleted) return;
    setDeleteLoading(true);
    try {
      const ids = patientToDelete.studies.map((s) => s.id).filter(Boolean) as string[];
      for (const id of ids) {
        const res = await fetch(`/api/ohif/studies/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`Delete failed for study ${id}`);
      }
      setDeleteConfirmPatientKey(null);
      setExpandedKey(null);
      onDeleted();
    } catch {
      setDeleteLoading(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (patients.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        No patients match your search. Try different filters or add a patient.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto min-w-0">
        <div className="space-y-3 min-w-[720px]">
          <div className="study-card-summary study-table-header grid gap-3 items-center px-4 py-3 rounded-t-lg border border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
            <div className="w-8 shrink-0" aria-hidden />
            <span>Patient name</span>
            <span>MRN</span>
            <span>Study date</span>
            <span>Study time</span>
            <span>Description</span>
            <span>Modality</span>
            <span>Accession #</span>
            <span>Instances</span>
            <div className="w-8 shrink-0" aria-hidden />
          </div>

          {patients.map((patient) => {
            const key = patient.mrn || patient.studies[0]?.studyInstanceUID || '';
            return (
              <PatientCard
                key={key}
                patient={patient}
                isExpanded={expandedKey === key}
                onToggle={() => setExpandedKey((k) => (k === key ? null : key))}
                onDeleteStudy={handleDeleteStudy}
                onDeletePatient={() => setDeleteConfirmPatientKey(key)}
                onDeleted={onDeleted}
              />
            );
          })}
        </div>
      </div>

      {deleteConfirmId && rowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95">
            <h3 className="font-display text-lg font-semibold text-foreground mb-2">
              Delete this study?
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will remove the study for <strong>{rowToDelete.patientName}</strong> (Study date:{' '}
              {formatStudyDate(rowToDelete.studyDate)}, {rowToDelete.modality}) from the database. This
              cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmPatientKey && patientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95">
            <h3 className="font-display text-lg font-semibold text-foreground mb-2">
              Delete this patient?
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will remove <strong>all {patientToDelete.studies.length} study{patientToDelete.studies.length !== 1 ? 'ies' : ''}</strong> for{' '}
              <strong>{patientToDelete.patientName}</strong> (MRN: {patientToDelete.mrn}) from the database. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteConfirmPatientKey(null)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeletePatientConfirm}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting…' : 'Delete patient'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
