#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo."
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release ufw

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable docker
systemctl start docker

ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

echo "Docker and firewall bootstrap complete."
echo "Next:"
echo "1. Clone the repo"
echo "2. Copy .env.production.example to .env.production"
echo "3. Run: docker compose --env-file .env.production -f docker-compose.prod.yml up --build -d"
