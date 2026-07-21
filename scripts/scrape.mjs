import { config } from "../config.mjs";
import { openBrowser, gotoAndPassCloudflare } from "./browser.mjs";
import { getGameDay, parseNumber } from "./gameday.mjs";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const VOCATION_NAMES = {
  0: "Todas", 1: "None", 2: "Sorcerers", 3: "Druids",
  4: "Paladins", 5: "Knights", 9: "Monks",
};

const STATIC_WORLDS = {
  Auroria: 11, Belaria: 15, Bellum: 17, Divinian: 25, Elysian: 1,
  Etherian: 23, "Grimoria I": 26, "Grimoria II": 27, "Grimoria III": 28,
  "Grimoria IV": 29, Halorian: 24, Lunarian: 9, Mystian: 18, Serenian: 22,
  Solarian: 12, Spectrum: 10, Tenebrium: 21, Vesperia: 16,
};

// --- destinos de gravacao ---------------------------------------------------

function openSqlite() {
  mkdirSync(dirname(config.sqlitePath), { recursive: true });
  const db = new Database(config.sqlitePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_days (
      world TEXT NOT NULL, game_day TEXT NOT NULL, name TEXT NOT NULL,
      level INTEGER, experience INTEGER, vocation TEXT, voc_id INTEGER, rank INTEGER,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (world, game_day, name)
    );
    CREATE INDEX IF NOT EXISTS idx_pd_world_day ON player_days(world, game_day);
    CREATE INDEX IF NOT EXISTS idx_pd_world_name ON player_days(world, name);
  `);
  const stmt = db.prepare(`
    INSERT INTO player_days (world,game_day,name,level,experience,vocation,voc_id,rank,updated_at)
    VALUES (@world,@game_day,@name,@level,@experience,@vocation,@voc_id,@rank,@updated_at)
    ON CONFLICT(world,game_day,name) DO UPDATE SET
      level=excluded.level, experience=excluded.experience, vocation=excluded.vocation,
      voc_id=excluded.voc_id, rank=excluded.rank, updated_at=excluded.updated_at
  `);
  return {
    write(rows) { db.transaction((rs) => rs.forEach((r) => stmt.run(r)))(rows); },
  };
}

// Escrita remota via Postgres direto (connection string / pooler).
async function openPg() {
  if (!process.env.DATABASE_URL) return null;
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const cols = ["world", "game_day", "name", "level", "experience", "vocation", "voc_id", "rank"];
  return {
    label: "Postgres (DATABASE_URL)",
    async write(rows) {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const vals = [], params = [];
        batch.forEach((r, k) => {
          const b = k * cols.length;
          vals.push(`(${cols.map((_, j) => `$${b + j + 1}`).join(",")})`);
          params.push(r.world, r.game_day, r.name, r.level, r.experience, r.vocation, r.voc_id, r.rank);
        });
        await client.query(
          `INSERT INTO player_days (${cols.join(",")}) VALUES ${vals.join(",")}
           ON CONFLICT (world,game_day,name) DO UPDATE SET
             level=excluded.level, experience=excluded.experience, vocation=excluded.vocation,
             voc_id=excluded.voc_id, rank=excluded.rank, updated_at=now()`,
          params
        );
      }
    },
    async close() { await client.end(); },
  };
}

// Alternativa: Supabase REST via service_role (se preferir nao usar DATABASE_URL).
async function openSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  return {
    label: "Supabase (service_role)",
    async write(rows) {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await sb
          .from("player_days")
          .upsert(batch, { onConflict: "world,game_day,name" });
        if (error) throw new Error("Supabase: " + error.message);
      }
    },
    async close() {},
  };
}

// --- coleta ------------------------------------------------------------------

const apiGet = (page, path) =>
  page.evaluate(async (p) => {
    const r = await fetch(p, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${p}`);
    return r.json();
  }, path);

async function resolveWorlds(page) {
  try {
    const data = await apiGet(page, "/api/worlds");
    const arr = Array.isArray(data) ? data : data.worlds || Object.values(data).find(Array.isArray);
    const map = {};
    for (const w of arr || []) {
      const name = w.name || w.worldName || w.title;
      const id = w.id ?? w.value ?? w.worldId;
      if (name != null && id != null) map[name] = id;
    }
    if (Object.keys(map).length) return map;
  } catch { /* fallback */ }
  return { ...STATIC_WORLDS };
}

async function run() {
  const gameDay = getGameDay();
  const updatedAt = new Date().toISOString();
  const sqlite = openSqlite();
  const remote = (await openPg()) || (await openSupabase());
  console.log(
    `Destino: SQLite (data/rubinot.db)${remote ? " + " + remote.label : " (remoto OFF — sem DATABASE_URL/SUPABASE_*)"} | dia=${gameDay}`
  );

  const ctx = await openBrowser();
  const page = ctx.pages()[0] || (await ctx.newPage());
  console.log("Passando pelo Cloudflare...");
  await gotoAndPassCloudflare(page, config.baseUrl);

  const worldMap = await resolveWorlds(page);
  const worlds =
    config.world == null
      ? Object.keys(worldMap)
      : Array.isArray(config.world) ? config.world : [config.world];

  const allRows = [];
  for (const worldName of worlds) {
    const worldId = worldMap[worldName];
    if (worldId == null) { console.warn(`! mundo desconhecido: ${worldName}`); continue; }
    for (const vocId of config.vocations) {
      try {
        const json = await apiGet(
          page,
          `/api/highscores?world=${worldId}&category=experience&vocation=${vocId}`
        );
        const players = json.players || [];
        const rows = players.map((p) => ({
          world: worldName,
          game_day: gameDay,
          name: p.name,
          level: parseNumber(p.level),
          experience: parseNumber(p.value ?? p.experience),
          vocation: VOCATION_NAMES[vocId] || String(vocId),
          voc_id: parseNumber(p.vocation),
          rank: parseNumber(p.rank),
          updated_at: updatedAt,
        }));
        allRows.push(...rows);
        console.log(`  ${worldName} / ${VOCATION_NAMES[vocId]}: ${rows.length}`);
      } catch (e) {
        console.warn(`  ! ${worldName}/${vocId}: ${e.message}`);
      }
      await page.waitForTimeout(250);
    }
  }
  await ctx.close();

  // grava (dedup por world+name+game_day; ultimo vence)
  const byKey = new Map();
  for (const r of allRows) byKey.set(`${r.world}|${r.game_day}|${r.name}`, r);
  const rows = [...byKey.values()];

  sqlite.write(rows);
  if (remote) {
    await remote.write(rows);
    await remote.close();
  }
  console.log(`\nOK: ${rows.length} jogadores gravados (dia ${gameDay}).`);
}

run().catch((e) => { console.error("ERRO:", e.stack || e.message); process.exit(1); });
