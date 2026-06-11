#!/usr/bin/env node
/**
 * DOM selector audit using the user's current Chrome profile.
 *
 * Unlike the CDP audit, this preserves the active Chrome profile and login
 * state by using Chrome Apple Events. It requires Chrome's
 * "Allow JavaScript from Apple Events" setting.
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORTER_DIR = resolve(__dirname, '..');
const WORKSPACE_DIR = resolve(EXPORTER_DIR, '..');
const OUTLINE_DIR = join(WORKSPACE_DIR, 'AI-Chat-Outline');
const REPORT_DIR = join(EXPORTER_DIR, 'scripts', 'reports');

const NAVIGATION_WAIT_MS = Number(process.env.CHROME_PROFILE_AUDIT_WAIT_MS || 7000);
const NAVIGATION_RETRIES = Number(process.env.CHROME_PROFILE_AUDIT_RETRIES || 2);

// Load test URLs from test-urls.json (single source of truth)
const TEST_URLS_PATH = join(__dirname, 'test-urls.json');
const testUrlsData = JSON.parse(readFileSync(TEST_URLS_PATH, 'utf8'));
const OUTLINE_KEY_MAP = { deepseek: 'DEEPSEEK', yuanbao: 'YUANBAO', chatgpt: 'CHATGPT', doubao: 'DOUBAO', gemini: 'GEMINI', grok: 'GROK', kimi: 'KIMI' };
const requestedTargets = new Set(
  (process.env.DOM_AUDIT_TARGETS || process.env.CHROME_PROFILE_AUDIT_TARGETS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
);
const TARGETS = Object.entries(testUrlsData.platforms).map(([key, info]) => ({
  key,
  outlineKey: OUTLINE_KEY_MAP[key] || key.toUpperCase(),
  name: info.name,
  url: info.url,
})).filter(target => requestedTargets.size === 0 || requestedTargets.has(target.key));

if (requestedTargets.size > 0 && TARGETS.length === 0) {
  throw new Error(`No matching DOM audit targets: ${Array.from(requestedTargets).join(', ')}`);
}

const LOGIN_INDICATORS = [
  '登录',
  '扫码登录',
  '请输入手机号',
  'login',
  'log in',
  'sign in',
  'signin',
];

const SECURITY_CHALLENGE_INDICATORS = [
  '正在进行安全验证',
  'security verification',
  'checking if the site connection is secure',
  'cloudflare',
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
    result[target.key] = parseSelectorLiterals(block);
  }

  return result;
}

function parseSelectorLiterals(source) {
  const selectors = {};
  const re = /(conversation|title|turn|question|answer|thinking|search|markdownBlock|codeBlock|codeLanguage):\s*(null|'(?:\\'|[^'])*'|"(?:\\"|[^"])*")/g;
  let match;

  while ((match = re.exec(source)) !== null) {
    const raw = match[2];
    selectors[match[1]] = raw === 'null' ? null : decodeStringLiteral(raw);
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

function runAppleScript(script) {
  return execFileSync('osascript', ['-e', script], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
}

function executeChromeJs(source) {
  const script = `tell application "Google Chrome" to execute active tab of front window javascript ${JSON.stringify(source)}`;
  return runAppleScript(script);
}

function openInActiveTab(url) {
  const script = `tell application "Google Chrome" to set URL of active tab of front window to ${JSON.stringify(url)}`;
  try {
    runAppleScript(script);
  } catch {
    executeChromeJs(`location.href = ${JSON.stringify(url)}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function urlsMatch(actual, expected) {
  try {
    const actualUrl = new URL(actual);
    const expectedUrl = new URL(expected);
    const normalizePath = value => value.replace(/\/+$/, '') || '/';
    return actualUrl.hostname === expectedUrl.hostname
      && normalizePath(actualUrl.pathname) === normalizePath(expectedUrl.pathname);
  } catch {
    return false;
  }
}

async function waitForTargetUrl(targetUrl) {
  const intervalMs = 1000;
  const attempts = Math.max(1, Math.ceil(NAVIGATION_WAIT_MS / intervalMs));
  let lastUrl = '';

  for (let index = 0; index < attempts; index += 1) {
    await sleep(intervalMs);
    try {
      lastUrl = executeChromeJs('location.href');
      if (urlsMatch(lastUrl, targetUrl)) {
        await sleep(Math.max(0, NAVIGATION_WAIT_MS - ((index + 1) * intervalMs)));
        return { matched: true, lastUrl };
      }
    } catch (error) {
      lastUrl = `ERROR: ${error.message}`;
    }
  }

  return { matched: false, lastUrl };
}

function auditJs(input) {
  return `
(() => {
  const input = ${JSON.stringify(input)};
  const loginIndicators = ${JSON.stringify(LOGIN_INDICATORS)};
  const securityChallengeIndicators = ${JSON.stringify(SECURITY_CHALLENGE_INDICATORS)};

  function normalizeSelectorSet(selectors) {
    const normalized = {};
    for (const [name, selector] of Object.entries(selectors || {})) {
      if (Array.isArray(selector)) {
        normalized[name] = selector.join(', ');
      } else if (typeof selector === 'string' && selector.trim()) {
        normalized[name] = selector;
      }
    }
    return normalized;
  }

  function countSelectors(selectors) {
    const normalized = normalizeSelectorSet(selectors);
    const results = {};
    for (const [name, selector] of Object.entries(normalized)) {
      const parts = selector.split(',').map(part => part.trim()).filter(Boolean);
      let elements = 0;
      let valid = true;
      const partCounts = [];
      for (const part of parts) {
        try {
          const count = document.querySelectorAll(part).length;
          elements += count;
          partCounts.push({ selector: part, elements: count });
        } catch (error) {
          valid = false;
          partCounts.push({ selector: part, elements: -1, error: error.message });
        }
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

  function getPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      if (node.id) part += '#' + node.id;
      const className = typeof node.className === 'string'
        ? node.className.trim().split(/\\s+/).slice(0, 4).join('.')
        : '';
      if (className) part += '.' + className;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function sample(selector, limit = 6) {
    try {
      return Array.from(document.querySelectorAll(selector)).slice(0, limit).map(el => ({
        tag: el.tagName.toLowerCase(),
        path: getPath(el),
        className: typeof el.className === 'string' ? el.className : '',
        dataTestId: el.getAttribute('data-testid'),
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 180),
      }));
    } catch (error) {
      return [{ error: error.message }];
    }
  }

  const bodyText = document.body?.innerText || '';
  const compactText = bodyText.replace(/\\s+/g, ' ').trim();
  const lowerText = compactText.toLowerCase();
  const needsLogin = loginIndicators.some(indicator =>
    lowerText.includes(indicator.toLowerCase())
  );
  const securityChallenge = securityChallengeIndicators.some(indicator =>
    lowerText.includes(indicator.toLowerCase())
  );

  const interestingSelectors = [
    '[data-testid]',
    '[data-turn]',
    '[data-message-author-role]',
    '[role]',
    'article',
    'message-content',
    'user-query',
    'model-response',
    '.markdown',
    '.markdown-main-panel',
    '.ds-markdown',
    '.hyc-common-markdown',
    '[class*="message" i]',
    '[class*="chat" i]',
    '[class*="bubble" i]',
    '[class*="assistant" i]',
    '[class*="user" i]',
    '[class*="markdown" i]',
    '[class*="conversation" i]',
    '[class*="think" i]',
  ];

  return JSON.stringify({
    page: {
      title: document.title,
      url: location.href,
      bodyTextLength: bodyText.length,
      bodySample: compactText.slice(0, 300),
      needsLogin,
      securityChallenge,
      headingCount: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
    },
    exporter: countSelectors(input.exporterSelectors),
    outline: countSelectors(input.outlineSelectors),
    samples: Object.fromEntries(interestingSelectors.map(sel => [sel, sample(sel)])),
  });
})()
`;
}

function writeReport(report) {
  mkdirSync(REPORT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(REPORT_DIR, `current-chrome-profile-dom-${timestamp}.json`);
  const latestPath = join(REPORT_DIR, 'current-chrome-profile-dom-latest.json');

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  writeFileSync(latestPath, JSON.stringify(report, null, 2));

  return { reportPath, latestPath };
}

async function auditTarget(target, exporterSelectors, outlineSelectors) {
  const startedAt = Date.now();
  console.log(`Auditing ${target.name}: ${target.url}`);

  try {
    let navigation = { matched: false, lastUrl: '' };
    for (let attempt = 0; attempt < NAVIGATION_RETRIES && !navigation.matched; attempt += 1) {
      openInActiveTab(target.url);
      navigation = await waitForTargetUrl(target.url);
    }

    if (!navigation.matched) {
      console.log(`  ${target.name}: NAVIGATION_MISMATCH ${navigation.lastUrl}`);
      return {
        key: target.key,
        name: target.name,
        targetUrl: target.url,
        elapsedMs: Date.now() - startedAt,
        overall: 'NAVIGATION_MISMATCH',
        error: `Expected ${target.url}, got ${navigation.lastUrl}`,
      };
    }

    const raw = executeChromeJs(auditJs({
      exporterSelectors: exporterSelectors[target.key],
      outlineSelectors: outlineSelectors[target.key],
    }));
    const parsed = JSON.parse(raw);
    const status = parsed.page.securityChallenge
      ? 'SKIP_SECURITY'
      : parsed.page.needsLogin
        ? 'SKIP_LOGIN'
        : 'AUDITED';
    console.log(`  ${target.name}: ${status}`);
    return {
      key: target.key,
      name: target.name,
      targetUrl: target.url,
      elapsedMs: Date.now() - startedAt,
      overall: status,
      ...parsed,
    };
  } catch (error) {
    console.log(`  ${target.name}: ERROR ${error.message}`);
    return {
      key: target.key,
      name: target.name,
      targetUrl: target.url,
      elapsedMs: Date.now() - startedAt,
      overall: 'ERROR',
      error: error.message,
    };
  }
}

async function main() {
  const exporterSelectors = parseExporterSelectors();
  const outlineSelectors = parseOutlineSelectors();
  const platforms = [];

  for (const target of TARGETS) {
    platforms.push(await auditTarget(target, exporterSelectors, outlineSelectors));
  }

  const report = {
    timestamp: new Date().toISOString(),
    scope: 'DOM selector audit via current Chrome profile and Apple Events; extension runtime was not tested',
    platforms,
    summary: platforms.map(platform => `${platform.name}: ${platform.overall}`),
  };

  const paths = writeReport(report);
  console.log(`Report: ${paths.reportPath}`);
  console.log(`Latest: ${paths.latestPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
