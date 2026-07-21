// Configuracao do SCRAPER (roda fora da Vercel: seu VPS/PC).
// O site Next.js le do Supabase e nao usa este arquivo.

export const config = {
  baseUrl: "https://rubinot.com.br/highscores",

  // Mundo(s) a coletar por NOME. null = todos. String ou array.
  world: "Spectrum",

  // Grupos de vocacao (a API retorna top 1000 por mundo+vocacao).
  // 0=Todas, 1=None, 2=Sorcerers, 3=Druids, 4=Paladins, 5=Knights, 9=Monks
  vocations: [1, 2, 3, 4, 5, 9],

  // Tambem coletar o ranking "Exp Hoje" do site (cross-check). Opcional.
  alsoExpToday: false,

  // Server save do servidor (horario local). Define o "dia de jogo".
  serverSaveHour: 10,
  serverSaveMinute: 0,
  timezone: "America/Sao_Paulo",

  // Playwright: Turnstile so passa headful. Em VPS use `npm run scrape:xvfb`.
  headless: false,
  userDataDir: "./data/profile",

  // Backup local em SQLite (sempre gravado). O envio ao Supabase acontece
  // automaticamente se as variaveis SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
  // estiverem definidas no ambiente.
  sqlitePath: "./data/rubinot.db",
};
