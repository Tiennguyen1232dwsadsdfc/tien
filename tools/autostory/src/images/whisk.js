import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from '../util/fs.js';
import { log } from '../util/log.js';
import { sleep } from '../util/http.js';

/**
 * Whisk (Google Labs) KHONG co API cong khai, nen cach duy nhat de tu dong hoa
 * la dieu khien trinh duyet that voi phien dang nhap Google cua chinh ban.
 *
 * Hai dieu can biet truoc khi dung:
 *  - Google co the doi giao dien bat cu luc nao. Vi vay moi selector deu nam
 *    trong SELECTORS duoi day va co the ghi de bang file JSON
 *    (WHISK_SELECTORS_FILE) ma khong can sua code.
 *  - Tu dong hoa mot dich vu web co the vi pham dieu khoan su dung cua Google.
 *    Ban tu chiu trach nhiem; neu can su on dinh, dung provider "gemini".
 */

const SELECTORS = {
  // O nhap prompt — thu lan luot tu tren xuong.
  promptInput: [
    'textarea[placeholder*="Describe"]',
    'textarea[aria-label*="prompt" i]',
    'div[contenteditable="true"][role="textbox"]',
    'textarea',
  ],
  // Nut bat dau sinh anh.
  submitButton: [
    'button[aria-label*="Generate" i]',
    'button[aria-label*="submit" i]',
    'button:has-text("Generate")',
    'button[type="submit"]',
  ],
  // Anh ket qua trong khu vuc output.
  resultImage: [
    'img[src^="https://lh3.googleusercontent.com"]',
    'img[src^="data:image"]',
    'main img[src^="blob:"]',
    'main img',
  ],
  // Dau hieu dang xu ly (de biet khi nao xong).
  busy: ['[role="progressbar"]', 'text=/Generating/i'],
};

function loadSelectors(file) {
  if (!file) return SELECTORS;
  const extra = JSON.parse(fs.readFileSync(file, 'utf8'));
  const merged = { ...SELECTORS };
  for (const [key, value] of Object.entries(extra)) {
    merged[key] = Array.isArray(value) ? value : [value];
  }
  return merged;
}

async function firstVisible(page, candidates, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    for (const selector of candidates) {
      try {
        const locator = page.locator(selector).first();
        if (await locator.isVisible({ timeout: 500 })) return locator;
      } catch (err) {
        lastError = err;
      }
    }
    await sleep(400);
  }
  throw new Error(
    `Khong tim thay phan tu tren trang Whisk. Da thu: ${candidates.join(' | ')}.\n` +
      `Giao dien Whisk co the da doi — tao file JSON selector va tro WHISK_SELECTORS_FILE vao do.` +
      (lastError ? `\n(${lastError.message.split('\n')[0]})` : ''),
  );
}

async function loadPlaywright() {
  try {
    const mod = await import('playwright');
    return mod.chromium;
  } catch {
    throw new Error('Provider whisk can playwright. Chay: npm install playwright && npx playwright install chromium');
  }
}

/** Mo trinh duyet de ban dang nhap Google mot lan; phien duoc luu lai. */
export async function whiskLogin(cfg) {
  const chromium = await loadPlaywright();
  const profileDir = path.resolve(cfg.profileDir);
  ensureDir(profileDir);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(cfg.url, { waitUntil: 'domcontentloaded' });
  log.info('Dang nhap Google trong cua so vua mo, mo duoc Whisk roi thi dong cua so lai.');
  await context.waitForEvent('close', { timeout: 0 });
  log.ok(`Da luu phien dang nhap vao ${profileDir}`);
}

export function createWhisk(cfg) {
  let context;
  let page;
  let selectors;
  const seen = new Set();

  async function ensureBrowser() {
    if (page) return page;
    const chromium = await loadPlaywright();
    const profileDir = path.resolve(cfg.profileDir);
    if (!fs.existsSync(profileDir)) {
      throw new Error(`Chua co phien dang nhap Whisk. Chay truoc: autostory whisk-login`);
    }
    selectors = loadSelectors(cfg.selectorsFile);
    context = await chromium.launchPersistentContext(profileDir, {
      headless: cfg.headless,
      viewport: { width: 1440, height: 900 },
    });
    page = context.pages()[0] || (await context.newPage());
    page.setDefaultTimeout(cfg.timeoutMs);
    await page.goto(cfg.url, { waitUntil: 'domcontentloaded' });
    // Ghi nho cac anh co san truoc khi sinh, de phan biet anh moi.
    for (const src of await currentSources()) seen.add(src);
    return page;
  }

  async function currentSources() {
    const out = [];
    for (const selector of selectors.resultImage) {
      const srcs = await page
        .locator(selector)
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('src')).filter(Boolean))
        .catch(() => []);
      out.push(...srcs);
    }
    return out;
  }

  async function waitForNewImage(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const src of await currentSources()) {
        if (!seen.has(src)) return src;
      }
      await sleep(1000);
    }
    throw new Error('Whisk khong tra ve anh moi trong thoi gian cho (WHISK_TIMEOUT_MS).');
  }

  async function download(src, outFile) {
    let buf;
    if (src.startsWith('data:')) {
      buf = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
    } else {
      // Tai qua chinh phien trinh duyet -> giu cookie, tranh bi 403.
      const encoded = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const blob = await res.arrayBuffer();
        return btoa(String.fromCharCode(...new Uint8Array(blob)));
      }, src);
      buf = Buffer.from(encoded, 'base64');
    }
    ensureDir(path.dirname(outFile));
    fs.writeFileSync(outFile, buf);
    return buf.length;
  }

  return {
    name: 'whisk',
    ext: 'png',

    async generate({ prompt, outFile }) {
      await ensureBrowser();
      const input = await firstVisible(page, selectors.promptInput);
      await input.click();
      // Xoa prompt cu roi nhap prompt moi.
      await page.keyboard.press('Control+A').catch(() => {});
      await input.fill('').catch(() => {});
      await input.type(prompt, { delay: 5 });

      try {
        const submit = await firstVisible(page, selectors.submitButton, 4000);
        await submit.click();
      } catch {
        // Nhieu phien ban Whisk gui prompt bang Enter thay vi nut rieng.
        await page.keyboard.press('Enter');
      }

      const src = await waitForNewImage(cfg.timeoutMs);
      seen.add(src);
      const bytes = await download(src, outFile);
      return { file: outFile, bytes };
    },

    async close() {
      if (context) await context.close().catch(() => {});
      context = undefined;
      page = undefined;
    },
  };
}
