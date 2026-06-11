#!/usr/bin/env node
/**
 * Scheduled DOM audit wrapper.
 *
 * Runs the current Chrome-profile selector audit, summarizes the latest report,
 * and exits non-zero only for core selector failures, login skips, or hard errors.
 */

import { execFileSync } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORTER_DIR = resolve(__dirname, '..');
const REPORT_DIR = join(EXPORTER_DIR, 'scripts', 'reports');
const AUDIT_SCRIPT = join(EXPORTER_DIR, 'scripts', 'audit-current-chrome-profile.mjs');
const LATEST_REPORT = join(REPORT_DIR, 'current-chrome-profile-dom-latest.json');
const SUMMARY_LATEST = join(REPORT_DIR, 'dom-audit-summary-latest.json');
const RUN_LOG = join(REPORT_DIR, 'dom-audit-automation.out.log');
const ERROR_LOG = join(REPORT_DIR, 'dom-audit-automation.err.log');

const CORE_FIELDS = new Set([
  'title',
  'conversation',
  'turn',
  'question',
  'answer',
  'thinking',
  'markdownBlock',
]);

const OPTIONAL_FIELDS = new Set([
  'search',
  'codeBlock',
  'codeLanguage',
]);

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function runAudit() {
  if (process.env.DOM_AUDIT_SKIP_RUN === '1') return null;

  return execFileSync(process.execPath, [AUDIT_SCRIPT], {
    cwd: EXPORTER_DIR,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readReport() {
  const reportPath = process.env.DOM_AUDIT_REPORT_PATH || LATEST_REPORT;
  if (!existsSync(reportPath)) {
    throw new Error(`Audit report not found: ${reportPath}`);
  }

  return {
    reportPath,
    report: JSON.parse(readFileSync(reportPath, 'utf8')),
  };
}

function isBadSelectorStatus(status) {
  return status === 'MISS' || status === 'ERROR';
}

function collectSelectorIssues(platform, groupName, selectors = {}) {
  const failures = [];
  const warnings = [];

  for (const [field, result] of Object.entries(selectors)) {
    if (!result || !result.status || result.status === 'PASS') continue;

    const issue = {
      platform: platform.key,
      name: platform.name,
      group: groupName,
      field,
      selector: result.selector,
      status: result.status,
      elements: result.elements,
    };

    if (CORE_FIELDS.has(field) && isBadSelectorStatus(result.status)) {
      failures.push(issue);
    } else if (OPTIONAL_FIELDS.has(field) || isBadSelectorStatus(result.status)) {
      warnings.push(issue);
    }
  }

  return { failures, warnings };
}

function summarizePlatform(platform) {
  const failures = [];
  const warnings = [];

  if (platform.overall === 'ERROR') {
    failures.push({
      platform: platform.key,
      name: platform.name,
      reason: 'platform_error',
      message: platform.error || 'Unknown platform audit error',
    });
  } else if (platform.overall === 'NAVIGATION_MISMATCH') {
    failures.push({
      platform: platform.key,
      name: platform.name,
      reason: 'navigation_mismatch',
      message: platform.error || 'Audit did not land on the target URL',
    });
  } else if (platform.overall === 'SKIP_LOGIN') {
    failures.push({
      platform: platform.key,
      name: platform.name,
      reason: 'login_required',
      message: 'Platform audit landed on a login page',
    });
  } else if (platform.overall === 'SKIP_SECURITY') {
    warnings.push({
      platform: platform.key,
      name: platform.name,
      reason: 'security_challenge',
      message: 'Platform audit landed on a security challenge page',
    });
  }

  if (platform.overall === 'AUDITED') {
    for (const [groupName, selectors] of [
      ['exporter', platform.exporter],
      ['outline', platform.outline],
    ]) {
      const issues = collectSelectorIssues(platform, groupName, selectors);
      failures.push(...issues.failures);
      warnings.push(...issues.warnings);
    }
  }

  return {
    key: platform.key,
    name: platform.name,
    overall: platform.overall,
    url: platform.page?.url || platform.targetUrl,
    failures,
    warnings,
  };
}

function buildSummary(reportPath, report, auditOutput) {
  const platforms = (report.platforms || []).map(summarizePlatform);
  const failures = platforms.flatMap(platform => platform.failures);
  const warnings = platforms.flatMap(platform => platform.warnings);

  return {
    timestamp: new Date().toISOString(),
    status: failures.length > 0 ? 'FAIL' : 'PASS',
    policy: {
      failureMode: 'core selector failures only',
      coreFields: Array.from(CORE_FIELDS),
      optionalFields: Array.from(OPTIONAL_FIELDS),
      securityChallenge: 'warning',
    },
    sourceReport: reportPath,
    sourceTimestamp: report.timestamp,
    auditOutput: auditOutput ? auditOutput.trim().slice(-4000) : null,
    totals: {
      platforms: platforms.length,
      failures: failures.length,
      warnings: warnings.length,
    },
    platforms,
    failures,
    warnings,
  };
}

function writeSummary(summary) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const dailyPath = join(REPORT_DIR, `dom-audit-summary-${isoDate()}.json`);
  const content = JSON.stringify(summary, null, 2);

  writeFileSync(SUMMARY_LATEST, content);
  writeFileSync(dailyPath, content);

  return { latestPath: SUMMARY_LATEST, dailyPath };
}

function appendLog(path, message) {
  mkdirSync(REPORT_DIR, { recursive: true });
  appendFileSync(path, `[${new Date().toISOString()}] ${message}\n`);
}

function main() {
  let auditOutput = null;
  try {
    auditOutput = runAudit();
  } catch (error) {
    const summary = {
      timestamp: new Date().toISOString(),
      status: 'FAIL',
      policy: {
        failureMode: 'core selector failures only',
        coreFields: Array.from(CORE_FIELDS),
        optionalFields: Array.from(OPTIONAL_FIELDS),
        securityChallenge: 'warning',
      },
      sourceReport: LATEST_REPORT,
      sourceTimestamp: null,
      auditOutput: (error.stdout || '').trim().slice(-4000),
      totals: {
        platforms: 0,
        failures: 1,
        warnings: 0,
      },
      platforms: [],
      failures: [{
        reason: 'audit_command_failed',
        message: error.message,
        stderr: (error.stderr || '').trim().slice(-4000),
      }],
      warnings: [],
    };
    const paths = writeSummary(summary);
    appendLog(ERROR_LOG, `FAIL audit_command_failed ${error.message}`);
    console.error(`DOM audit scheduled run failed: ${paths.latestPath}`);
    process.exit(1);
  }

  const { reportPath, report } = readReport();
  const summary = buildSummary(reportPath, report, auditOutput);
  const paths = writeSummary(summary);

  console.log(`DOM audit summary: ${paths.latestPath}`);
  console.log(`DOM audit daily summary: ${paths.dailyPath}`);
  console.log(`DOM audit status: ${summary.status}`);
  appendLog(RUN_LOG, `${summary.status} platforms=${summary.totals.platforms} failures=${summary.totals.failures} warnings=${summary.totals.warnings} summary=${paths.latestPath}`);

  if (summary.status !== 'PASS') {
    appendLog(ERROR_LOG, `FAIL ${JSON.stringify(summary.failures)}`);
    console.error(JSON.stringify(summary.failures, null, 2));
    process.exit(1);
  }
}

main();
