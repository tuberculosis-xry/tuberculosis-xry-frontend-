'use client';

import type { PatientStudy } from '@/lib/ohif/types';
import { ChevronRight } from 'lucide-react';

type PatientListProps = {
  studies: PatientStudy[];
  selectedStudyUID: string | null;
  onSelectStudy: (studyInstanceUID: string) => void;
};

export function PatientList({ studies, selectedStudyUID, onSelectStudy }: PatientListProps) {
  const uniquePatients = Array.from(
    new Map(studies.map((s) => [s.patientId, { patientId: s.patientId, patientName: s.patientName }])).values()
  );

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-foreground px-3 py-2 border-b border-border/50">
        Patient details
      </h2>
      <ul className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {uniquePatients.length === 0 ? (
          <li className="px-3 py-4 text-sm text-muted-foreground">No patients</li>
        ) : (
          uniquePatients.map((p) => {
            const patientStudies = studies.filter((s) => s.patientId === p.patientId);
            const isSelected = patientStudies.some((s) => s.studyInstanceUID === selectedStudyUID);
            return (
              <li key={p.patientId}>
                <button
                  type="button"
                  onClick={() => patientStudies[0] && onSelectStudy(patientStudies[0].studyInstanceUID)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm rounded-lg transition-colors
                    ${isSelected ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted/60 text-foreground'}
                  `}
                >
                  <ChevronRight className="w-4 h-4 shrink-0" />
                  <span className="truncate">{p.patientName}</span>
                  <span className="text-muted-foreground text-xs shrink-0">({patientStudies.length})</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
