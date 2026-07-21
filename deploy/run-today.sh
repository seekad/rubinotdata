#!/usr/bin/env bash
# Wrapper do systemd para a coleta do exp_today (placar "Hoje" ao vivo).
# Roda a cada ~30 min. Leve: so o exp_today, grava direto no Postgres.
set -uo pipefail

cd "$(dirname "$0")/.."
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi

for attempt in 1 2; do
  if xvfb-run -a --server-args="-screen 0 1366x900x24" node scripts/scrape-today.mjs; then
    exit 0
  fi
  sleep 30
done
exit 1
