# Soli Car production deploy on Ubuntu

This guide assumes:

- Ubuntu 22.04 or newer
- a domain already pointing to the server IP
- ports `80` and `443` open

## 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 2. Clone the repository

```bash
git clone https://github.com/vladickxqp/soli-car.git
cd soli-car
```

## 3. Create production environment file

```bash
cp .env.production.example .env.production
```

Edit `.env.production` and set:

- `APP_DOMAIN`
- `ACME_EMAIL`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- SMTP values if real emails are needed

## 4. Start the stack

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up --build -d
```

## 5. Check health

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs caddy --tail=120
docker compose --env-file .env.production -f docker-compose.prod.yml logs backend --tail=120
```

## 6. Open the app

- `https://YOUR_DOMAIN`
- `https://YOUR_DOMAIN/admin`

## Notes

- Caddy provisions HTTPS automatically through Let's Encrypt.
- API is exposed to the frontend under `/api/*`.
- Vehicle images are proxied safely through the same domain.
- Backend uploads and storage are persisted through Docker volumes.
- Do not commit `.env.production`.
