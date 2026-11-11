# Ulysse — production image (Next.js standalone server)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/storage
RUN useradd --system --uid 1001 deceler && mkdir -p /data/storage && chown -R deceler /data
COPY --from=build --chown=deceler /app/.next/standalone ./
USER deceler
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
