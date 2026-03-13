# Production deployment checklist

Use this list before going live. Code-side items are implemented; ops/infra items are for you to complete.

---

## Code / app (done)

| Item | Status |
|------|--------|
| MongoDB Atlas + Prisma with indexes for 10M+ users | Done (schema + `db push`) |
| Cursor pagination on GET /api/scans (no unbounded reads) | Done |
| DB-side aggregation for stats (no full table scan) | Done |
| API rate limiting (read/write per user or IP) | Done |
| Server-side response cache with invalidation on POST scans | Done |
| Browser cache with AES-256 encryption; invalidate on mutation & logout | Done |
| ETag/304 for GET scans and GET stats | Done |
| Input validation and size limits on POST /api/scans | Done |
| Auth: Firebase + cookie; protected routes in middleware | Done |
| Standalone build + Prisma tracing in next.config | Done |

---

## Before first deploy (you)

1. **Environment variables** (in your hosting dashboard, not in repo):
   - `DATABASE_URL` – MongoDB Atlas connection string (production cluster).
   - All `NEXT_PUBLIC_FIREBASE_*` – Firebase project config.
   - **Firebase Admin** (for server-side API auth): `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (or `GOOGLE_APPLICATION_CREDENTIALS`). See `.env.example`.
   - `NEXT_PUBLIC_API_URL` – URL of the FastAPI prediction backend when calling from the browser (default `http://localhost:8000`). In production with Caddy, use same-origin so the frontend proxy is used, or your backend URL if you expose it and set CORS.
   - **Production:** set `NEXT_PUBLIC_CACHE_SALT` to a long random string (e.g. 32+ chars).
   - Optional: `RATE_LIMIT_READ_PER_MIN`, `RATE_LIMIT_WRITE_PER_MIN` (defaults: 60, 20).
   - Optional: `MODEL_BACKEND` – backend URL used by the **server** for the prediction proxy (e.g. in Docker: `http://tuberculosis_diagnosis_backend_python:8000`).

2. **Database:**
   - Run `npx prisma generate` and `npx prisma db push` (or use your CI) so Atlas has collections and indexes.
   - Use an Atlas tier suitable for 10M+ users (e.g. M30+); lock down IP access and auth.

3. **Prediction backend and routing:**
   - Deploy the FastAPI TB model service. With the provided Caddy setup, all traffic goes to the frontend; the backend is not exposed publicly. So the **browser must use the frontend proxy** for predictions: leave `NEXT_PUBLIC_API_URL` as the same origin (or omit it) so the app calls `/dashboard/tuberculosis_diagnosis/api`, which proxies to the backend internally. Set `MODEL_BACKEND` on the server to the backend URL (e.g. `http://tuberculosis_diagnosis_backend_python:8000` in Docker). If you expose the backend directly (e.g. with Caddy routing `/inference/*` to the backend), set `NEXT_PUBLIC_API_URL` to that URL and ensure CORS allows your frontend origin.

4. **Request body size:**
   - If you use Vercel/Netlify etc., ensure POST body limit allows ~15MB for `/api/scans` (base64 images).

5. **Docker Compose (when using the provided compose file):**
   - Run `docker-compose up` from `tuberculosis_diagnosis_backend_python-observability` so the frontend build context `../tuberculosis_diagnosis_frontend-master` resolves. The backend build context is `.` (that directory).

---

## Optional for higher scale / multi-instance

- **Rate limit & server cache:** Current implementation is in-memory (per Node process). For multiple instances, use Redis (e.g. Upstash) and swap `rateLimit.ts` / `serverCache.ts` to a Redis-backed implementation.
- **Prisma:** For very high serverless concurrency, consider Prisma Data Platform / Accelerate for connection pooling.
- **Monitoring:** Add error tracking (e.g. Sentry) and APM if needed.
- **Secrets:** Ensure no `.env` or secrets are committed; use platform env or a secrets manager.

---

## Summary

**From a coding and architecture perspective the app is production-ready:** scalable DB usage, caching, rate limiting, encrypted browser cache, and invalidation are in place. Final steps are configuration (env vars, Atlas tier, prediction backend URL), running `prisma db push`, and optional hardening (Redis, monitoring) for higher scale or multi-instance deployments.
