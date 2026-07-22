import puppeteer from 'puppeteer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import pool from '../db.js';

const APP_URL = process.env.APP_URL || 'https://sigotuhuella.com.ar';
const OUTPUT_DIR = path.join(process.env.PUBLIC_DIR || 'public', 'generated', 'screenshots');

const VIEWPORT = { width: 375, height: 812, isMobile: true, hasTouch: true };
const MOCKUP_W = 399;
const MOCKUP_H = 864;
const SCREEN_W = 375;
const SCREEN_H = 812;
const SCREEN_X = (MOCKUP_W - SCREEN_W) / 2;
const SCREEN_Y = 26;
const BORDER_R = 40;
const FRAME_COLOR = '#1a1a1a';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const PAGES = [
  { label: 'home', path: '/', auth: false },
  { label: 'lost-pets', path: '/perdidos', auth: false },
  { label: 'report-lost', path: '/perdi-mi-mascota', auth: false },
  { label: 'quick-report', path: '/reportar-rapido', auth: false },
  { label: 'pet-detail', path: null, auth: false, dynamic: true, query: "SELECT id FROM pets WHERE status IN ('lost','retenido') ORDER BY updated_at DESC LIMIT 1" },
  { label: 'adoption', path: '/adopcion', auth: false },
  { label: 'flyer', path: '/flyer', auth: false },
  { label: 'diffusion', path: '/difusion', auth: false },
  { label: 'qr-profile', path: null, auth: false, dynamic: true, query: "SELECT share_token FROM pets WHERE share_token IS NOT NULL ORDER BY updated_at DESC LIMIT 1" },
  { label: 'dashboard', path: '/dashboard', auth: true },
  { label: 'my-pets', path: '/mi-mascota', auth: true },
  { label: 'feed', path: '/feed', auth: true },
];

async function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function getTestUser() {
  const result = await pool.query("SELECT email, password_hash FROM users WHERE email = 'test@sigotuhuella.com.ar'");
  if (result.rows.length === 0) return null;

  const pwdResult = await pool.query("SELECT value FROM settings WHERE key = 'screenshot_test_password'");
  return { email: result.rows[0].email, password: pwdResult.rows[0]?.value || null };
}

async function resolveDynamicPath(pageConfig) {
  if (!pageConfig.dynamic) return pageConfig.path;
  try {
    const result = await pool.query(pageConfig.query);
    if (result.rows.length > 0 && result.rows[0]) {
      const val = Object.values(result.rows[0])[0];
      if (pageConfig.label === 'pet-detail') return `/pet/${val}`;
      if (pageConfig.label === 'qr-profile') return `/mascota/${val}`;
    }
  } catch (err) {
    console.warn(`[Screenshot] Failed to resolve dynamic path for ${pageConfig.label}:`, err.message);
  }
  return null;
}

async function applyPhoneMockup(screenshotBuffer) {
  return sharp({
    create: { width: MOCKUP_W, height: MOCKUP_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${MOCKUP_W}" height="${MOCKUP_H}">
            <rect x="0" y="0" width="${MOCKUP_W}" height="${MOCKUP_H}" rx="50" ry="50" fill="${FRAME_COLOR}" />
            <rect x="${SCREEN_X + 2}" y="${SCREEN_Y + 2}" width="${SCREEN_W - 4}" height="${SCREEN_H - 4}" rx="${BORDER_R - 2}" ry="${BORDER_R - 2}" fill="white" />
            <rect x="${SCREEN_X}" y="${SCREEN_Y}" width="${SCREEN_W}" height="${SCREEN_H}" rx="${BORDER_R}" ry="${BORDER_R}" fill="white" />
            <rect x="${(MOCKUP_W - 160) / 2}" y="12" width="160" height="6" rx="3" ry="3" fill="#333" />
            <circle cx="${MOCKUP_W - 50}" cy="15" r="5" fill="#333" />
            <rect x="${(MOCKUP_W - 36) / 2}" y="${MOCKUP_H - 14}" width="36" height="4" rx="2" ry="2" fill="#555" />
          </svg>`
        ),
        top: 0,
        left: 0,
      },
      {
        input: await sharp(screenshotBuffer)
          .resize(SCREEN_W, SCREEN_H, { fit: 'fill' })
          .sharpen()
          .toBuffer(),
        top: SCREEN_Y,
        left: SCREEN_X,
      },
    ])
    .png()
    .toBuffer();
}

async function capturePage(page, pageConfig) {
  const resolvedPath = await resolveDynamicPath(pageConfig);
  if (!resolvedPath) {
    console.log(`[Screenshot] Skipping ${pageConfig.label}: no path resolved`);
    return null;
  }

  const url = `${APP_URL}${resolvedPath}`;
  console.log(`[Screenshot] Capturing ${pageConfig.label}: ${url}`);

  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await delay(2000);

    const screenshotBuffer = await page.screenshot({ fullPage: false });
    const mockupBuffer = await applyPhoneMockup(screenshotBuffer);

    const outputPath = path.join(OUTPUT_DIR, `${pageConfig.label}.png`);
    fs.writeFileSync(outputPath, mockupBuffer);
    console.log(`[Screenshot] Saved ${pageConfig.label} (${mockupBuffer.length} bytes)`);
    return outputPath;
  } catch (err) {
    console.warn(`[Screenshot] Failed to capture ${pageConfig.label}:`, err.message);
    return null;
  }
}

export async function captureAllScreenshots() {
  const testUser = await getTestUser();
  if (!testUser || !testUser.password) {
    console.warn('[Screenshot] No test user found, skipping');
    return;
  }

  ensureOutputDir();

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    const authPages = PAGES.filter(p => p.auth);
    const publicPages = PAGES.filter(p => !p.auth);

    for (const pageConfig of publicPages) {
      await capturePage(page, pageConfig);
    }

    if (authPages.length > 0) {
      try {
        await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0', timeout: 20000 });
        await delay(1500);

        await page.type('input[type="email"]', testUser.email, { delay: 30 });
        await page.type('input[type="password"]', testUser.password, { delay: 20 });

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {}),
          page.click('button[type="submit"]'),
        ]);

    await delay(2000);
        console.log('[Screenshot] Login submitted');
      } catch (err) {
        console.warn('[Screenshot] Login failed:', err.message);
      }

      for (const pageConfig of authPages) {
        await capturePage(page, pageConfig);
      }
    }
  } finally {
    await browser.close();
  }

  console.log('[Screenshot] All captures complete');
}
