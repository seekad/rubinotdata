-- RubinotData — schema do Supabase.
-- Cole no SQL Editor do Supabase e rode.

-- Um registro por jogador por dia de jogo (dia = de um server save ao proximo).
-- O scraper faz UPSERT: rodar de novo no mesmo dia sobrescreve com o valor mais
-- recente (o mais proximo do server save).
create table if not exists player_days (
  world       text   not null,
  game_day    date   not null,
  name        text   not null,
  level       integer,
  experience  bigint,
  vocation    text,               -- vocacao do board (Druids, Knights, ...)
  voc_id      integer,            -- vocacao real do char (Tibia: 6=Elder Druid, 8=Elite Knight...)
  rank        integer,            -- posicao no board de exp total naquele dia
  updated_at  timestamptz not null default now(),
  primary key (world, game_day, name)
);

create index if not exists idx_player_days_world_day on player_days (world, game_day);
create index if not exists idx_player_days_world_name on player_days (world, name);

-- XP ganho por dia: diferenca da experiencia absoluta para o dia anterior
-- em que o jogador apareceu no ranking (LAG lida com dias faltantes).
create or replace view daily_gains as
select
  world,
  game_day,
  name,
  level,
  vocation,
  voc_id,
  rank,
  experience,
  lag(experience) over w as prev_experience,
  lag(game_day)   over w as prev_game_day,
  experience - lag(experience) over w as xp_gained,
  level      - lag(level)      over w as levels_gained
from player_days
window w as (partition by world, name order by game_day);

-- Leitura publica (dados de highscore sao publicos). Escrita so via service role.
alter table player_days enable row level security;

drop policy if exists "leitura publica" on player_days;
create policy "leitura publica" on player_days
  for select using (true);

-- XP "de hoje" (exp_today do Rubinot), para o placar ao vivo. O scraper roda
-- a cada ~30 min e faz UPSERT com GREATEST(value) — como o exp_today so cresce
-- ate o server save, o valor guardado eh o pico do dia (= XP de hoje atual).
create table if not exists exp_today (
  world       text   not null,
  game_day    date   not null,
  name        text   not null,
  level       integer,
  value       bigint,             -- XP ganho hoje (desde o server save)
  vocation    text,
  voc_id      integer,
  rank        integer,
  updated_at  timestamptz not null default now(),
  primary key (world, game_day, name)
);
create index if not exists idx_exp_today_rank on exp_today (world, game_day, value desc);

alter table exp_today enable row level security;
drop policy if exists "leitura publica exp_today" on exp_today;
create policy "leitura publica exp_today" on exp_today for select using (true);
grant select on exp_today to anon, authenticated;

-- Ranking por periodo (semana/mes): soma os ganhos diarios no intervalo.
-- Com coleta diaria, sum(xp_gained) telescopa para exp(fim) - exp(inicio).
create or replace function period_gains(p_world text, p_start date, p_end date)
returns table (
  name text,
  vocation text,
  level integer,
  experience bigint,
  xp_gained bigint,
  levels_gained integer,
  days integer
)
language sql stable as $$
  select
    name,
    max(vocation)                as vocation,
    max(level)                   as level,
    max(experience)              as experience,
    sum(xp_gained)::bigint       as xp_gained,
    sum(levels_gained)::int      as levels_gained,
    count(*)::int                as days
  from daily_gains
  where world = p_world
    and game_day between p_start and p_end
    and xp_gained is not null
  group by name
  order by xp_gained desc
  limit 1000
$$;

-- Views auxiliares para popular os seletores sem puxar a tabela toda.
create or replace view worlds_v as
  select distinct world from player_days order by world;

create or replace view world_days_v as
  select distinct world, game_day from player_days order by game_day desc;

-- A view herda o RLS da tabela base; garante acesso de leitura aos papeis anon/auth.
grant select on player_days to anon, authenticated;
grant select on daily_gains to anon, authenticated;
grant select on worlds_v    to anon, authenticated;
grant select on world_days_v to anon, authenticated;
grant execute on function period_gains(text, date, date) to anon, authenticated;
