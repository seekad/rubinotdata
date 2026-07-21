#!/usr/bin/env bash
# Instala e agenda o scraper do RubinotData num VPS Debian/Ubuntu.
# Rode como usuario NORMAL (com sudo), de dentro da pasta do projeto:
#   bash deploy/install-vps.sh
set -euo pipefail

if [ "$EUID" -eq 0 ]; then
  echo "Rode como usuario normal (nao root). O script usa sudo quando precisa." >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="$(whoami)"
echo ">> Projeto: $APP_DIR   Usuario: $APP_USER"

echo ">> [1/6] Pacotes do sistema (node, xvfb, build tools)..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg git xvfb build-essential python3

if ! command -v node >/dev/null || [ "$(node -v | cut -c2 | tr -d .)" -lt 2 ]; then
  echo ">> instalando Node.js 22 (NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "   node $(node -v)"

echo ">> [1b/6] Swap (necessario em VPS de 1 GB para o Chromium headful)..."
mem_mb=$(free -m | awk '/^Mem:/{print $2}')
swap_mb=$(free -m | awk '/^Swap:/{print $2}')
if [ "${mem_mb:-0}" -lt 1800 ] && [ "${swap_mb:-0}" -lt 512 ]; then
  echo "   RAM baixa (${mem_mb} MB) e pouco swap — criando 2 GB de swap..."
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "   RAM/swap suficientes (${mem_mb} MB RAM, ${swap_mb} MB swap) — ok."
fi

echo ">> [2/6] Dependencias npm..."
cd "$APP_DIR"
npm install

echo ">> [3/6] Chromium do Playwright (+ libs do SO)..."
npx playwright install --with-deps chromium

echo ">> [4/6] Arquivo de segredos (deploy/rubinot.env)..."
if [ ! -f deploy/rubinot.env ]; then
  cp deploy/rubinot.env.example deploy/rubinot.env
  chmod 600 deploy/rubinot.env
  echo "   >>> EDITE deploy/rubinot.env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY <<<"
fi

echo ">> [5/6] Instalando unidades systemd..."
chmod +x deploy/run-scrape.sh
for unit in rubinot-scrape.service rubinot-scrape.timer; do
  sed -e "s#__DIR__#$APP_DIR#g" -e "s#__USER__#$APP_USER#g" \
    "deploy/$unit" | sudo tee "/etc/systemd/system/$unit" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable --now rubinot-scrape.timer

echo ">> [6/6] Pronto!"
echo "   Proxima execucao:"
systemctl list-timers rubinot-scrape.timer --no-pager || true
echo
echo "Comandos uteis:"
echo "  sudo systemctl start rubinot-scrape.service   # rodar agora (teste)"
echo "  journalctl -u rubinot-scrape.service -f       # ver logs"
echo "  systemctl list-timers rubinot-scrape.timer    # proximo disparo"
