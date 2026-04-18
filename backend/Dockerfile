FROM node:20-alpine AS builder
WORKDIR /app
RUN apk update && apk add --no-cache openssl netcat-openbsd
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install
RUN npm run prisma:generate
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk update && apk add --no-cache openssl netcat-openbsd
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY .env.example .env
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 4000
CMD ["./docker-entrypoint.sh"]
