# Production database (MongoDB Atlas) – 10M+ users

This app is built to support **at least 10 million users** with MongoDB Atlas.

## What’s in place

- **Prisma + MongoDB**: `provider = "mongodb"` in `prisma/schema.prisma`; `DATABASE_URL` in `.env` points to Atlas.
- **Indexes** (in schema; applied via `npx prisma db push`):
  - `TuberculosisDiagnosis`: `userId`, `timestamp`, compound `(userId, timestamp desc)` for fast paginated lists.
  - `User`: unique on `email` (used by NextAuth if enabled).
- **Scans API**:
  - `GET /api/scans`: cursor-based pagination (`limit`, `cursor`); default 50, max 100 per request.
  - `POST /api/scans`: validation (class, confidenceScore, image size cap ~12MB).
- **Stats API**: `GET /api/stats` uses DB-side aggregation (`groupBy`) so stats are computed in the database, not by loading all scans into memory.
- **Single Prisma client**: `src/app/lib/prisma.ts` singleton; `auth.ts` uses it (no per-request client).
- **Rate limiting**: In-memory rate limiter on GET/POST `/api/scans`, GET `/api/stats`, POST proxy; 429 + Retry-After when exceeded (env: `RATE_LIMIT_READ_PER_MIN`, `RATE_LIMIT_WRITE_PER_MIN`).
- **Server cache**: In-memory cache for GET scans/stats per userId; invalidated on POST scans so DB is only hit when data changes.
- **Browser cache**: Encrypted (AES-256-GCM) localStorage cache; key from uid + salt (`NEXT_PUBLIC_CACHE_SALT`); invalidated on mutation and logout.
- **ETag/304**: GET scans and GET stats support `If-None-Match` for conditional requests.

## Before production

1. **Apply schema to Atlas**  
   From the frontend app root:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
   This creates/updates collections and indexes. For 10M+ users, ensure the cluster has enough capacity (see below).

2. **Environment**  
   Set `DATABASE_URL` in your deployment (e.g. Vercel/Netlify env). Do not commit real credentials; use `.env.example` as a template.

3. **MongoDB Atlas**  
   - Use a tier that supports your expected data size and read/write throughput (e.g. M30+ for heavy traffic and 10M+ users).
   - Keep connection string with `retryWrites=true&w=majority` (or your chosen write concern).
   - Configure IP access and authentication (no anonymous access in production).

4. **Optional**  
   - For very high serverless concurrency, consider [Prisma Data Platform / Accelerate](https://www.prisma.io/data-platform) for connection pooling.
   - Ensure your hosting provider’s request body size limit allows POST `/api/scans` (base64 images; we recommend at least 15MB for the route).

## Data model summary

- **Users**: Auth is Firebase; MongoDB `User` is used only if NextAuth Credentials are enabled. For scale, the main growth is in `TuberculosisDiagnosis` per user.
- **Scans**: Stored in `TuberculosisDiagnosis` with `userId` (Firebase UID). List and stats are indexed and paginated/aggregated so they scale with user count and scans per user.
