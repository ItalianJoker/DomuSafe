# DomuSafe — immagine di produzione self-host (Next.js standalone)
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Piano self-host incorporato in build (BASIC|ADVANCED|PREMIUM). Default BASIC.
ARG NEXT_PUBLIC_DOMUSAFE_TIER=BASIC
ENV NEXT_PUBLIC_DOMUSAFE_TIER=$NEXT_PUBLIC_DOMUSAFE_TIER
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Directory envelope sync E2EE (solo ciphertext). Montare un volume in produzione.
ENV DOMUSAFE_SYNC_DIR=/app/data/sync

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/data/sync \
  && chown -R nextjs:nodejs /app/data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
VOLUME ["/app/data/sync"]
CMD ["node", "server.js"]
