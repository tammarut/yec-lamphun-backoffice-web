# syntax=docker/dockerfile:1
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Dependency stage
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM oven/bun:1-alpine AS base

# Dependency stage
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Builder stage
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM base AS builder
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Allow skipping env validation at build time (real vars injected at runtime)
ARG SKIP_ENV_VALIDATION=true
ENV SKIP_ENV_VALIDATION=$SKIP_ENV_VALIDATION

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run build
RUN bun run build

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Runner stage
# Production image, copy all the files and run Next.js
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
EXPOSE 3000

# Install dumb-init generally useful, though Bun handles signals well, dumb-init is still good practice in containers
RUN apk add --no-cache dumb-init

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

# Use dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the Next.js server with Bun
CMD ["bun", "server.js"]
