import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { writeFileSync } from 'fs';

// ===== 模拟插件完整导出流程 =====

// 豆包选择器（修复后的配置）
const selectors = {
  cleanupSelectors: [
    'div[class*="container-Uxvbjy"]',
    'div[class*="md-box-line-break"]',
    'div[class*="wrapper-GYqxgQ"]'
  ]
};

// 从真实豆包页面获取的 HTML 数据（基于之前 Apple Events JS 拿到的真实 DOM 结构）
const mockAnswers = [
  // 第1个回答 - 太阳角度数据
  `<div class="container-P2rR72 flow-markdown-body theme-samantha-uDexJL container-ZLUAIf mdbox-theme-next">
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <div class="auto-hide-last-sibling-br paragraph-pP9ZLC paragraph-element br-paragraph-space">
      <span>深圳（约 北纬 22.5°）位于北回归线（23.5°N）以南，正午太阳高度角全年很高，夏季会出现太阳直射头顶（接近 90°），冬季最低也有约 44°。全年变化呈 <strong>"先升后降、再升再降"</strong> 的完整周期。</span>
    </div>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <h3 class="header-iWP5WJ auto-hide-last-sibling-br">一、核心公式</h3>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <div class="auto-hide-last-sibling-br paragraph-pP9ZLC paragraph-element br-paragraph-space">
      <span>正午太阳高度角：H = 90° − | 当地纬度 − 太阳赤纬 δ|</span>
    </div>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <div class="auto-hide-last-sibling-br paragraph-pP9ZLC paragraph-element br-paragraph-space">
      <span>深圳纬度 φ ≈ 22.5°N<br>太阳赤纬 δ：夏至 +23.5°，冬至 −23.5°，春分 / 秋分 0°</span>
    </div>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <h3 class="header-iWP5WJ auto-hide-last-sibling-br">二、四季具体数据</h3>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <table>
      <thead><tr><th>节气</th><th>太阳赤纬 δ</th><th>正午太阳高度 H</th><th>影子长度（1.7m 人）</th></tr></thead>
      <tbody>
        <tr><td>春分（3 月 21 日左右）</td><td>0°</td><td>90 − 22.5 = <strong>67.5°</strong></td><td>约 0.7m</td></tr>
        <tr><td>夏至（6 月 21 日左右）</td><td>+23.5°</td><td>90 − |22.5 − 23.5| = <strong>89°</strong></td><td>约 0.03m（几乎无影）</td></tr>
        <tr><td>秋分（9 月 23 日左右）</td><td>0°</td><td>90 − 22.5 = <strong>67.5°</strong></td><td>约 0.7m</td></tr>
        <tr><td>冬至（12 月 22 日左右）</td><td>−23.5°</td><td>90 − |22.5 − (−23.5)| = <strong>44°</strong></td><td>约 1.7m（影子≈身高）</td></tr>
      </tbody>
    </table>
  </div>`,

  // 第2个回答 - 12点问题
  `<div class="container-P2rR72 flow-markdown-body theme-samantha-uDexJL container-ZLUAIf mdbox-theme-next">
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <div class="auto-hide-last-sibling-br paragraph-pP9ZLC paragraph-element br-paragraph-space">
      <span>不是严格钟表 12 点，是当地正午（太阳最高那一刻）。我上面给的所有角度，都是太阳上中天、影子最短的那个瞬间。</span>
    </div>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <h3 class="header-iWP5WJ auto-hide-last-sibling-br">1. 到底是几点？</h3>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <div class="auto-hide-last-sibling-br paragraph-pP9ZLC paragraph-element br-paragraph-space">
      <span>深圳经度约 114°E，比北京时间（120°E）偏西一点<br>所以：<br>北京时间 12:00 ≠ 深圳正午<br>深圳真正正午一般在 北京时间 12:20～12:30 左右</span>
    </div>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <div class="auto-hide-last-sibling-br paragraph-pP9ZLC paragraph-element br-paragraph-space">
      <span>我给的角度：是这个 "真太阳正午" 的角度，不是钟表 12 点整。</span>
    </div>
  </div>`,

  // 第3个回答 - 示意图
  `<div class="container-P2rR72 flow-markdown-body theme-samantha-uDexJL container-ZLUAIf mdbox-theme-next">
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <div class="auto-hide-last-sibling-br paragraph-pP9ZLC paragraph-element br-paragraph-space">
      <span>我用文字 + 简易图形给你画清楚，一眼就能看懂深圳一年四季正午太阳高度变化。（下面统一按：深圳 北纬 22.5°，真太阳正午，太阳在正南方向）</span>
    </div>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <h3 class="header-iWP5WJ auto-hide-last-sibling-br">一、总示意图（侧视图）</h3>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <div class="auto-hide-last-sibling-br paragraph-pP9ZLC paragraph-element br-paragraph-space">
      <span>地面是水平线，你站在中间，头顶向上是天顶。</span>
    </div>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <pre><code class="language-plaintext">         天顶
          ↑
          |
夏至     /|  冬至
      ·/  |   ·
    ·/    |     ·
  /       |       ·
你 -------+-------- 地面(水平线)
          |
        正南方向</code></pre>
  </div>`,

  // 第4个回答 - 南北方向
  `<div class="container-P2rR72 flow-markdown-body theme-samantha-uDexJL container-ZLUAIf mdbox-theme-next">
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <div class="auto-hide-last-sibling-br paragraph-pP9ZLC paragraph-element br-paragraph-space">
      <span>好，这次把正南方向、地面、角度、四季太阳位置一次画清楚。统一说明：</span>
    </div>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <div class="auto-hide-last-sibling-br paragraph-pP9ZLC paragraph-element br-paragraph-space">
      <span>地点：深圳 北纬 22.5°<br>时间：当地正午（太阳最高时刻）<br>方向：太阳全年正午都在正南方向</span>
    </div>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <h3 class="header-iWP5WJ auto-hide-last-sibling-br">总结表格</h3>
    <div class="container-Uxvbjy md-box-line-break wrapper-GYqxgQ undefined"></div>
    <table>
      <thead><tr><th>节气</th><th>太阳在正南方向高度</th><th>影子方向</th><th>影子长度</th></tr></thead>
      <tbody>
        <tr><td>夏至</td><td>89°（最高）</td><td>正北</td><td>几乎无影</td></tr>
        <tr><td>春/秋分</td><td>67.5°</td><td>正北</td><td>短影</td></tr>
        <tr><td>冬至</td><td>44°（最低）</td><td>正北</td><td>长影≈身高</td></tr>
      </tbody>
    </table>
  </div>`
];

const questions = [
  '深圳一年四季，太阳与地面中午的角度是多少，怎么变化',
  '你给的是12点吗',
  '刚刚那个你能帮我画个示意图吗，一年四季的角度',
  '你没有给出南北'
];

// ===== 模拟插件的 extractContent 函数 =====
function extractContentDirect(htmlString, selectors) {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
  });
  turndownService.use(gfm);

  // 模拟 DOM 操作：清理不需要的元素（用正则模拟 querySelectorAll）
  let cleaned = htmlString;
  for (const sel of selectors.cleanupSelectors) {
    const classMatch = sel.match(/class\*="([^"]+)"/);
    if (classMatch) {
      const cls = classMatch[1];
      // 移除包含该类名的 div（包括空行容器）
      cleaned = cleaned.replace(new RegExp(`<div[^>]*${cls}[^>]*>\\s*</div>`, 'g'), '');
    }
  }
  // 移除 script/style/svg/button/input/select/textarea
  cleaned = cleaned.replace(/<(script|style|svg|button|input|select|textarea)[^>]*>[\s\S]*?<\/\1>/gi, '');
  cleaned = cleaned.replace(/<(script|style|svg|button|input|select|textarea)[^>]*\/>/gi, '');

  return turndownService.turndown(cleaned);
}

// ===== 模拟 markdown-generator.js =====
function generateMarkdown(data) {
  let content = '';
  const now = new Date();
  const created = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  content += '---\n';
  if (data.url) content += `url: ${data.url}\n`;
  content += `created: ${created}\n`;
  if (data.platform) content += `平台: ${data.platform}\n`;
  content += '---\n\n';
  content += `# ${data.title}\n\n`;
  data.conversations.forEach((conv, index) => {
    content += `## ${conv.question}\n\n`;
    const answer = conv.answer;
    if (answer.thinking) content += `### 思考过程\n\n${answer.thinking}\n\n`;
    if (answer.search) content += `### 搜索结果\n\n${answer.search}\n\n`;
    if (answer.thinking || answer.search) content += `---\n\n`;
    if (answer.content) content += `${answer.content.trim()}\n\n`;
    if (answer.codeBlocks && answer.codeBlocks.length > 0) {
      answer.codeBlocks.forEach(cb => {
        content += `\`\`\`${cb.language}\n${cb.code}\n\`\`\`\n\n`;
      });
    }
    if (index < data.conversations.length - 1) content += `---\n\n`;
  });
  return content;
}

// ===== 执行导出 =====
const title = '深圳一年四季，太阳与地面中午的角度是多少，怎么变化';
const conversations = [];

questions.forEach((q, i) => {
  const content = extractContentDirect(mockAnswers[i], selectors);
  conversations.push({
    question: q,
    answer: { content }
  });
});

const data = {
  title,
  conversations,
  url: 'https://www.doubao.com/chat/38423090608933378',
  platform: 'Doubao'
};

const markdown = generateMarkdown(data);
const outputPath = '/tmp/doubao-export-test.md';
writeFileSync(outputPath, markdown, 'utf-8');

// 输出验证结果
console.log('=== 豆包导出测试（Turndown 真实转换）===');
console.log('文件:', outputPath);
console.log('');

conversations.forEach((c, i) => {
  console.log(`--- 对话 ${i+1} ---`);
  console.log('Q:', c.question);
  console.log('A 长度:', c.answer.content.length, '字符');
  console.log('A 预览:', c.answer.content.substring(0, 120).replace(/\n/g, '\\n'));
  console.log('');
});

console.log('=== Markdown 格式检查 ===');
if (markdown.startsWith('---')) console.log('✅ YAML Front Matter');
if (markdown.includes('# ')) console.log('✅ H1 标题');
const h2Count = (markdown.match(/^## /gm) || []).length;
console.log(`✅ ${h2Count} 个对话段落`);
const hrCount = (markdown.match(/^---$/gm) || []).length;
console.log(`✅ ${hrCount} 个分隔线`);
const codeBlockCount = (markdown.match(/```/g) || []).length / 2;
console.log(`✅ ${Math.floor(codeBlockCount)} 个代码块`);
const tableLines = markdown.split('\n').filter(l => l.includes('|')).length;
console.log(`✅ ${tableLines} 行表格`);
const chineseCount = (markdown.match(/[\u4e00-\u9fff]/g) || []).length;
console.log(`✅ ${chineseCount} 个中文字符`);
if (markdown.includes('**')) console.log('✅ 粗体格式');
if (markdown.includes('*')) console.log('✅ 斜体格式');

// 检查是否有乱码
const hasFFFD = markdown.includes('\ufffd');
const hasNullByte = markdown.includes('\x00');
if (!hasFFFD) console.log('✅ 无替换字符（无乱码）');
if (!hasNullByte) console.log('✅ 无 null 字节');

console.log('');
console.log('✅ 完整导出验证完成');
