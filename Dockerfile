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

# R2_PUBLIC_BASE_URL is consumed by next.config.ts, which is evaluated ONLY at
# build time: the CSP header (img-src) is compiled into .next/routes-manifest.json
# and the standalone server serves it verbatim — runtime env never affects it.
# The build-arg is therefore load-bearing: without it the builder crashes loudly
# (new URL(undefined)), by design — the alternative (a fallback to an empty
# origin) would silently bake a CSP that blocks production avatars. Pass it via
# build-args in cd.yml; runner env does not reach `docker build`.
ARG R2_PUBLIC_BASE_URL
ENV R2_PUBLIC_BASE_URL=$R2_PUBLIC_BASE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run build
RUN bun run build

# Bundle the Expiry Sweep job entry (OPS-01b) for the Bun runtime: one
# self-contained file with the members module, DI container and DB driver
# baked in, so the runtime stage needs no node_modules for it. Validated env
# (DATABASE_URL etc.) is read at RUNTIME from the container env — the same
# env the standalone server already receives.
RUN bun build scripts/annual-membership-expiry.ts --target=bun \
    --outfile=dist/annual-membership-expiry.js

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

# Expiry Sweep job bundle (OPS-01b), beside the standalone server and owned
# by the non-root user like the rest of /app. Run it inside the container
# (Dokploy job / terminal) with the app env already present:
#   bun annual-membership-expiry.js --dry-run
COPY --from=builder --chown=nextjs:nodejs /app/dist/annual-membership-expiry.js ./annual-membership-expiry.js

USER nextjs

# Use dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the Next.js server with Bun
CMD ["bun", "server.js"]
