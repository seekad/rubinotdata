# RubinotData — rastreador de XP diária

Mostra **quanto de XP cada jogador do [Rubinot](https://rubinot.com.br/highscores)
fez por dia** (entre um server save e o próximo), por mundo e vocação — inclusive
para quem não está no top 1000 global (basta estar no top 1000 do mundo+vocação).

## Arquitetura

```
[Scraper headful]  →  escreve  →  [Supabase (Postgres)]  ←  lê  ←  [Next.js na Vercel]
 VPS/PC, cron no                                                    site público (só leitura)
 server save
```

O site do Rubinot é protegido por **Cloudflare Turnstile**. Por trás dele há uma
API JSON (`/api/highscores?world=&category=experience&vocation=`) que entrega os
**1000 de uma vez**. O scraper abre o Chromium **headful** (Playwright) para passar
o Cloudflare (cookie salvo em `data/profile/`), chama a API para cada mundo ×
vocação e faz **upsert** na tabela `player_days` do Supabase.

A **XP do dia** é a diferença da experiência absoluta entre um dia e o anterior
(view `daily_gains`, via `LAG()`). O "dia de jogo" vai de um server save ao
próximo (configurável em `config.mjs`).

Os rankings **7 dias** e **30 dias** somam os ganhos diários numa **janela
deslizante** terminando no dia selecionado (função `period_gains` no Postgres; a
soma telescopa para `exp(fim) − exp(início)`). Pressupõem coleta diária (sem
buracos). No site: abas **Dia / 7 dias / 30 dias / Ranking total**, e o painel do
jogador mostra os totais de 7d e 30d.

> ⚠️ O scraper **não roda na Vercel**: o Turnstile exige um browser real headful,
> que funções serverless não sobem de forma confiável. Rode-o no seu VPS/PC.

## Setup do site (local)

```bash
npm install
cp .env.local.example .env.local   # preencha o DATABASE_URL (ou deixe vazio p/ usar SQLite local)
npm run dev                        # http://localhost:3000
```

Sem `DATABASE_URL`, o site lê o **SQLite local** (`data/rubinot.db`) gerado pelo
scraper — útil para desenvolver offline. Ordem de preferência dos backends:
`NEXT_PUBLIC_SUPABASE_*` (supabase-js) → `DATABASE_URL` (Postgres) → SQLite.

## Setup do Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. SQL Editor → cole e rode `supabase/schema.sql` (cria `player_days`, a view
   `daily_gains`, a função `period_gains` e as views auxiliares).
3. Em **Connect**, copie a **connection string**. Um único segredo, o
   `DATABASE_URL`, liga tanto o site quanto o scraper:
   - Site/Vercel → **Transaction pooler** (porta 6543).
   - Scraper/VPS → **Session pooler** (porta 5432).

O site e o scraper usam Postgres direto pelo pooler (IPv4). Não precisa das
chaves anon/service_role — embora o código ainda aceite `supabase-js` como
alternativa (ver `.env.local.example`).

## Scraper (VPS)

```bash
npx playwright install chromium
export DATABASE_URL='postgresql://postgres.<ref>:<senha>@aws-1-<region>.pooler.supabase.com:5432/postgres'
npm run scrape:xvfb        # servidor sem tela (usa xvfb virtual)
```

Ajuste `config.mjs`: `world` (nome, ou `null` p/ todos), `vocations`, e o
`serverSaveHour` do servidor.

Sempre grava um backup local em `data/rubinot.db` e, se `DATABASE_URL` existir,
faz upsert no Supabase.

### Deploy no VPS (systemd timer)

Instalação automática (Debian/Ubuntu) — clone o repo, entre na pasta e rode
como usuário normal:

```bash
bash deploy/install-vps.sh
# depois edite o segredo e ative:
nano deploy/rubinot.env        # DATABASE_URL (session pooler, porta 5432)
sudo systemctl start rubinot-scrape.service   # testa a primeira coleta
```

O script instala Node 22, xvfb, o Chromium do Playwright, e cria:

- `deploy/rubinot-scrape.service` — coleta (oneshot, roda `run-scrape.sh` com
  xvfb; 3 tentativas se o Cloudflare falhar).
- `deploy/rubinot-scrape.timer` — dispara **10:15 America/Sao_Paulo** (15 min
  após o server save das 10:00, para a API atualizar; fuso explícito, funciona
  com o VPS em UTC).

```bash
systemctl list-timers rubinot-scrape.timer   # próximo disparo
journalctl -u rubinot-scrape.service -f      # logs da coleta
```

> Requisitos do VPS: Debian/Ubuntu, 1 vCPU, ~5 GB de disco. RAM: **2 GB é
> confortável**; **1 GB funciona** porque o instalador cria 2 GB de swap
> automaticamente (a coleta dura ~1 min/dia, então swap não pesa).

## Deploy do site (Vercel)

```bash
vercel                     # ou conecte o repo no dashboard
# defina no projeto Vercel (Environment Variables):
#   DATABASE_URL = connection string do Transaction pooler (porta 6543)
```

Framework detectado: Next.js. Nada de scraper na Vercel — só leitura do Supabase.

## Estrutura

```
config.mjs              config do scraper (mundo/vocações/server save)
supabase/schema.sql     tabela player_days + view daily_gains + RLS
scripts/
  browser.mjs           Playwright + bypass do Cloudflare
  gameday.mjs           "dia de jogo" e parsing
  scrape.mjs            coleta via API → upsert (SQLite + Supabase)
lib/
  data.ts               camada de dados (Supabase em prod, SQLite em dev)
  types.ts, format.ts
app/
  page.tsx              UI (XP do dia / Ranking / detalhe do jogador)
  api/*/route.ts        endpoints lidos pela UI
```

## Mundos e vocações (referência)

- Vocações: `1=None, 2=Sorcerers, 3=Druids, 4=Paladins, 5=Knights, 9=Monks`
- Mundos (id): `Auroria=11, Elysian=1, Spectrum=10, Lunarian=9, ...` (ver `scripts/scrape.mjs`)
