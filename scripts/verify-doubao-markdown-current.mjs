import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const selectors = {
  cleanupSelectors: [
    'div[class*="send-msg-bubble"]',
    'div[class*="message-action-bar"]',
    'div[class*="entry-btn-title"]',
    'div[class*="container-Uxvbjy"]',
    'div[class*="md-box-line-break"]',
    'div[class*="wrapper-GYqxgQ"]'
  ]
};

const question = '劳务报酬的个税是怎么扣的';

const hostHtml = `
<div class="conversation-page-message-host w-full flex-shrink flex-grow basis-0 min-h-100 flex items-center flex-col">
  <div class="my-0 w-full mx-auto max-w-(--content-max-width)">
    <div class="whitespace-pre-wrap wrap-anywhere rounded-s-radius-s bg-g-send-msg-bubble-bg text-g-send-msg-bubble-text">
      ${question}
    </div>
  </div>
  <div class="my-0 w-full mx-auto max-w-(--content-max-width)">
    <div class="message-action-bar-raqbg0 flex flex-row w-full group">
      <div class="entry-btn-title-v3-uM2642">参考 12 篇资料</div>
    </div>
  </div>
  <div class="my-0 w-full mx-auto max-w-(--content-max-width)">
    <div role="generic" aria-label="doc_editor">
      <p>劳务报酬个税分两步：<strong>先预扣预缴，年度并入综合所得汇算清缴、多退少补</strong>。</p>
      <h3>一、预扣预缴（支付方代扣）</h3>
      <p>按<strong>每次收入</strong>算。</p>
      <ul>
        <li>收入 ≤ <strong>800 元</strong>：不扣税</li>
        <li>800 &lt; 收入 ≤ <strong>4000 元</strong>：应纳税所得额 = 收入 − <strong>800</strong></li>
      </ul>
      <h3>二、举几个例子</h3>
      <table>
        <thead>
          <tr><th>应纳税所得额</th><th>预扣率</th><th>速算扣除数</th></tr>
        </thead>
        <tbody>
          <tr><td>≤20,000 元</td><td>20%</td><td>0</td></tr>
          <tr><td>20,000～50,000 元</td><td>30%</td><td>2,000</td></tr>
        </tbody>
      </table>
      <p>要不要我帮你做一个“劳务报酬个税速算表”？</p>
    </div>
  </div>
</div>
`;

function cleanupHtml(html, cleanupSelectors) {
  const classFragments = cleanupSelectors
    .map(sel => sel.match(/class\*="([^"]+)"/)?.[1])
    .filter(Boolean);

  let cleaned = html;
  for (const fragment of classFragments) {
    cleaned = cleaned.replace(
      new RegExp(`<div[^>]*class="[^"]*${fragment}[^"]*"[^>]*>[\\s\\S]*?<\\/div>`, 'g'),
      ''
    );
  }

  cleaned = cleaned.replace(/<(script|style|svg|button|input|select|textarea)[^>]*>[\s\S]*?<\/\1>/gi, '');
  cleaned = cleaned.replace(/<(script|style|svg|button|input|select|textarea)[^>]*\/>/gi, '');
  return cleaned;
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*'
});
turndownService.use(gfm);

const cleanedHtml = cleanupHtml(hostHtml, selectors.cleanupSelectors);
const markdown = turndownService.turndown(cleanedHtml).trim();

const checks = {
  removedQuestionBubble: !markdown.includes(question),
  removedActionBar: !markdown.includes('参考 12 篇资料'),
  hasHeading: markdown.includes('### 一、预扣预缴（支付方代扣）'),
  hasTable: markdown.includes('| 应纳税所得额 | 预扣率 | 速算扣除数 |'),
  noExcessiveBlankLines: !/\n{4,}/.test(markdown),
  noReplacementChar: !markdown.includes('\ufffd')
};

console.log('=== Doubao Markdown Verification ===');
console.log(markdown);
console.log('\n=== Checks ===');
for (const [name, passed] of Object.entries(checks)) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
}

if (Object.values(checks).some(v => !v)) {
  process.exitCode = 1;
}
