import type { PatientStudy } from './types';

/** Mock patient/study list for Phase 1. Replace with DICOMweb (QIDO), local JSON, or API later. */
export function getMockStudies(): PatientStudy[] {
  return [
    {
      studyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5',
      patientName: 'Demo Patient One',
      patientId: 'P001',
      mrn: 'MRN001',
      studyDate: '2024-01-15',
      studyDescription: 'CT CHEST W CONTRAST',
      modality: 'CT',
      accessionNumber: 'ACC001',
      instances: 120,
      availableModes: ['basic', 'segmentation', 'tmtv'],
    },
    {
      studyInstanceUID: '1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046',
      patientName: 'Demo Patient Two',
      patientId: 'P002',
      mrn: 'MRN002',
      studyDate: '2024-02-20',
      studyDescription: 'MR BRAIN W WO CONTRAST',
      modality: 'MR',
      accessionNumber: 'ACC002',
      instances: 48,
      availableModes: ['basic', 'segmentation', 'microscopy'],
    },
    {
      studyInstanceUID: '2.25.141277760791347900862109212450152067508',
      patientName: 'Demo Patient Three',
      patientId: 'P003',
      mrn: 'MRN003',
      studyDate: '2024-03-10',
      studyDescription: 'US ABDOMEN',
      modality: 'US',
      accessionNumber: 'ACC003',
      instances: 25,
      availableModes: ['basic', 'us-pleura'],
    },
    {
      studyInstanceUID: '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
      patientName: 'Demo Patient Four',
      patientId: 'P004',
      mrn: 'MRN004',
      studyDate: '2024-01-08',
      studyDescription: 'PET/CT WHOLE BODY',
      modality: 'PT',
      accessionNumber: 'ACC004',
      instances: 402,
      availableModes: ['basic', 'segmentation', 'tmtv', 'preclinical-4d'],
    },
  ];
}
