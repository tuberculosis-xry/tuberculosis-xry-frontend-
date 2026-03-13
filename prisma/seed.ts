import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OHIF_STUDIES = [
  { studyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5', patientName: 'Demo Patient One', patientId: 'P001', mrn: 'MRN001', studyDate: '2024-01-15', studyTime: '02:05 PM', studyDescription: 'CT CHEST W CONTRAST', modality: 'CT', accessionNumber: 'ACC001', instances: 120, availableModes: ['basic', 'segmentation', 'tmtv'], patientSex: 'M', patientBirthDate: '1980-05-12' },
  { studyInstanceUID: '1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046', patientName: 'Demo Patient Two', patientId: 'P002', mrn: 'MRN002', studyDate: '2024-02-20', studyTime: '10:55 AM', studyDescription: 'MR BRAIN W WO CONTRAST', modality: 'MR', accessionNumber: 'ACC002', instances: 48, availableModes: ['basic', 'segmentation', 'microscopy'], patientSex: 'F', patientBirthDate: '1975-08-22' },
  { studyInstanceUID: '2.25.141277760791347900862109212450152067508', patientName: 'Demo Patient Three', patientId: 'P003', mrn: 'MRN003', studyDate: '2024-03-10', studyTime: '09:30 AM', studyDescription: 'US ABDOMEN', modality: 'US', accessionNumber: 'ACC003', instances: 25, availableModes: ['basic', 'us-pleura'], patientSex: 'M', patientBirthDate: '1990-01-08' },
  { studyInstanceUID: '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463', patientName: 'Demo Patient Four', patientId: 'P004', mrn: 'MRN004', studyDate: '2024-01-08', studyTime: '04:21 PM', studyDescription: 'PET/CT WHOLE BODY', modality: 'PT', accessionNumber: 'ACC004', instances: 402, availableModes: ['basic', 'segmentation', 'tmtv', 'preclinical-4d'], patientSex: 'F', patientBirthDate: '1965-11-30' },
  { studyInstanceUID: '1.2.840.113619.2.55.3.12345678.20240301.1', patientName: 'John Smith', patientId: 'P005', mrn: 'MRN005', studyDate: '2024-04-12', studyTime: '11:15 AM', studyDescription: 'CT ABDOMEN PELVIS W CONTRAST', modality: 'CT', accessionNumber: 'ACC005', instances: 280, availableModes: ['basic', 'segmentation'], patientSex: 'M', patientBirthDate: '1972-03-15' },
  { studyInstanceUID: '1.2.840.113619.2.55.3.12345678.20240302.2', patientName: 'Jane Doe', patientId: 'P006', mrn: 'MRN006', studyDate: '2024-04-05', studyTime: '03:45 PM', studyDescription: 'MR SPINE CERVICAL WO CONTRAST', modality: 'MR', accessionNumber: 'ACC006', instances: 64, availableModes: ['basic', 'segmentation', 'microscopy'], patientSex: 'F', patientBirthDate: '1988-07-20' },
  { studyInstanceUID: '1.2.840.113619.2.55.3.12345678.20240303.3', patientName: 'Robert Johnson', patientId: 'P007', mrn: 'MRN007', studyDate: '2024-03-28', studyDescription: 'CHEST X-RAY 2 VIEW', modality: 'DX', accessionNumber: 'ACC007', instances: 2, availableModes: ['basic'], patientSex: 'M', patientBirthDate: '1955-12-01' },
  { studyInstanceUID: '1.2.840.113619.2.55.3.12345678.20240304.4', patientName: 'Maria Garcia', patientId: 'P008', mrn: 'MRN008', studyDate: '2024-04-18', studyTime: '08:00 AM', studyDescription: 'NM BONE SCAN WHOLE BODY', modality: 'NM', accessionNumber: 'ACC008', instances: 1, availableModes: ['basic', 'tmtv', 'preclinical-4d'], patientSex: 'F', patientBirthDate: '1992-09-14' },
];

async function main() {
  console.log('Start seeding...');

  const existing = await prisma.ohifStudy.findFirst();
  if (!existing) {
    for (const s of OHIF_STUDIES) {
      await prisma.ohifStudy.create({ data: s });
      console.log(`Seeded OHIF study: ${s.patientName} (${s.mrn})`);
    }
  } else {
    console.log('OHIF studies already present, skipping.');
  }

  // Backfill studyTime for existing studies that don't have it (e.g. after adding the column)
  const defaultTimes = ['02:05 PM', '10:55 AM', '09:30 AM', '04:21 PM', '11:15 AM', '03:45 PM', '12:00 PM', '08:00 AM'];
  const allStudies = await prisma.ohifStudy.findMany({ orderBy: { studyDate: 'desc' } });
  const studiesWithoutTime = allStudies.filter((s) => s.studyTime == null || String(s.studyTime).trim() === '');
  for (let i = 0; i < studiesWithoutTime.length; i++) {
    await prisma.ohifStudy.update({
      where: { id: studiesWithoutTime[i].id },
      data: { studyTime: defaultTimes[i % defaultTimes.length] },
    });
    console.log(`Backfilled studyTime for study: ${studiesWithoutTime[i].patientName}`);
  }
  if (studiesWithoutTime.length > 0) {
    console.log(`Backfilled studyTime for ${studiesWithoutTime.length} study(ies).`);
  }

  // Seed users (MongoDB generates _id automatically)
  const users = [
    {
      name: 'dhruva',
      email: 'dhruva@aimpact.com',
      emailVerified: new Date(),
      image: 'https://example.com/images/alice.png',
      password: 'diagn0stics2024!', // Ensure passwords are hashed in your app
    },
    {
      name: 'naveen',
      email: 'naveen@aimpact.lu',
      emailVerified: new Date(),
      image: 'https://example.com/images/bob.png',
      password: 'a1mp@ct2024!',
    },
    {
      name: 'sandeep',
      email: 'sandeepusg@gmail.com',
      emailVerified: new Date(),
      image: 'https://example.com/images/charlie.png',
      password: 'sandeep2024!',
    },
    {
      name: 'ganesh',
      email: 'ganesh@tnex.com',
      emailVerified: new Date(),
      image: 'https://example.com/images/charlie.png',
      password: 'tnex2024!',
    },
    {
      name: 'testuser',
      email: 'testuser@tnex.com',
      emailVerified: new Date(),
      image: 'https://example.com/images/david.png',
      password: 'test1ng2024!',
    }
  ];

  for (const user of users) {
    await prisma.user.create({
      data: user,
    });
    console.log(`Seeded user with email: ${user.email}`);
  }

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
