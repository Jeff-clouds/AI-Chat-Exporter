const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  let page = context.pages()[0];
  if (!page) page = await context.newPage();
  
  console.log('Opening doubao chat page...');
  await page.goto('https://www.doubao.com/chat/38425060234467074', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(4000);
  
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300));
  console.log('Page preview:', bodyText.substring(0, 150));
  
  const needsLogin = bodyText.includes('登录') && bodyText.includes('你好，我是豆包');
  console.log('Needs login:', needsLogin);
  
  if (needsLogin) {
    console.log('\n⚠️  当前 Chrome 没登录豆包，无法验证选择器');
    console.log('请先在 Chrome 中登录豆包，然后再跑');
    await browser.close();
    return;
  }
  
  // Selectors from selectors.js
  const selectors = {
    title: 'div.group\\/title',
    question: 'div[class*="bg-g-send-msg-bubble-bg"]',
    answer: 'div[class*="flow-markdown-body"]'
  };
  
  console.log('\n🔍 选择器验证结果:\n');
  for (const [name, selector] of Object.entries(selectors)) {
    if (!selector || selector.trim() === '') {
      console.log(name + ': SKIP (null - flat mode)');
      continue;
    }
    try {
      const elements = await page.$$(selector);
      const count = elements.length;
      if (count > 0) {
        const sample = await elements[0].evaluate(el => ({
          tag: el.tagName,
          text: (el.textContent || '').substring(0, 80)
        }));
        console.log(name + ': ✅ 正常 (' + count + ' 个匹配)');
        console.log('  样例: ' + JSON.stringify(sample));
      } else {
        console.log(name + ': ❌ 失效 (0 个匹配)');
      }
    } catch (e) {
      console.log(name + ': ⚠️ 错误 - ' + e.message.substring(0, 100));
    }
  }
  
  console.log('\nDone.');
  await browser.close();
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
