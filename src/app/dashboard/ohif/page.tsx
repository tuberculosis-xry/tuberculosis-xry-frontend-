'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { PatientTable } from '@/components/ohif/PatientTable';
import { AddPatientButton } from '@/components/ohif/AddPatientButton';
import { StudyListSearch } from '@/components/ohif/StudyListSearch';
import type { PatientStudy, PatientWithStudies } from '@/lib/ohif/types';

/** Group studies by patient (MRN). Same MRN = same patient → one row. */
function groupStudiesByPatient(studies: PatientStudy[]): PatientWithStudies[] {
  const byKey = new Map<string, PatientStudy[]>();
  for (const s of studies) {
    const key = (s.mrn || s.patientId || '').trim() || s.studyInstanceUID;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(s);
  }
  return Array.from(byKey.entries()).map(([, list]) => ({
    patientName: list[0]!.patientName,
    mrn: list[0]!.mrn,
    studies: list,
  }));
}

export default function OHIFPage() {
  useAuth();
  const [allStudies, setAllStudies] = useState<PatientStudy[]>([]);
  const [studiesLoading, setStudiesLoading] = useState(true);
  const [studiesError, setStudiesError] = useState<string | null>(null);

  const initialFilters = {
    patientName: '',
    mrn: '',
    patientSex: '',
    studyDateFrom: '',
    studyDateTo: '',
    description: '',
    modality: '',
    accessionNumber: '',
    instancesMin: '',
  };

  const [filters, setFilters] = useState(initialFilters);

  const loadStudies = useCallback(async (filterValues: typeof initialFilters) => {
    setStudiesLoading(true);
    setStudiesError(null);
    try {
      const params = new URLSearchParams();
      if (filterValues.patientName.trim()) params.set('patientName', filterValues.patientName.trim());
      if (filterValues.mrn.trim()) params.set('mrn', filterValues.mrn.trim());
      if (filterValues.patientSex) params.set('patientSex', filterValues.patientSex);
      if (filterValues.studyDateFrom) params.set('studyDateFrom', filterValues.studyDateFrom);
      if (filterValues.studyDateTo) params.set('studyDateTo', filterValues.studyDateTo);
      if (filterValues.description.trim()) params.set('description', filterValues.description.trim());
      if (filterValues.modality.trim()) params.set('modality', filterValues.modality.trim());
      if (filterValues.accessionNumber.trim()) params.set('accessionNumber', filterValues.accessionNumber.trim());
      if (filterValues.instancesMin.trim()) params.set('instancesMin', filterValues.instancesMin.trim());
      const res = await fetch(`/api/ohif/studies?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load studies');
      const data = await res.json();
      setAllStudies(data.studies ?? []);
    } catch (e) {
      setStudiesError(e instanceof Error ? e.message : 'Failed to load studies');
      setAllStudies([]);
    } finally {
      setStudiesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudies(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only on mount
  }, []);

  // Refetch studies when user returns to this tab so the table shows live DB data
  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadStudies(filters);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [loadStudies, filters]);

  const handleSearch = useCallback(() => {
    loadStudies(filters);
  }, [loadStudies, filters]);

  const handleClearFilters = useCallback(() => {
    setFilters(initialFilters);
    loadStudies(initialFilters);
    // initialFilters is stable; omit to avoid unnecessary effect churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStudies]);

  const filteredStudies = useMemo(() => allStudies, [allStudies]);
  const groupedPatients = useMemo(() => groupStudiesByPatient(filteredStudies), [filteredStudies]);

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 -m-6 lg:-m-8">
      <header className="flex items-center justify-between gap-3 px-6 lg:px-8 py-3 border-b border-border/50 shrink-0">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">
            Study list
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Patient details
          </p>
        </div>
        <div className="flex items-center gap-4">
          <AddPatientButton onAdded={() => loadStudies(filters)} />
        </div>
      </header>
      <div className="flex-1 min-h-0 flex flex-col gap-6 p-6 lg:p-8 pt-5">
        <section className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-base font-semibold text-foreground">Patient details</h2>
            <span className="text-sm text-muted-foreground tabular-nums">
              {groupedPatients.length} {groupedPatients.length === 1 ? 'patient' : 'patients'}
              {filteredStudies.length > 0 && ` (${filteredStudies.length} ${filteredStudies.length === 1 ? 'study' : 'studies'})`}
            </span>
          </div>
          <StudyListSearch
            patientName={filters.patientName}
            mrn={filters.mrn}
            patientSex={filters.patientSex}
            studyDateFrom={filters.studyDateFrom}
            studyDateTo={filters.studyDateTo}
            description={filters.description}
            modality={filters.modality}
            accessionNumber={filters.accessionNumber}
            instancesMin={filters.instancesMin}
            onPatientNameChange={(v) => setFilters((f) => ({ ...f, patientName: v }))}
            onMRNChange={(v) => setFilters((f) => ({ ...f, mrn: v }))}
            onPatientSexChange={(v) => setFilters((f) => ({ ...f, patientSex: v }))}
            onStudyDateFromChange={(v) => setFilters((f) => ({ ...f, studyDateFrom: v }))}
            onStudyDateToChange={(v) => setFilters((f) => ({ ...f, studyDateTo: v }))}
            onDescriptionChange={(v) => setFilters((f) => ({ ...f, description: v }))}
            onModalityChange={(v) => setFilters((f) => ({ ...f, modality: v }))}
            onAccessionNumberChange={(v) => setFilters((f) => ({ ...f, accessionNumber: v }))}
            onInstancesMinChange={(v) => setFilters((f) => ({ ...f, instancesMin: v }))}
            onSearch={handleSearch}
            onClear={handleClearFilters}
          />
          {studiesError && (
            <p className="text-xs text-destructive" role="alert">
              {studiesError}
            </p>
          )}
          {studiesLoading && (
            <p className="text-xs text-muted-foreground">Loading studies…</p>
          )}
        </section>
        <div className="flex-1 min-h-0 overflow-auto flex flex-col mt-1">
          <PatientTable
            patients={groupedPatients}
            onDeleted={() => loadStudies(filters)}
          />
        </div>
      </div>
    </div>
  );
}
