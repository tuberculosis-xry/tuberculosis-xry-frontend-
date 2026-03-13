# syntax=docker.io/docker/dockerfile:1
# Production Dockerfile for Next.js (standalone)

FROM node:20-slim AS base

# -----------------------------
# Stage 1: Install dependencies
# -----------------------------
FROM base AS deps
WORKDIR /app

# Install system libs needed by Prisma
RUN apt-get update && apt-get install -y openssl

COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# -----------------------------
# Stage 2: Build application
# -----------------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build --legacy-peer-deps

# -----------------------------
# Stage 3: Production runner
# -----------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install openssl (required by Prisma)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

# Copy Prisma schema and generated client (required for query engine)
COPY --from=builder --chown=nextjs:nextjs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nextjs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nextjs /app/prisma ./prisma


USER nextjs

# Next.js internal port
EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
