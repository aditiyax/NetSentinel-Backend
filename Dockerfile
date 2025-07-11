# Use multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Run Prisma generate
RUN npx prisma generate --schema=src/db/prisma/schema.prisma

# Compile TypeScript
RUN npm run build

# ---- Production Image ----
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env .env

CMD ["node", "dist/api/index.js"]
