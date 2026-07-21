import type {
  GainsResult,
  GainRow,
  BoardRow,
  PlayerPoint,
  TodayResult,
} from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON);
const usePg = !useSupabase && Boolean(process.env.DATABASE_URL);

// ---------------------------------------------------------------------------
// Backend Supabase (producao)
// ---------------------------------------------------------------------------
async function sb() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL!, SUPABASE_ANON!, {
    auth: { persistSession: false },
  });
}

const supabaseBackend = {
  async worlds(): Promise<string[]> {
    const c = await sb();
    const { data } = await c.from("worlds_v").select("world");
    return (data ?? []).map((r: any) => r.world);
  },
  async days(world: string): Promise<string[]> {
    const c = await sb();
    const { data } = await c
      .from("world_days_v")
      .select("game_day")
      .eq("world", world);
    return (data ?? []).map((r: any) => String(r.game_day));
  },
  async gains(world: string, day: string): Promise<GainsResult> {
    const c = await sb();
    const { data } = await c
      .from("daily_gains")
      .select("*")
      .eq("world", world)
      .eq("game_day", day)
      .not("xp_gained", "is", null)
      .order("xp_gained", { ascending: false })
      .limit(1000);
    const rows = (data ?? []) as any[];
    return {
      world,
      day,
      prevDay: rows[0]?.prev_game_day ? String(rows[0].prev_game_day) : null,
      rows: rows.map(mapGain),
    };
  },
  async leaderboard(world: string, day: string): Promise<BoardRow[]> {
    const c = await sb();
    const { data } = await c
      .from("player_days")
      .select("name, level, vocation, experience")
      .eq("world", world)
      .eq("game_day", day)
      .order("experience", { ascending: false })
      .limit(1000);
    return (data ?? []) as BoardRow[];
  },
  async player(world: string, name: string): Promise<PlayerPoint[]> {
    const c = await sb();
    const { data } = await c
      .from("daily_gains")
      .select("name, game_day, level, experience, xp_gained")
      .eq("world", world)
      .ilike("name", name) // case-insensitive (sem curinga = match exato)
      .order("game_day", { ascending: true });
    return (data ?? []).map((r: any) => ({
      name: r.name,
      game_day: String(r.game_day),
      level: r.level,
      experience: r.experience,
      xp_gained: r.xp_gained,
    }));
  },
  async periodGains(world: string, start: string, end: string): Promise<GainRow[]> {
    const c = await sb();
    const { data } = await c.rpc("period_gains", {
      p_world: world,
      p_start: start,
      p_end: end,
    });
    return ((data ?? []) as any[]).map(mapGain);
  },
  async today(world: string): Promise<TodayResult> {
    const c = await sb();
    const { data: dd } = await c
      .from("exp_today")
      .select("game_day")
      .eq("world", world)
      .order("game_day", { ascending: false })
      .limit(1);
    const day = dd?.[0]?.game_day ? String(dd[0].game_day) : null;
    if (!day) return { world, day: null, updatedAt: null, rows: [] };
    const { data } = await c
      .from("exp_today")
      .select("name, level, vocation, voc_id, rank, value, updated_at")
      .eq("world", world)
      .eq("game_day", day)
      .order("value", { ascending: false })
      .limit(1000);
    const rows = (data ?? []) as any[];
    return { world, day, updatedAt: maxUpdatedAt(rows), rows: rows.map(mapToday) };
  },
};

// ---------------------------------------------------------------------------
// Backend Postgres direto (Supabase via connection string / pooler)
// ---------------------------------------------------------------------------
let _pool: any = null;
async function pg() {
  if (_pool) return _pool;
  const { default: Pg } = (await import("pg" as string)) as any;
  _pool = new Pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10000,
  });
  return _pool;
}
async function q(sql: string, params: any[] = []): Promise<any[]> {
  const pool = await pg();
  const r = await pool.query(sql, params);
  return r.rows;
}

const postgresBackend = {
  async worlds(): Promise<string[]> {
    return (await q(`SELECT world FROM worlds_v`)).map((r) => r.world);
  },
  async days(world: string): Promise<string[]> {
    return (
      await q(`SELECT game_day::text FROM world_days_v WHERE world = $1`, [world])
    ).map((r) => r.game_day);
  },
  async gains(world: string, day: string): Promise<GainsResult> {
    const rows = await q(
      `SELECT name, level, vocation, voc_id, rank,
         experience::float8 AS experience, prev_game_day::text AS prev_game_day,
         xp_gained::float8 AS xp_gained, levels_gained
       FROM daily_gains
       WHERE world = $1 AND game_day = $2 AND xp_gained IS NOT NULL
       ORDER BY xp_gained DESC LIMIT 1000`,
      [world, day]
    );
    return {
      world,
      day,
      prevDay: rows[0]?.prev_game_day ?? null,
      rows: rows.map(mapGain),
    };
  },
  async leaderboard(world: string, day: string): Promise<BoardRow[]> {
    return (await q(
      `SELECT name, level, vocation, experience::float8 AS experience
       FROM player_days WHERE world = $1 AND game_day = $2
       ORDER BY experience DESC LIMIT 1000`,
      [world, day]
    )) as BoardRow[];
  },
  async player(world: string, name: string): Promise<PlayerPoint[]> {
    return (await q(
      `SELECT name, game_day::text AS game_day, level,
         experience::float8 AS experience, xp_gained::float8 AS xp_gained
       FROM daily_gains WHERE world = $1 AND lower(name) = lower($2)
       ORDER BY game_day ASC`,
      [world, name]
    )) as PlayerPoint[];
  },
  async periodGains(world: string, start: string, end: string): Promise<GainRow[]> {
    const rows = await q(
      `SELECT name, vocation, level, experience::float8 AS experience,
         xp_gained::float8 AS xp_gained, levels_gained
       FROM period_gains($1, $2, $3)`,
      [world, start, end]
    );
    return rows.map(mapGain);
  },
  async today(world: string): Promise<TodayResult> {
    const rows = await q(
      `SELECT name, level, vocation, voc_id, rank, value, updated_at,
         game_day::text AS game_day
       FROM exp_today
       WHERE world = $1 AND game_day = (
         SELECT max(game_day) FROM exp_today WHERE world = $1
       )
       ORDER BY value DESC LIMIT 1000`,
      [world]
    );
    return {
      world,
      day: rows[0]?.game_day ?? null,
      updatedAt: maxUpdatedAt(rows),
      rows: rows.map(mapToday),
    };
  },
};

// ---------------------------------------------------------------------------
// Backend SQLite (dev local — le data/rubinot.db)
// ---------------------------------------------------------------------------
let _db: any = null;
async function sqlite() {
  if (_db) return _db;
  // better-sqlite3 nao tem types e so roda no fallback de dev local.
  const { default: Database } = (await import(
    /* webpackIgnore: true */ "better-sqlite3" as string
  )) as any;
  _db = new Database(process.env.SQLITE_PATH || "./data/rubinot.db", {
    readonly: true,
    fileMustExist: false,
  });
  return _db;
}

const GAINS_SQL = `
  WITH d AS (
    SELECT world, game_day, name, level, vocation, voc_id, rank, experience,
      LAG(experience) OVER (PARTITION BY world, name ORDER BY game_day) AS prev_experience,
      LAG(game_day)   OVER (PARTITION BY world, name ORDER BY game_day) AS prev_game_day,
      LAG(level)      OVER (PARTITION BY world, name ORDER BY game_day) AS prev_level
    FROM player_days WHERE world = ?
  )
  SELECT name, level, vocation, voc_id, rank, experience, prev_game_day,
    experience - prev_experience AS xp_gained,
    level - prev_level AS levels_gained
  FROM d WHERE game_day = ? AND prev_experience IS NOT NULL
  ORDER BY xp_gained DESC LIMIT 1000`;

const sqliteBackend = {
  async worlds(): Promise<string[]> {
    try {
      const db = await sqlite();
      return db
        .prepare(`SELECT DISTINCT world FROM player_days ORDER BY world`)
        .all()
        .map((r: any) => r.world);
    } catch {
      return [];
    }
  },
  async days(world: string): Promise<string[]> {
    const db = await sqlite();
    return db
      .prepare(
        `SELECT DISTINCT game_day FROM player_days WHERE world = ? ORDER BY game_day DESC`
      )
      .all(world)
      .map((r: any) => r.game_day);
  },
  async gains(world: string, day: string): Promise<GainsResult> {
    const db = await sqlite();
    const rows = db.prepare(GAINS_SQL).all(world, day) as any[];
    return {
      world,
      day,
      prevDay: rows[0]?.prev_game_day ?? null,
      rows: rows.map(mapGain),
    };
  },
  async leaderboard(world: string, day: string): Promise<BoardRow[]> {
    const db = await sqlite();
    return db
      .prepare(
        `SELECT name, level, vocation, experience FROM player_days
         WHERE world = ? AND game_day = ? ORDER BY experience DESC LIMIT 1000`
      )
      .all(world, day) as BoardRow[];
  },
  async player(world: string, name: string): Promise<PlayerPoint[]> {
    const db = await sqlite();
    const rows = db
      .prepare(
        `SELECT name, game_day, level, experience,
           experience - LAG(experience) OVER (PARTITION BY name ORDER BY game_day) AS xp_gained
         FROM player_days WHERE world = ? AND lower(name) = lower(?) ORDER BY game_day ASC`
      )
      .all(world, name) as any[];
    return rows;
  },
  async periodGains(world: string, start: string, end: string): Promise<GainRow[]> {
    const db = await sqlite();
    const rows = db.prepare(PERIOD_SQL).all(world, start, end) as any[];
    return rows.map(mapGain);
  },
  async today(world: string): Promise<TodayResult> {
    try {
      const db = await sqlite();
      const rows = db
        .prepare(
          `SELECT name, level, vocation, voc_id, rank, value, updated_at, game_day
           FROM exp_today
           WHERE world = ? AND game_day = (SELECT max(game_day) FROM exp_today WHERE world = ?)
           ORDER BY value DESC LIMIT 1000`
        )
        .all(world, world) as any[];
      return {
        world,
        day: rows[0]?.game_day ?? null,
        updatedAt: maxUpdatedAt(rows),
        rows: rows.map(mapToday),
      };
    } catch {
      return { world, day: null, updatedAt: null, rows: [] };
    }
  },
};

const PERIOD_SQL = `
  SELECT name, MAX(vocation) AS vocation, MAX(level) AS level,
    MAX(experience) AS experience,
    SUM(xp_gained) AS xp_gained, SUM(levels_gained) AS levels_gained
  FROM (
    SELECT world, game_day, name, vocation, level, experience,
      experience - LAG(experience) OVER (PARTITION BY world, name ORDER BY game_day) AS xp_gained,
      level      - LAG(level)      OVER (PARTITION BY world, name ORDER BY game_day) AS levels_gained
    FROM player_days WHERE world = ?
  )
  WHERE game_day BETWEEN ? AND ? AND xp_gained IS NOT NULL
  GROUP BY name ORDER BY xp_gained DESC LIMIT 1000`;

function mapGain(r: any): GainRow {
  return {
    name: r.name,
    level: r.level,
    vocation: r.vocation,
    voc_id: r.voc_id ?? null,
    rank: r.rank ?? null,
    experience: r.experience,
    xp_gained: r.xp_gained,
    levels_gained: r.levels_gained ?? null,
  };
}

// exp_today -> shape de GainRow (xp_gained = value do dia)
function mapToday(r: any): GainRow {
  return {
    name: r.name,
    level: r.level,
    vocation: r.vocation,
    voc_id: r.voc_id ?? null,
    rank: r.rank ?? null,
    experience: null,
    xp_gained: Number(r.value),
    levels_gained: null,
  };
}

function maxUpdatedAt(rows: any[]): string | null {
  if (!rows.length) return null;
  return new Date(
    Math.max(...rows.map((r) => +new Date(r.updated_at)))
  ).toISOString();
}

// ---------------------------------------------------------------------------

const backend = useSupabase
  ? supabaseBackend
  : usePg
  ? postgresBackend
  : sqliteBackend;

export const getWorlds = () => backend.worlds();
export const getDays = (world: string) => backend.days(world);
export const getGains = (world: string, day: string) => backend.gains(world, day);
export const getLeaderboard = (world: string, day: string) =>
  backend.leaderboard(world, day);
export const getPlayer = (world: string, name: string) =>
  backend.player(world, name);
export const getPeriodGains = (world: string, start: string, end: string) =>
  backend.periodGains(world, start, end);
export const getToday = (world: string) => backend.today(world);
export const dataSource = useSupabase ? "supabase" : usePg ? "postgres" : "sqlite";
