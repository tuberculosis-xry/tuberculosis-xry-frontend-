'use client';

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type StudyListSearchProps = {
  patientName: string;
  mrn: string;
  patientSex: string;
  studyDateFrom: string;
  studyDateTo: string;
  description: string;
  modality: string;
  accessionNumber: string;
  instancesMin: string;
  onPatientNameChange: (v: string) => void;
  onMRNChange: (v: string) => void;
  onPatientSexChange: (v: string) => void;
  onStudyDateFromChange: (v: string) => void;
  onStudyDateToChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onModalityChange: (v: string) => void;
  onAccessionNumberChange: (v: string) => void;
  onInstancesMinChange: (v: string) => void;
  onSearch: () => void;
  onClear?: () => void;
};

const inputClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 min-w-0';

export function StudyListSearch({
  patientName,
  mrn,
  patientSex,
  studyDateFrom,
  studyDateTo,
  description,
  modality,
  accessionNumber,
  instancesMin,
  onPatientNameChange,
  onMRNChange,
  onPatientSexChange,
  onStudyDateFromChange,
  onStudyDateToChange,
  onDescriptionChange,
  onModalityChange,
  onAccessionNumberChange,
  onInstancesMinChange,
  onSearch,
  onClear,
}: StudyListSearchProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch();
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-[1fr_1fr_0.6fr_0.75fr_0.75fr_1.1fr_0.7fr_0.9fr_0.6fr_auto] gap-3 items-end p-5 rounded-xl border border-border bg-muted/20">
      <div className="flex flex-col gap-2 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">Patient name</label>
        <Input
          type="text"
          value={patientName}
          onChange={(e) => onPatientNameChange(e.target.value)}
          placeholder="Search..."
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">MRN</label>
        <Input
          type="text"
          value={mrn}
          onChange={(e) => onMRNChange(e.target.value)}
          placeholder="MRN"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">Sex</label>
        <select
          value={patientSex}
          onChange={(e) => onPatientSexChange(e.target.value)}
          className={inputClass}
        >
          <option value="">All</option>
          <option value="M">M</option>
          <option value="F">F</option>
          <option value="O">O</option>
        </select>
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">Study date from</label>
        <Input
          type="date"
          value={studyDateFrom}
          onChange={(e) => onStudyDateFromChange(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">Study date to</label>
        <Input
          type="date"
          value={studyDateTo}
          onChange={(e) => onStudyDateToChange(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">Description</label>
        <Input
          type="text"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Description"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">Modality</label>
        <Input
          type="text"
          value={modality}
          onChange={(e) => onModalityChange(e.target.value)}
          placeholder="CT, MR, …"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">Accession #</label>
        <Input
          type="text"
          value={accessionNumber}
          onChange={(e) => onAccessionNumberChange(e.target.value)}
          placeholder="Accession"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">Instances (min)</label>
        <Input
          type="number"
          min={0}
          value={instancesMin}
          onChange={(e) => onInstancesMinChange(e.target.value)}
          placeholder="—"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <span className="text-xs font-medium text-muted-foreground invisible">Search</span>
        <div className="flex items-center gap-2 shrink-0">
          <Button type="submit" size="sm" className="h-9 gap-2">
            <Search className="h-4 w-4" />
            Search
          </Button>
          {onClear && (
            <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={onClear}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
