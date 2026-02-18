FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
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

FROM deps AS dev
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/ core/
COPY dashboard/ dashboard/
COPY mcp/ mcp/
COPY plugin/ plugin/
COPY docs/ docs/
COPY SKILL.md ./
RUN npm run build -w @agentuidb/core
EXPOSE 3000
CMD ["npm", "run", "dev", "-w", "dashboard"]

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p /data && chown node:node /data
COPY --from=builder /app/dashboard/public ./public
COPY --from=builder --chown=node:node /app/dashboard/.next/standalone ./
COPY --from=builder --chown=node:node /app/dashboard/.next/static ./dashboard/.next/static
COPY --chown=node:node docs/seed.sqlite /data/db.sqlite
USER node
EXPOSE 3000
ENV PORT=3000
ENV DATABASE_PATH=/data/db.sqlite
ENV HOSTNAME="0.0.0.0"
CMD ["node", "dashboard/server.js"]
