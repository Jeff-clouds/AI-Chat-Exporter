#!/usr/bin/env node
/**
 * Lightweight DOM selector audit for AI-Chat-Exporter and AI-Chat-Outline.
 *
 * Scope:
 * - Connect to an already-running Chrome CDP endpoint.
 * - Open fixed real conversation URLs one by one.
 * - Count configured selectors against the current DOM.
 * - Write a JSON report.
 *
 * This does not run the browser extensions end-to-end.
 */

import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORTER_DIR = resolve(__dirname, '..');
const WORKSPACE_DIR = resolve(EXPORTER_DIR, '..');
const OUTLINE_DIR = join(WORKSPACE_DIR, 'AI-Chat-Outline');
const REPORT_DIR = join(EXPORTER_DIR, 'scripts', 'reports');

const CDP_ENDPOINT = process.env.CHROME_CDP_ENDPOINT || 'http://127.0.0.1:9222';

const TARGETS = [
  {
    key: 'grok',
    outlineKey: 'GROK',
    name: 'Grok',
    url: 'https://grok.com/c/7bb32de1-a9f4-4ba0-99b9-f4760eca1335?rid=b681c7a6-8574-494a-a2ff-978622800359',
  },
  {
    key: 'yuanbao',
    outlineKey: 'YUANBAO',
    name: 'YuanBao',
    url: 'https://yuanbao.tencent.com/chat/naQivTmsDa/105fec2b-3cf5-4382-92d7-e09e60da4b7b',
  },
  {
    key: 'chatgpt',
    outlineKey: 'CHATGPT',
    name: 'ChatGPT',
    url: 'https://chatgpt.com/c/69393a71-a410-8329-b70a-c1bab3d8b2fd',
  },
  {
    key: 'doubao',
    outlineKey: 'DOUBAO',
    name: 'Doubao',
    url: 'https://www.doubao.com/chat/38425731801360898',
  },
  {
    key: 'gemini',
    outlineKey: 'GEMINI',
    name: 'Gemini',
    url: 'https://gemini.google.com/app/404aea77190bc75f',
  },
  {
    key: 'kimi',
    outlineKey: 'KIMI',
    name: 'Kimi',
    url: 'https://www.kimi.com/chat/19d04d17-fca2-8505-8000-09c908509e39?chat_enter_method=history',
  },
  {
    key: 'deepseek',
    outlineKey: 'DEEPSEEK',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com/a/chat/s/c731cccb-0f0d-4993-9332-3e86299d81db',
  },
];

const LOGIN_INDICATORS = [
  '登录',
  '扫码登录',
  '请输入手机号',
  'login',
  'log in',
  'sign in',
  'signin',
];

function parseExporterSelectors() {
  const selectorsPath = join(EXPORTER_DIR, 'src', 'config', 'selectors.js');
  const content = readFileSync(selectorsPath, 'utf8');
  const result = {};

  for (const target of TARGETS) {
    const start = content.indexOf(`const ${target.key}Config`);
    if (start === -1) continue;

    const next = content.indexOf('\nconst ', start + 1);
    const block = content.slice(start, next === -1 ? content.length : next);
    const selectors = {};
    const re = /(conversation|title|turn|question|answer|thinking|search|markdownBlock|codeBlock|codeLanguage):\s*(null|'(?:\\'|[^'])*'|"(?:\\"|[^"])*")/g;
    let match;

    while ((match = re.exec(block)) !== null) {
      const raw = match[2];
      selectors[match[1]] = raw === 'null' ? null : raw.slice(1, -1);
    }

    result[target.key] = selectors;
  }

  return result;
}

function parseOutlineSelectors() {
  const jsonPath = join(OUTLINE_DIR, 'src', 'config', 'selectors.json');
  if (!existsSync(jsonPath)) return {};

  const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const platforms = parsed.platforms || {};
  const result = {};

  for (const target of TARGETS) {
    result[target.key] = platforms[target.outlineKey]?.selectors || {};
  }

  return result;
}

function normalizeSelectorSet(selectors) {
  const normalized = {};

  for (const [name, selector] of Object.entries(selectors || {})) {
    if (Array.isArray(selector)) {
      normalized[name] = selector.join(', ');
      continue;
    }

    if (typeof selector === 'string' && selector.trim()) {
      normalized[name] = selector;
    }
  }

  return normalized;
}

async function countSelectors(page, selectors) {
  const normalized = normalizeSelectorSet(selectors);
  const results = {};

  for (const [name, selector] of Object.entries(normalized)) {
    const parts = selector.split(',').map((part) => part.trim()).filter(Boolean);
    let elements = 0;
    let valid = true;
    const partCounts = [];

    for (const part of parts) {
      const count = await page.evaluate((sel) => {
        try {
          return document.querySelectorAll(sel).length;
        } catch {
          return -1;
        }
      }, part);

      if (count < 0) {
        valid = false;
      } else {
        elements += count;
      }

      partCounts.push({ selector: part, elements: count });
    }

    results[name] = {
      selector,
      valid,
      elements,
      partCounts,
      status: !valid ? 'ERROR' : elements > 0 ? 'PASS' : 'MISS',
    };
  }

  return results;
}

async function auditTarget(context, target, exporterSelectors, outlineSelectors) {
  const page = await context.newPage();
  const startedAt = Date.now();

  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    const pageInfo = await page.evaluate((loginIndicators) => {
      const bodyText = document.body?.innerText || '';
      const normalized = bodyText.toLowerCase();
      const needsLogin = loginIndicators.some((indicator) => normalized.includes(indicator.toLowerCase()));

      return {
        title: document.title,
        url: location.href,
        bodyTextLength: bodyText.length,
        bodySample: bodyText.replace(/\s+/g, ' ').slice(0, 240),
        needsLogin,
        headingCount: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
      };
    }, LOGIN_INDICATORS);

    const exporter = await countSelectors(page, exporterSelectors[target.key]);
    const outline = await countSelectors(page, outlineSelectors[target.key]);

    return {
      key: target.key,
      name: target.name,
      targetUrl: target.url,
      elapsedMs: Date.now() - startedAt,
      page: pageInfo,
      exporter,
      outline,
      overall: pageInfo.needsLogin ? 'SKIP_LOGIN' : 'AUDITED',
    };
  } catch (error) {
    return {
      key: target.key,
      name: target.name,
      targetUrl: target.url,
      elapsedMs: Date.now() - startedAt,
      overall: 'ERROR',
      error: error.message,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function summarizePlatform(report) {
  if (report.overall !== 'AUDITED') return `${report.name}: ${report.overall}`;

  const exporterMisses = Object.entries(report.exporter || {})
    .filter(([, result]) => result.status !== 'PASS')
    .map(([name]) => `exporter.${name}`);
  const outlineMisses = Object.entries(report.outline || {})
    .filter(([, result]) => result.status !== 'PASS')
    .map(([name]) => `outline.${name}`);
  const misses = exporterMisses.concat(outlineMisses);

  return misses.length === 0
    ? `${report.name}: PASS`
    : `${report.name}: ${misses.length} miss/error (${misses.join(', ')})`;
}

function writeReport(report) {
  mkdirSync(REPORT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(REPORT_DIR, `current-dom-selectors-${timestamp}.json`);
  const latestPath = join(REPORT_DIR, 'current-dom-selectors-latest.json');

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  writeFileSync(latestPath, JSON.stringify(report, null, 2));

  return { reportPath, latestPath };
}

async function main() {
  const exporterSelectors = parseExporterSelectors();
  const outlineSelectors = parseOutlineSelectors();

  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const context = browser.contexts()[0] || await browser.newContext();
  const platforms = [];

  for (const target of TARGETS) {
    console.log(`Auditing ${target.name}: ${target.url}`);
    const result = await auditTarget(context, target, exporterSelectors, outlineSelectors);
    platforms.push(result);
    console.log(`  ${summarizePlatform(result)}`);
  }

  await browser.close();

  const report = {
    timestamp: new Date().toISOString(),
    cdpEndpoint: CDP_ENDPOINT,
    scope: 'DOM selector audit only; extension runtime was not tested',
    platforms,
    summary: platforms.map(summarizePlatform),
  };

  const paths = writeReport(report);
  console.log(`Report: ${paths.reportPath}`);
  console.log(`Latest: ${paths.latestPath}`);

  const hasHardError = platforms.some((platform) => platform.overall === 'ERROR');
  process.exit(hasHardError ? 2 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
