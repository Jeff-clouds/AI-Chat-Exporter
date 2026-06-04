#!/usr/bin/env node
/**
 * Lightweight selector audit against the current platform DOM.
 *
 * This does not run the extension. It only opens known conversation URLs in a
 * Chrome CDP session, counts configured selectors, and writes a report.
 *
 * Prerequisite:
 *   Chrome must be running with --remote-debugging-port=9222.
 */

import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORTER_DIR = join(__dirname, '..');
const WORKSPACE_DIR = join(EXPORTER_DIR, '..');
const OUTLINE_DIR = join(WORKSPACE_DIR, 'AI-Chat-Outline');
const REPORT_DIR = join(EXPORTER_DIR, 'scripts', 'reports');

const CDP_URL = process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';
const PAGE_TIMEOUT_MS = Number(process.env.SELECTOR_AUDIT_PAGE_TIMEOUT_MS || 25_000);
const RENDER_WAIT_MS = Number(process.env.SELECTOR_AUDIT_RENDER_WAIT_MS || 4_000);

// Load test URLs from test-urls.json (single source of truth)
const TEST_URLS_PATH = join(__dirname, 'test-urls.json');
const testUrlsData = JSON.parse(readFileSync(TEST_URLS_PATH, 'utf8'));
const OUTLINE_KEY_MAP = { deepseek: 'DEEPSEEK', yuanbao: 'YUANBAO', chatgpt: 'CHATGPT', doubao: 'DOUBAO', gemini: 'GEMINI', grok: 'GROK', kimi: 'KIMI' };
const TARGETS = Object.entries(testUrlsData.platforms).map(([key, info]) => ({
  key,
  outlineKey: OUTLINE_KEY_MAP[key] || key.toUpperCase(),
  name: info.name,
  url: info.url,
}));

const LOGIN_INDICATORS = [
  '登录',
  'login',
  'signin',
  'sign in',
  'Log in',
  'Sign in',
  '请输入手机号',
  '请输入密码',
  '扫码登录',
];

function parseExporterSelectors() {
  const selectorsPath = join(EXPORTER_DIR, 'src', 'config', 'selectors.js');
  const content = readFileSync(selectorsPath, 'utf8');
  const selectorsByPlatform = {};

  for (const target of TARGETS) {
    const start = content.indexOf(`const ${target.key}Config`);
    if (start < 0) {
      selectorsByPlatform[target.key] = {};
      continue;
    }

    const next = content.indexOf('\nconst ', start + 1);
    const block = content.slice(start, next > -1 ? next : content.length);
    selectorsByPlatform[target.key] = parseSelectorLiterals(block);
  }

  return selectorsByPlatform;
}

function parseSelectorLiterals(source) {
  const selectors = {};
  const pattern =
    /(conversation|title|turn|question|answer|thinking|search|markdownBlock|codeBlock|codeLanguage):\s*(null|'(?:\\'|[^'])*'|"(?:\\"|[^"])*")/g;
  let match;

  while ((match = pattern.exec(source))) {
    selectors[match[1]] = match[2] === 'null' ? null : decodeStringLiteral(match[2]);
  }

  return selectors;
}

function decodeStringLiteral(raw) {
  try {
    return Function(`"use strict"; return (${raw});`)();
  } catch {
    return raw.slice(1, -1);
  }
}

function parseOutlineSelectors() {
  const selectorsPath = join(OUTLINE_DIR, 'src', 'config', 'selectors.json');
  const content = JSON.parse(readFileSync(selectorsPath, 'utf8'));
  const selectorsByPlatform = {};

  for (const target of TARGETS) {
    selectorsByPlatform[target.key] =
      content.platforms?.[target.outlineKey]?.selectors || {};
  }

  return selectorsByPlatform;
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
  return page.evaluate((input) => {
    const output = {};

    for (const [name, selector] of Object.entries(input)) {
      try {
        const parts = selector
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);

        output[name] = {
          selector,
          count: parts.reduce(
            (sum, part) => sum + document.querySelectorAll(part).length,
            0,
          ),
        };
      } catch (error) {
        output[name] = {
          selector,
          count: -1,
          error: error.message,
        };
      }
    }

    return output;
  }, normalized);
}

async function getPageState(page) {
  return page.evaluate((loginIndicators) => {
    const text = document.body?.innerText || '';
    const compactText = text.replace(/\s+/g, ' ').trim();
    const lowerText = compactText.toLowerCase();
    const needsLogin = loginIndicators.some((indicator) =>
      lowerText.includes(indicator.toLowerCase()),
    );

    return {
      title: document.title,
      url: location.href,
      textLength: text.length,
      sample: compactText.slice(0, 220),
      needsLogin,
      headings: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
      bodyChildren: document.body?.children.length || 0,
    };
  }, LOGIN_INDICATORS);
}

function summarizeCounts(counts) {
  const values = Object.values(counts);
  const checked = values.length;
  const matched = values.filter((item) => item.count > 0).length;
  const failed = values.filter((item) => item.count === 0).length;
  const invalid = values.filter((item) => item.count < 0).length;
  return { checked, matched, failed, invalid };
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

async function auditTarget(context, target, exporterSelectors, outlineSelectors) {
  const page = await context.newPage();
  const result = {
    key: target.key,
    name: target.name,
    targetUrl: target.url,
    status: 'PENDING',
  };

  try {
    await page.goto(target.url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    });
    await page.waitForTimeout(RENDER_WAIT_MS);

    result.page = await getPageState(page);
    result.exporter = await countSelectors(page, exporterSelectors[target.key]);
    result.outline = await countSelectors(page, outlineSelectors[target.key]);
    result.summary = {
      exporter: summarizeCounts(result.exporter),
      outline: summarizeCounts(result.outline),
    };
    result.status = result.page.needsLogin ? 'SKIP_LOGIN' : 'CHECKED';
  } catch (error) {
    result.status = 'ERROR';
    result.error = error.message;
  } finally {
    await page.close().catch(() => {});
  }

  return result;
}

async function main() {
  const exporterSelectors = parseExporterSelectors();
  const outlineSelectors = parseOutlineSelectors();
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0] || (await browser.newContext());
  const report = {
    timestamp: new Date().toISOString(),
    cdpUrl: CDP_URL,
    targets: [],
  };

  for (const target of TARGETS) {
    console.log(`Checking ${target.name}: ${target.url}`);
    const result = await auditTarget(
      context,
      target,
      exporterSelectors,
      outlineSelectors,
    );
    report.targets.push(result);

    const exporter = result.summary?.exporter;
    const outline = result.summary?.outline;
    const suffix =
      exporter && outline
        ? ` exporter ${exporter.matched}/${exporter.checked}, outline ${outline.matched}/${outline.checked}`
        : result.error || '';
    console.log(`  ${result.status}${suffix ? ` - ${suffix}` : ''}`);
  }

  await browser.close().catch(() => {});
  const paths = writeReport(report);
  console.log(`Report: ${paths.reportPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
