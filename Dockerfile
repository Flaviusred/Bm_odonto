# ─── Stage 1: Build ────────────────────────────────────────────────────────────
# Instala todas as dependências (incluindo devDeps) e compila o frontend com Vite
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


# ─── Stage 2: Production ───────────────────────────────────────────────────────
# Imagem final enxuta: apenas deps de produção + artefatos de build
FROM node:20-alpine AS production
WORKDIR /app

# Instala somente dependências de produção (inclui 'tsx' que está em "dependencies")
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o frontend compilado pelo Vite
COPY --from=builder /app/dist ./dist

# Copia o servidor Express e arquivos necessários em runtime
COPY server.ts        ./server.ts
COPY tsconfig.json    ./tsconfig.json
COPY firebase-applet-config.json ./firebase-applet-config.json
COPY data.json        ./data.json
COPY scripts/ensure-dist.js ./scripts/ensure-dist.js

# Cria diretório para logs de debug do servidor
RUN mkdir -p /app/tmp

# ── Variáveis de ambiente padrão ──────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Executa o servidor TypeScript diretamente (tsx inclui seu próprio compilador TS)
CMD ["node_modules/.bin/tsx", "server.ts"]
