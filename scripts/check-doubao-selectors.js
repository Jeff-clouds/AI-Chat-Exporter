#!/usr/bin/env node
/**
 * Doubao 平台选择器健康检查
 * 
 * 用法：node scripts/check-doubao-selectors.js
 * 
 * ⚠️  注意：此脚本需要已登录的浏览器环境。
 *    headless 模式无法通过豆包登录验证。
 *    推荐使用 cron 任务（通过 OpenClaw 已登录浏览器）或手动用浏览器 DevTools 验证。
 *
 * 功能：
 * - 打开豆包对话页面
 * - 验证 selectors.js 中定义的选择器是否能匹配到元素
 * - 输出检查结果
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 解析 selectors.js 提取 doubaoConfig
function parseSelectors() {
  const selectorsPath = path.join(__dirname, '..', 'src', 'config', 'selectors.js');
  const content = fs.readFileSync(selectorsPath, 'utf-8');
  
  // 提取 doubaoConfig 中的 selectors 块
  const match = content.match(/const doubaoConfig\s*=\s*\{[\s\S]*?selectors:\s*\{([\s\S]*?)\},?[\s\n]*features:/);
  if (!match) {
    throw new Error('无法解析 doubaoConfig');
  }
  
  const selectorsText = match[1];
  const selectors = {};
  
  // 逐行解析，支持 class*="xxx" 等复杂选择器
  const lines = selectorsText.split('\n');
  for (const line of lines) {
    // 匹配 key: 'value'（支持 value 内部有双引号）
    const m = line.match(/^(\s*\w+):\s*'([^']*)'/);
    if (m) {
      const key = m[1].trim();
      const value = m[2].trim();
      if (value) {
        selectors[key] = value;
      }
      continue;
    }
    // 匹配 key: "value"（支持 value 内部有单引号）
    const m2 = line.match(/^(\s*\w+):\s*"([^"]*)"/);
    if (m2) {
      const key = m2[1].trim();
      const value = m2[2].trim();
      if (value) {
        selectors[key] = value;
      }
    }
  }
  
  return selectors;
}

async function checkSelectors() {
  const selectors = parseSelectors();
  console.log('📋 豆包选择器配置:');
  for (const [k, v] of Object.entries(selectors)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('');
  
  const chatId = '38425060234467074';
  const url = `https://www.doubao.com/chat/${chatId}`;
  
  // 尝试使用用户 Chrome profile 获取登录态
  const userDataDir = path.join(process.env.HOME, 'Library/Application Support/Google/Chrome');
  let browser;
  try {
    browser = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: false,
      args: ['--no-first-run', '--no-default-browser-check']
    });
    const pages = browser.pages();
    const page = pages[0] || await browser.newPage();
    
    console.log(`🌐 打开页面: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(5000);
    
    // 检查是否需要登录
    const bodyText = await page.textContent('body');
    if (bodyText.includes('登录') || bodyText.includes('login')) {
      console.log('⚠️  页面需要登录，无法自动检查选择器');
      console.log('💡 请确保 Chrome 已登录豆包，或使用 OpenClaw cron 任务自动检查');
      process.exit(3);
      return;
    }
    
    console.log('🔍 检查结果:\n');
    
    const results = [];
    
    for (const [name, selector] of Object.entries(selectors)) {
      if (!selector || selector.trim() === '') {
        results.push({ name, selector, status: 'SKIP', elements: 0, note: '未配置' });
        continue;
      }
      
      try {
        const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
        let totalMatches = 0;
        
        for (const sel of parts) {
          const count = await page.locator(sel).count();
          totalMatches += count;
        }
        
        if (totalMatches > 0) {
          results.push({ name, selector, status: '✅ OK', elements: totalMatches, note: '' });
        } else {
          results.push({ name, selector, status: '❌ FAIL', elements: 0, note: '匹配到 0 个元素' });
        }
      } catch (err) {
        results.push({ name, selector, status: '⚠️ ERR', elements: 0, note: err.message.substring(0, 80) });
      }
    }
    
    console.table(results);
    console.log('');
    
    const failures = results.filter(r => r.status.includes('FAIL') || r.status.includes('ERR'));
    
    if (failures.length > 0) {
      console.log(`⚠️  ${failures.length} 个选择器失效，需要更新！`);
      failures.forEach(f => console.log(`  - ${f.name}: ${f.selector} (${f.note})`));
      process.exit(1);
    } else {
      console.log('✅ 所有选择器正常工作');
      process.exit(0);
    }
  } catch (err) {
    console.log(`⚠️  无法启动浏览器: ${err.message}`);
    console.log('💡 使用 OpenClaw cron 任务（每周一 10:00 自动检查）或手动用浏览器 DevTools 验证');
    process.exit(3);
  } finally {
    if (browser) await browser.close();
  }
}

checkSelectors().catch(err => {
  console.error('脚本执行失败:', err.message);
  process.exit(2);
});
