import { chromium } from "playwright";
import { config } from "../config.mjs";
import { mkdirSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function openBrowser() {
  mkdirSync(config.userDataDir, { recursive: true });
  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless,
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: "pt-BR",
    timezoneId: config.timezone,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return context;
}

const CHALLENGE_RE =
  /just a moment|um momento|checking your browser|verificando|attention required|enable javascript|cf_chl|turnstile/i;

async function isChallenge(page) {
  const title = await page.title().catch(() => "");
  if (CHALLENGE_RE.test(title)) return true;
  const html = await page.content().catch(() => "");
  const hasMarkers = /cf_chl|turnstile|cf-turnstile|challenge-platform/i.test(html);
  const hasReal = await page
    .evaluate(() => !!document.querySelector("select, table"))
    .catch(() => false);
  return hasMarkers && !hasReal;
}

async function clickTurnstile(page) {
  for (const frame of page.frames()) {
    if (/challenges\.cloudflare\.com/i.test(frame.url())) {
      const box = await frame
        .$('input[type="checkbox"], label, body')
        .catch(() => null);
      if (box) await box.click({ timeout: 3000 }).catch(() => {});
    }
  }
}

export async function gotoAndPassCloudflare(page, url, { timeout = 90000 } = {}) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout }).catch(() => {});
  const deadline = Date.now() + timeout;
  let clicked = 0;
  while (Date.now() < deadline) {
    if (!(await isChallenge(page))) {
      await page.waitForSelector("select, table", { timeout: 8000 }).catch(() => {});
      return page;
    }
    if (clicked < 3) {
      await clickTurnstile(page);
      clicked++;
    }
    await page.waitForTimeout(2500);
  }
  throw new Error(
    "Cloudflare nao liberou. Rode com tela (ou xvfb-run) — o cookie fica salvo em data/profile."
  );
}
