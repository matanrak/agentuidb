FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY core/package.json core/tsconfig.json core/
COPY core/src/ core/src/
COPY mcp/package.json mcp/tsconfig.json mcp/
COPY mcp/src/ mcp/src/
RUN npm install
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/core/dist/ core/dist/
COPY --from=builder /app/core/package.json core/
COPY --from=builder /app/mcp/dist/ mcp/dist/
COPY --from=builder /app/mcp/package.json mcp/
EXPOSE 3001
CMD ["node", "mcp/dist/http.js"]
