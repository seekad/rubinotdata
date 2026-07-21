#!/usr/bin/env bash
# Wrapper chamado pelo systemd. Roda o scraper com display virtual (xvfb)
# para o Chromium headful passar pelo Cloudflare. Tenta ate 3x (o challenge
# do Cloudflare as vezes falha na primeira).
set -uo pipefail

cd "$(dirname "$0")/.."

# permite node via nvm (se existir) ou do sistema (/usr/bin/node)
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi

for attempt in 1 2 3; do
  echo "== tentativa $attempt =="
  if xvfb-run -a --server-args="-screen 0 1366x900x24" node scripts/scrape.mjs; then
    exit 0
  fi
  echo "falhou; aguardando 60s antes de tentar de novo..."
  sleep 60
done

echo "coleta falhou apos 3 tentativas"
exit 1
