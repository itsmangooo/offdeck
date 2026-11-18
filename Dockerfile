FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY client/ ./client/
COPY public/ ./public/
COPY shared/ ./shared/
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server/ ./server/
COPY shared/ ./shared/
COPY decks/ ./decks/
COPY LICENSE ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server/index.js"]
