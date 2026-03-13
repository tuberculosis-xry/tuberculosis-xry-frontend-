# Honest analysis: Is the viewer load fix really fixed?

## Data flow (what *should* happen)

| Step | Component | What it does | DB / API |
|------|-----------|--------------|----------|
| 1. Upload | `AddPatientButton` → `POST /api/ohif/upload-dicom` | Parses DICOM, writes each instance + study | `OhifInstance.upsert()` (same `studyInstanceUID`), then `OhifStudy.upsert()` |
| 2. Study list | `GET /api/ohif/studies` | Returns only studies that have ≥1 row in `OhifInstance` | Filter: `list.filter(s => studyUidsWithInstances.has(s.studyInstanceUID))` |
| 3. Open viewer | `PatientTable` → `handleOpenViewer` | Builds `StudyInstanceUIDs=uid1,uid2,...` from **that** list | UIDs come from API response |
| 4. Viewer requests series | `fetchSeriesWithInstancesForStudies()` → `getSeries(uid)` | `fetch(base + '/studies/' + uid + '/series')` | **Must hit our app** |
| 5. Backend | `GET /api/ohif/dicom-web/studies/{uid}/series` | `db.ohifInstance.findMany({ where: { studyInstanceUID } })` | Same DB as upload |

If step 4 sends the request to a **different host** (e.g. old PACS at 8042), our backend is never called and the viewer gets no data even though upload and list are correct.

---

## What was fixed

1. **Viewer base URL (main fix)**  
   - **Before:** `base = process.env.NEXT_PUBLIC_OHIF_DICOMWEB_URL || '/api/ohif/dicom-web'`.  
     If that env pointed to another server (e.g. `http://localhost:8042/dicom-web`) or was wrong at build time, the browser called that server, not our API.  
   - **After:** In the browser we **always** use `base = '/api/ohif/dicom-web'` (no env).  
   - So series/instance requests from the viewer **always** go to the same-origin Next.js app and hit `dicom-web/[...path]`.

2. **Path and UID handling in dicom-web**  
   - `path` is normalized so we support both array and string (split by `/`).  
   - All UIDs from the URL are `decodeURIComponent` + `trim` before querying, so whitespace doesn’t break the match.

3. **Path param edge case**  
   - If `path` ever came as a single string, we now split it so `parts` is always the correct segment array (e.g. `['studies', uid, 'series']`).

---

## What is *not* guaranteed

- **You must be on the latest bundle.**  
  Restart dev (`npm run dev`) or do a fresh build so the client uses the new `APP_DICOMWEB_PATH` logic. Until then, an old cached bundle might still use the env base URL.

- **Only “list” studies are openable.**  
  The list only shows studies that have at least one `OhifInstance`. If you open the viewer via an **old bookmark or URL** with study UIDs that no longer have instances (or never did), you will still see “No DICOM images found.” That’s expected: the fix doesn’t create data for those UIDs.

- **Same DB for upload and viewer.**  
  Upload and dicom-web both use the same Prisma client and `DATABASE_URL`. If you ever had a setup where upload and API used different DBs, that would still be a problem; in the current code they don’t.

---

## How to confirm it’s really fixed

1. **Restart dev server** (or build and run prod).
2. **Upload one or more DICOM files** via Add Patient (so `OhifInstance` + `OhifStudy` are written).
3. **Open the study list** and confirm the new study (or patient) appears.
4. **Open the viewer** by clicking that patient/study (don’t use an old URL).
5. **In the terminal** you should see requests like:  
   `GET /api/ohif/dicom-web/studies/1.2.840..../series`  
   If those lines appear, the viewer is calling our API. If you still see “No DICOM images” **and** those GETs appear and return 200, then the next place to check is the response body (e.g. empty array) and the DB (whether `OhifInstance` has rows for that `studyInstanceUID`).

---

## Short answer

**Yes, the fix is real and targets the real bug:** the viewer was allowed to call a different host (or wrong URL) for series/instances. Now it always calls `/api/ohif/dicom-web` on the same origin, so the backend that has your uploaded data is the one that gets the request.  

You still need a **fresh dev server (or build)** and to **open the viewer from the current study list** (not an old link) for the fix to take effect. If you do that and the terminal shows the dicom-web GETs, then the remaining “no images” case would be a data/DB issue (e.g. no instances for that study), not the previous “wrong server” issue.
