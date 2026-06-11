#!/usr/bin/env node
/**
 * Probe existing platform conversations for optional selector samples.
 *
 * This script is intentionally read-only with respect to the AI platforms:
 * it navigates and clicks existing history items, but does not type or send.
 */

import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = join(__dirname, 'reports');

const WAIT_MS = Number(process.env.PROBE_SAMPLE_WAIT_MS || 5000);
const MAX_CANDIDATES = Number(process.env.PROBE_SAMPLE_MAX_CANDIDATES || 18);

const TARGETS = [
  {
    key: 'deepseek',
    url: 'https://chat.deepseek.com/a/chat/s/c731cccb-0f0d-4993-9332-3e86299d81db',
    candidateKeywords: [
      'python',
      '代码',
      '脚本',
      'api',
      '插件',
      '开发',
      '示例',
      '搜索',
      '联网',
      '资料',
    ],
    selectors: {
      search: '.a6d716f5.db5991dd',
      codeBlock: '.md-code-block',
      codeLanguage: '.md-code-block-infostring',
    },
  },
  {
    key: 'yuanbao',
    url: 'https://yuanbao.tencent.com/chat/naQivTmsDa/105fec2b-3cf5-4382-92d7-e09e60da4b7b',
    candidateKeywords: [
      'python',
      '代码',
      '脚本',
      'api',
      '插件',
      'openclaw',
      'mcp',
      '配置',
      '同步',
      '向量',
    ],
    selectors: {
      codeBlock: '.hyc-common-markdown__code pre.hyc-common-markdown__code-lan',
      codeLanguage: '.hyc-common-markdown__code__hd__l',
    },
  },
];

function runAppleScript(script) {
  const args = script
    .split('\n')
    .flatMap(line => ['-e', line]);
  return execFileSync('osascript', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
}

function executeChromeJs(source) {
  const script = `tell application "Google Chrome" to execute active tab of front window javascript ${JSON.stringify(source)}`;
  return runAppleScript(script);
}

function openInActiveTab(url) {
  const script = [
    'tell application "Google Chrome"',
    'activate',
    `set URL of active tab of front window to ${JSON.stringify(url)}`,
    'end tell',
  ].join('\n');
  runAppleScript(script);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return { ...fallback, parseError: error.message, raw: String(raw).slice(0, 500) };
  }
}

function candidateJs(target) {
  return `
(() => {
  const keywords = ${JSON.stringify(target.candidateKeywords)};
  const seen = new Set();
  const candidates = [];

  function textOf(el) {
    return (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
  }

  function cssPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      if (node.id) part += '#' + CSS.escape(node.id);
      const className = typeof node.className === 'string'
        ? node.className.trim().split(/\\s+/).filter(Boolean).slice(0, 3).map(CSS.escape).join('.')
        : '';
      if (className) part += '.' + className;
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(child => child.tagName === node.tagName);
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  }

  for (const el of document.querySelectorAll('a[href], button, [role="button"], [class*="history" i], [class*="nav" i], [class*="chat" i], [class*="conversation" i]')) {
    const text = textOf(el);
    if (!text || text.length < 2 || text.length > 180) continue;
    const lower = text.toLowerCase();
    if (!keywords.some(keyword => lower.includes(keyword.toLowerCase()))) continue;
    const href = el.href || el.closest('a[href]')?.href || null;
    const selector = cssPath(el);
    const key = href || selector + '::' + text;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      text,
      href,
      selector,
      tag: el.tagName.toLowerCase(),
      className: typeof el.className === 'string' ? el.className : '',
    });
  }

  return JSON.stringify({
    title: document.title,
    url: location.href,
    bodyTextLength: document.body?.innerText?.length || 0,
    candidates: candidates.slice(0, ${MAX_CANDIDATES}),
  });
})()
`;
}

function auditJs(target) {
  return `
(() => {
  const selectors = ${JSON.stringify(target.selectors)};

  function sample(selector, limit = 3) {
    try {
      return Array.from(document.querySelectorAll(selector)).slice(0, limit).map(el => ({
        tag: el.tagName.toLowerCase(),
        className: typeof el.className === 'string' ? el.className : '',
        text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 220),
      }));
    } catch (error) {
      return [{ error: error.message }];
    }
  }

  const counts = {};
  for (const [name, selector] of Object.entries(selectors)) {
    try {
      counts[name] = {
        selector,
        elements: document.querySelectorAll(selector).length,
        samples: sample(selector),
      };
    } catch (error) {
      counts[name] = { selector, elements: -1, error: error.message, samples: [] };
    }
  }

  return JSON.stringify({
    title: document.title,
    url: location.href,
    bodyTextLength: document.body?.innerText?.length || 0,
    bodySample: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 260),
    counts,
  });
})()
`;
}

function clickCandidateJs(candidate) {
  return `
(() => {
  const selector = ${JSON.stringify(candidate.selector)};
  const href = ${JSON.stringify(candidate.href)};
  const expectedText = ${JSON.stringify(candidate.text)};
  let el = null;
  if (href) {
    el = Array.from(document.querySelectorAll('a[href]')).find(a => a.href === href);
  }
  if (!el && selector) {
    try { el = document.querySelector(selector); } catch {}
  }
  if (!el) {
    el = Array.from(document.querySelectorAll('a[href], button, [role="button"], [class*="chat" i], [class*="conversation" i]'))
      .find(node => ((node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim() === expectedText));
  }
  if (!el) return JSON.stringify({ clicked: false, reason: 'candidate not found' });
  el.scrollIntoView({ block: 'center' });
  el.click();
  return JSON.stringify({ clicked: true, text: expectedText, href, selector });
})()
`;
}

function isComplete(target, audit) {
  return Object.keys(target.selectors).every(key => (audit.counts?.[key]?.elements || 0) > 0);
}

async function probeTarget(target) {
  openInActiveTab(target.url);
  await sleep(WAIT_MS);

  const initialAudit = parseJson(executeChromeJs(auditJs(target)), { stage: 'initialAudit' });
  const candidateResult = parseJson(executeChromeJs(candidateJs(target)), { stage: 'candidates' });
  const attempts = [];

  if (isComplete(target, initialAudit)) {
    return { target: target.key, initialAudit, candidateResult, attempts, result: 'VERIFIED_OK_INITIAL' };
  }

  for (const candidate of candidateResult.candidates || []) {
    openInActiveTab(target.url);
    await sleep(Math.max(1200, Math.floor(WAIT_MS / 2)));
    const clickResult = parseJson(executeChromeJs(clickCandidateJs(candidate)), { stage: 'click', candidate });
    await sleep(WAIT_MS);
    const audit = parseJson(executeChromeJs(auditJs(target)), { stage: 'candidateAudit', candidate });
    attempts.push({ candidate, clickResult, audit });
    if (isComplete(target, audit)) {
      return { target: target.key, initialAudit, candidateResult, attempts, result: 'VERIFIED_OK_CANDIDATE' };
    }
  }

  return { target: target.key, initialAudit, candidateResult, attempts, result: 'STILL_INSUFFICIENT' };
}

const report = {
  timestamp: new Date().toISOString(),
  scope: 'Probe existing platform conversations for optional DOM selector samples; no messages sent',
  targets: [],
};

for (const target of TARGETS) {
  try {
    report.targets.push(await probeTarget(target));
  } catch (error) {
    report.targets.push({
      target: target.key,
      result: 'BLOCKED',
      error: error.message,
      stack: error.stack,
    });
  }
}

mkdirSync(REPORT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = join(REPORT_DIR, `sufficient-sample-probe-${stamp}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));
writeFileSync(join(REPORT_DIR, 'sufficient-sample-probe-latest.json'), JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  reportPath,
  summary: report.targets.map(target => ({
    target: target.target,
    result: target.result,
    candidateCount: target.candidateResult?.candidates?.length || 0,
    attempts: target.attempts?.length || 0,
    initialCounts: target.initialAudit?.counts,
    bestCounts: target.attempts?.map(attempt => attempt.audit?.counts).find(Boolean) || null,
  })),
}, null, 2));
