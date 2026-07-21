// Coleta leve do "exp_today" (XP de hoje) do Rubinot para o placar ao vivo.
// Roda a cada ~30 min. Faz UPSERT com GREATEST(value) -> guarda o pico do dia.
import { config } from "../config.mjs";
import { openBrowser, gotoAndPassCloudflare } from "./browser.mjs";
import { getGameDay, parseNumber } from "./gameday.mjs";

const VOCATION_NAMES = {
  1: "None", 2: "Sorcerers", 3: "Druids", 4: "Paladins", 5: "Knights", 9: "Monks",
};
const STATIC_WORLDS = {
  Auroria: 11, Belaria: 15, Bellum: 17, Divinian: 25, Elysian: 1, Etherian: 23,
  "Grimoria I": 26, "Grimoria II": 27, "Grimoria III": 28, "Grimoria IV": 29,
  Halorian: 24, Lunarian: 9, Mystian: 18, Serenian: 22, Solarian: 12,
  Spectrum: 10, Tenebrium: 21, Vesperia: 16,
};

const apiGet = (page, path) =>
  page.evaluate(async (p) => {
    const r = await fetch(p, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${p}`);
    return r.json();
  }, path);

async function openPg() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL nao definido — necessario para o placar 'Hoje'.");
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const cols = ["world", "game_day", "name", "level", "value", "vocation", "voc_id", "rank"];
  return {
    async write(rows) {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const vals = [], params = [];
        batch.forEach((r, k) => {
          const b = k * cols.length;
          vals.push(`(${cols.map((_, j) => `$${b + j + 1}`).join(",")})`);
          params.push(r.world, r.game_day, r.name, r.level, r.value, r.vocation, r.voc_id, r.rank);
        });
        await client.query(
          `INSERT INTO exp_today (${cols.join(",")}) VALUES ${vals.join(",")}
           ON CONFLICT (world,game_day,name) DO UPDATE SET
             level=excluded.level,
             value=GREATEST(exp_today.value, excluded.value),
             vocation=excluded.vocation, voc_id=excluded.voc_id,
             rank=excluded.rank, updated_at=now()`,
          params
        );
      }
    },
    close: () => client.end(),
  };
}

async function run() {
  const gameDay = getGameDay();
  const pgw = await openPg();
  const worlds = config.world == null
    ? Object.keys(STATIC_WORLDS)
    : Array.isArray(config.world) ? config.world : [config.world];

  const ctx = await openBrowser();
  const page = ctx.pages()[0] || (await ctx.newPage());
  await gotoAndPassCloudflare(page, config.baseUrl);

  const rows = [];
  for (const worldName of worlds) {
    const worldId = STATIC_WORLDS[worldName];
    if (worldId == null) continue;
    for (const vocId of config.vocations) {
      try {
        const json = await apiGet(
          page,
          `/api/highscores?world=${worldId}&category=exp_today&vocation=${vocId}`
        );
        for (const p of json.players || []) {
          rows.push({
            world: worldName, game_day: gameDay, name: p.name,
            level: parseNumber(p.level), value: parseNumber(p.value ?? 0),
            vocation: VOCATION_NAMES[vocId] || String(vocId),
            voc_id: parseNumber(p.vocation), rank: parseNumber(p.rank),
          });
        }
      } catch (e) {
        console.warn(`  ! ${worldName}/${vocId}: ${e.message}`);
      }
      await page.waitForTimeout(200);
    }
  }
  await ctx.close();

  // dedup por chave (ultimo vence antes do GREATEST no banco)
  const byKey = new Map();
  for (const r of rows) byKey.set(`${r.world}|${r.game_day}|${r.name}`, r);
  const uniq = [...byKey.values()];
  await pgw.write(uniq);
  await pgw.close();
  console.log(`exp_today: ${uniq.length} jogadores (dia ${gameDay}).`);
}

run().catch((e) => { console.error("ERRO:", e.stack || e.message); process.exit(1); });
