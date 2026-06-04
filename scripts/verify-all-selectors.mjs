#!/usr/bin/env node
/**
 * AI Chat 平台 DOM 选择器健康检查
 * 
 * 功能：
 * - 通过 CDP 连接用户的 Chrome（http://127.0.0.1:9222）
 * - 逐一验证 AI-Chat-Exporter 和 AI-Chat-Outline 中所有平台的选择器
 * - 输出 JSON 报告 + 控制台摘要
 * 
 * 用法：node scripts/verify-all-selectors.mjs
 * 
 * ⚠️ 依赖：
 * - Chrome 必须在 9222 端口开启 CDP（--remote-debugging-port=9222）
 * - 各平台必须已登录
 * 
 * 📦 使用方式：
 * - 在 AI-Chat-Exporter 目录下执行，会自动使用本项目的 playwright-core
 */

import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, '..');
const REPORT_DIR = join(PROJECT_DIR, 'scripts', 'reports');

// ============================================================
// 平台配置：直接从 selectors.js 提取
// ============================================================

// 解析 selectors.js 获取所有平台配置
function parseSelectorsJS() {
  const selectorsPath = join(PROJECT_DIR, 'src', 'config', 'selectors.js');
  const content = readFileSync(selectorsPath, 'utf-8');

  const platforms = {};
  
  // 匹配 const xxxConfig = { ... } 块
  const configRegex = /const\s+(\w+Config)\s*=\s*\{[\s\S]*?name:\s*['"]([^'"]+)['"][\s\S]*?urlPatterns:\s*\[([\s\S]*?)\][\s\S]*?selectors:\s*\{([\s\S]*?)\}/g;
  
  let match;
  while ((match = configRegex.exec(content)) !== null) {
    const varName = match[1];
    const name = match[2];
    const urlPatternsRaw = match[3];
    const selectorsRaw = match[4];
    
    // 提取 URL patterns
    const urlPatterns = urlPatternsRaw.match(/['"]([^'"]+)['"]/g)?.map(s => s.replace(/['"]/g, '')) || [];
    
    // 提取 selectors
    const selectors = {};
    const selRegex = /(\w+):\s*(?:(?:null)|(?:"([^"]*)")|(?:'([^']*)'))/g;
    let selMatch;
    while ((selMatch = selRegex.exec(selectorsRaw)) !== null) {
      const key = selMatch[1];
      const value = selMatch[2] !== undefined ? selMatch[2] : (selMatch[3] !== undefined ? selMatch[3] : null);
      selectors[key] = value;
    }
    
    platforms[varName] = { name, urlPatterns, selectors };
  }
  
  return platforms;
}

// ============================================================
// 测试页面 URL（需要用户提前准备好登录态）
// ============================================================
const TEST_URLS = {
  doubao:   'https://www.doubao.com/chat/38425060234467074',
  deepseek: 'https://chat.deepseek.com/',
  chatgpt:  'https://chatgpt.com/',
  grok:     'https://grok.com/',
  kimi:     'https://kimi.com/',
  gemini:   'https://gemini.google.com/',
  yuanbao:  'https://yuanbao.tencent.com/',
};

// 登录检测关键词
const LOGIN_INDICATORS = ['登录', 'login', 'signin', 'sign in', 'Log in', 'Sign in', '请输入手机号', '请输入密码', '扫码登录'];

// ============================================================
// 主逻辑
// ============================================================

async function run() {
  console.log('🔍 AI Chat 选择器健康检查');
  console.log('═'.repeat(50));
  
  const platforms = parseSelectorsJS();
  console.log(`📋 已解析 ${Object.keys(platforms).length} 个平台配置\n`);

  // 连接 CDP
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    console.log('✅ 已连接 Chrome CDP');
  } catch (err) {
    console.error(`❌ 无法连接 Chrome CDP: ${err.message}`);
    console.error('💡 请确保 Chrome 以 --remote-debugging-port=9222 启动');
    writeReport({ error: 'CDP_CONNECTION_FAILED', message: err.message, timestamp: new Date().toISOString() });
    process.exit(1);
  }

  const context = browser.contexts()[0];
  const report = {
    timestamp: new Date().toISOString(),
    cdpConnected: true,
    platforms: {}
  };

  for (const [key, config] of Object.entries(platforms)) {
    const platformName = config.name;
    const testUrl = TEST_URLS[key.toLowerCase()] || TEST_URLS[key] || `https://${config.urlPatterns[0]}`;
    
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`🌐 检查 ${platformName} (${key})`);
    console.log(`   URL: ${testUrl}`);

    const platformReport = {
      name: platformName,
      key,
      testUrl,
      selectors: {},
      overall: 'PENDING',
      note: ''
    };

    try {
      // 创建新标签页
      const page = await context.newPage();
      
      // 导航到测试页面
      await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);

      // 检查登录态
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      const needsLogin = LOGIN_INDICATORS.some(indicator => bodyText.includes(indicator));
      
      if (needsLogin) {
        console.log(`   ⚠️  需要登录，跳过检查`);
        platformReport.overall = 'SKIP_LOGIN';
        platformReport.note = '页面需要登录，无法自动验证';
        report.platforms[key] = platformReport;
        await page.close();
        continue;
      }

      // 验证每个选择器
      let passCount = 0;
      let failCount = 0;
      let skipCount = 0;

      for (const [selName, selector] of Object.entries(config.selectors)) {
        if (!selector || selector.trim() === '' || selector === 'null') {
          platformReport.selectors[selName] = { selector, status: 'SKIP', elements: 0, note: '未配置' };
          skipCount++;
          continue;
        }

        try {
          // 处理逗号分隔的多选择器
          const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
          let totalMatches = 0;

          for (const sel of parts) {
            try {
              const elements = await page.evaluate((s) => {
                try {
                  return document.querySelectorAll(s).length;
                } catch {
                  return -1; // 无效选择器
                }
              }, sel);
              
              if (elements >= 0) {
                totalMatches += elements;
              }
            } catch {
              // 忽略单个子选择器的错误
            }
          }

          if (totalMatches > 0) {
            platformReport.selectors[selName] = { selector, status: 'PASS', elements: totalMatches };
            passCount++;
          } else {
            // 失效，尝试找到替代选择器
            const suggestions = await findAlternativeSelectors(page, selName, selector);
            platformReport.selectors[selName] = { 
              selector, 
              status: 'FAIL', 
              elements: 0, 
              note: '匹配到 0 个元素',
              suggestions 
            };
            failCount++;
          }
        } catch (err) {
          platformReport.selectors[selName] = { selector, status: 'ERROR', elements: 0, note: err.message.substring(0, 100) };
          failCount++;
        }
      }

      // 汇总
      if (failCount === 0) {
        platformReport.overall = 'PASS';
        platformReport.note = `${passCount} 个通过, ${skipCount} 个跳过`;
        console.log(`   ✅ 全部通过 (${passCount} pass, ${skipCount} skip)`);
      } else {
        platformReport.overall = 'FAIL';
        platformReport.note = `${passCount} 个通过, ${failCount} 个失败, ${skipCount} 个跳过`;
        console.log(`   ❌ ${failCount} 个选择器失效`);
        for (const [selName, selReport] of Object.entries(platformReport.selectors)) {
          if (selReport.status === 'FAIL') {
            console.log(`      - ${selName}: ${selReport.selector}`);
            if (selReport.suggestions?.length > 0) {
              console.log(`        建议替代: ${selReport.suggestions.slice(0, 3).join(', ')}`);
            }
          }
        }
      }

      await page.close();
    } catch (err) {
      platformReport.overall = 'ERROR';
      platformReport.note = err.message.substring(0, 200);
      console.log(`   ❌ 页面访问失败: ${err.message.substring(0, 80)}`);
    }

    report.platforms[key] = platformReport;
  }

  await browser.close();

  // 汇总统计
  const summary = Object.values(report.platforms).map(p => ({
    name: p.name,
    overall: p.overall,
    note: p.note
  }));
  
  report.summary = summary;

  // 写入报告
  writeReport(report);
  
  // 输出摘要
  console.log('\n' + '═'.repeat(50));
  console.log('📊 检查摘要:');
  for (const s of summary) {
    const icon = s.overall === 'PASS' ? '✅' : s.overall === 'SKIP_LOGIN' ? '⚠️' : '❌';
    console.log(`  ${icon} ${s.name}: ${s.overall} — ${s.note}`);
  }
  
  // 退出码：有失败则返回 1
  const hasFailure = Object.values(report.platforms).some(p => p.overall === 'FAIL');
  process.exit(hasFailure ? 1 : 0);
}

// 尝试找到替代选择器
async function findAlternativeSelectors(page, selName, originalSelector) {
  const suggestions = [];
  
  // 根据选择器名称尝试常见模式
  const fallbackPatterns = {
    question: [
      '[data-testid*="user"]',
      '[data-role="user"]',
      '[data-message-author-role="user"]',
      'div[class*="user"]',
      'div[class*="question"]',
      'div[class*="bubble"]',
    ],
    answer: [
      '[data-testid*="assistant"]',
      '[data-role="assistant"]',
      '[data-message-author-role="assistant"]',
      'div[class*="assistant"]',
      'div[class*="answer"]',
      'div[class*="response"]',
      'div[class*="message"]',
    ],
    thinking: [
      'div[class*="think"]',
      'div[class*="reason"]',
      'div[class*="thought"]',
      '[data-is-thinking="true"]',
    ],
    title: [
      'h1', 'h2', '.title', '[class*="title"]', '.header', '[class*="header"]',
    ],
    markdownBlock: [
      '.markdown', '.markdown-body', '[class*="markdown"]',
      'div[class*="content"]', 'div[class*="text"]',
    ],
  };
  
  const patterns = fallbackPatterns[selName] || [];
  
  for (const pattern of patterns) {
    const count = await page.evaluate((p) => {
      try { return document.querySelectorAll(p).length; } catch { return 0; }
    }, pattern);
    
    if (count > 0) {
      suggestions.push(`${pattern} (${count}个)`);
      if (suggestions.length >= 3) break;
    }
  }
  
  return suggestions;
}

// 写入报告文件
function writeReport(report) {
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = join(REPORT_DIR, `selectors-report-${timestamp}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 报告已保存: ${reportPath}`);
    
    // 同时保存一份 latest
    const latestPath = join(REPORT_DIR, 'selectors-report-latest.json');
    writeFileSync(latestPath, JSON.stringify(report, null, 2));
  } catch (err) {
    console.error('⚠️  报告写入失败:', err.message);
  }
}

// 运行
run().catch(err => {
  console.error('💥 脚本执行失败:', err.message);
  process.exit(2);
});
