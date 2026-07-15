import assert from 'node:assert/strict';
import fs from 'node:fs';
import { authorizeExport, generateExport, generateHtml, generateJson, generateText, getRequiredExportFeatures, normalizeExportFormat } from '../src/export/utils/export-generators.js';
import { resolveLicensedFeatures } from '../src/core/license.js';
import { DownloadManager } from '../src/export/utils/download-manager.js';

const fixture = {
  title: '测试 <对话>',
  platform: 'ChatGPT',
  url: 'https://chatgpt.com/c/test?a=1&b=2',
  conversations: [{
    question: '<img src=x onerror=alert(1)> 如何导出？',
    answer: {
      thinking: '先分析',
      search: '搜索结果',
      content: '回答正文\n\n## 小节',
      codeBlocks: [{ language: 'js', code: '<script>alert(1)</script>' }]
    }
  }]
};

assert.equal(normalizeExportFormat('HTML'), 'html');
assert.throws(() => normalizeExportFormat('pdf'), /不支持/);

const markdown = generateExport(fixture, 'markdown');
assert.equal(markdown.extension, 'md');
assert.match(markdown.mimeType, /^text\/markdown/);
assert.match(markdown.content, /## <img src=x onerror=alert\(1\)> 如何导出？/);
assert.deepEqual(getRequiredExportFeatures('markdown'), []);
assert.deepEqual(getRequiredExportFeatures('markdown', { selected: true }), ['selected_markdown_export']);
assert.deepEqual(getRequiredExportFeatures('html'), ['additional_export_formats']);
assert.deepEqual(getRequiredExportFeatures('json', { selected: true }), [
  'selected_markdown_export',
  'additional_export_formats'
]);
const denyPro = feature => !['selected_markdown_export', 'additional_export_formats'].includes(feature);
assert.equal(await authorizeExport('markdown', { canUse: denyPro }), 'markdown');
await assert.rejects(authorizeExport('html', { canUse: denyPro }), /HTML 导出是 Pro 功能/);
await assert.rejects(authorizeExport('markdown', { selected: true, canUse: denyPro }), /局部导出是 Pro 功能/);
assert.equal(await authorizeExport('json', { selected: true, canUse: async () => true }), 'json');

const html = generateHtml(fixture);
assert.match(html, /^<!doctype html>/);
assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);

const jsonText = generateJson(fixture);
const json = JSON.parse(jsonText);
assert.equal(json.conversations[0].question, fixture.conversations[0].question);
assert.equal(json.conversations[0].answer.codeBlocks[0].language, 'js');

const plain = generateText(fixture);
assert.match(plain, /问题 1：/);
assert.match(plain, /【回答】/);
assert.doesNotMatch(plain, /<html|<body/i);

const expectedDownloads = {
  markdown: ['md', 'text/markdown;charset=utf-8'],
  html: ['html', 'text/html;charset=utf-8'],
  json: ['json', 'application/json;charset=utf-8'],
  txt: ['txt', 'text/plain;charset=utf-8']
};
for (const [format, [extension, mimeType]] of Object.entries(expectedDownloads)) {
  const generated = generateExport(fixture, format);
  const manager = new DownloadManager();
  let observed;
  manager._downloadBlob = (blob, filename) => { observed = { type: blob.type, filename }; };
  manager.download(generated.content, 'chat', generated);
  assert.deepEqual(observed, { type: mimeType, filename: `chat.${extension}` });
}

const legacyProFeatures = resolveLicensedFeatures('pro', ['selected_markdown_export']);
assert.ok(legacyProFeatures.includes('selected_markdown_export'));
assert.ok(legacyProFeatures.includes('additional_export_formats'));
assert.ok(resolveLicensedFeatures('lifetime', ['selected_markdown_export']).includes('additional_export_formats'));
assert.deepEqual(resolveLicensedFeatures('free', ['additional_export_formats']).sort(), [
  'full_markdown_export',
  'outline_navigation'
]);

const backgroundSource = fs.readFileSync(new URL('../src/core/background.js', import.meta.url), 'utf8');
assert.match(backgroundSource, /authorizeExport\(format, \{ selected, canUse \}\)/);
assert.match(backgroundSource, /handleExportFullChat\(request\.format/);
assert.match(backgroundSource, /handleExportSelectedChat\(request\.questionIndexes \|\| \[\], request\.format/);

const sidepanelSource = fs.readFileSync(new URL('../src/core/sidepanel.js', import.meta.url), 'utf8');
const sidepanelHtml = fs.readFileSync(new URL('../src/core/sidepanel.html', import.meta.url), 'utf8');
assert.match(sidepanelHtml, /option value="markdown"[^>]*>Markdown · 免费/);
assert.match(sidepanelHtml, /option value="html"[^>]*data-pro-format[^>]*>HTML · Pro/);
assert.match(sidepanelSource, /option\.disabled = !isPro/);
assert.match(sidepanelSource, /action: 'exportFullChat', format/);
assert.match(sidepanelSource, /action: 'exportSelectedChat', questionIndexes, format/);

console.log('export formats and Pro entitlement ok');
