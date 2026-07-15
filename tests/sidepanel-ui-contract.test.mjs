import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/core/sidepanel.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../src/core/sidepanel.js', import.meta.url), 'utf8');

assert.doesNotMatch(html, /id="panel-title"|AI Chat Exporter/);
assert.match(html, /<div id="site-info">[\s\S]*id="site-info-text"[\s\S]*id="help-button"/);
assert.doesNotMatch(html, /pro-mode-label|export-format-hint|更多格式为 Pro 功能|只导出重要问答/);
assert.match(html, /#pro-action-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(html, /#export-format-row label\s*\{[\s\S]*white-space:\s*nowrap/);
assert.match(html, /#export-format\s*\{[\s\S]*flex:\s*1 1 auto/);
assert.match(html, /font-family:\s*-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", Arial, sans-serif/);
assert.match(script, /const UI_LANGUAGE = browserLanguage\.toLowerCase\(\)\.startsWith\('zh'\) \? 'zh' : 'en'/);
assert.match(script, /zh:\s*\{[\s\S]*en:\s*\{/);
assert.match(script, /function applyStaticTranslations\(\)/);
assert.match(script, /function setSiteInfo\(text\)/);

console.log('sidepanel ui contract ok');
