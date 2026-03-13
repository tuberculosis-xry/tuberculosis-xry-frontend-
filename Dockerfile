# syntax=docker.io/docker/dockerfile:1
# Production Dockerfile for Next.js app (standalone output)
# Env: provide DATABASE_URL and other vars at runtime (e.g. docker run -e, or compose env_file)

FROM node:20-alpine AS base

# ─── Stage: install dependencies ───
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Prisma client (required at build time for Next.js)
COPY prisma ./prisma
RUN npx prisma generate

# ─── Stage: build ───
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build --legacy-peer-deps

# ─── Stage: runner (minimal production image) ───
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --gid nodejs nextjs

# Copy standalone output (next.config.ts already has output: 'standalone')
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Standalone server
CMD ["node", "server.js"]
