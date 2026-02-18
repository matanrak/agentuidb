FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/package.json core/
COPY dashboard/package.json dashboard/
RUN npm ci --workspace=dashboard --workspace=@agentuidb/core

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/core/node_modules ./core/node_modules
COPY --from=deps /app/dashboard/node_modules ./dashboard/node_modules
COPY package.json package-lock.json ./
COPY core/ core/
COPY dashboard/ dashboard/
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @agentuidb/core && npm run build -w dashboard

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 501 mrak && \
    adduser --system --uid 501 -G mrak mrak && \
    mkdir -p /data && \
    chown mrak:mrak /data
COPY --from=builder /app/dashboard/public ./public
COPY --from=builder --chown=mrak:mrak /app/dashboard/.next/standalone ./
COPY --from=builder --chown=mrak:mrak /app/dashboard/.next/static ./dashboard/.next/static
COPY --chown=mrak:mrak docs/seed.sqlite /data/db.sqlite
USER mrak
EXPOSE 3000
ENV PORT=3000
ENV DATABASE_PATH=/data/db.sqlite
ENV HOSTNAME="0.0.0.0"
CMD ["node", "dashboard/server.js"]
