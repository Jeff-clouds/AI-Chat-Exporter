import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/core/background.js', import.meta.url), 'utf8');

assert.match(source, /const supported = isSupportedUrl\(tab\.url \|\| ''\)/);
assert.match(source, /chrome\.sidePanel\.setOptions\(\{[\s\S]*tabId: tab\.id,[\s\S]*enabled: supported/);
assert.match(source, /chrome\.action\.setPopup\(\{[\s\S]*tabId: tab\.id,[\s\S]*popup: supported \? '' : 'src\/core\/unsupported-popup\.html'/);
assert.match(source, /chrome\.action\.setTitle\(/);
assert.match(source, /chrome\.tabs\.onActivated\.addListener/);
assert.match(source, /chrome\.tabs\.onCreated\.addListener/);
assert.match(source, /chrome\.tabs\.onUpdated\.addListener/);
assert.match(source, /chrome\.storage\.session\.remove\(`\$\{RUNTIME_STATUS_KEY_PREFIX\}\$\{tabId\}`\)/);
assert.match(source, /chrome\.tabs\.onRemoved\.addListener/);
assert.match(source, /syncSidePanelAvailability/);
assert.match(source, /chrome\.sidePanel\.setOptions\(\{ enabled: false \}\)/);
assert.match(source, /Promise\.all\(tabs\.map\(syncSidePanelAvailability\)\)/);
assert.match(source, /await syncSidePanelAvailability\(tab\);[\s\S]*await chrome\.sidePanel\.open\(\{ tabId: tab\.id \}\)/);

const unsupportedPopup = fs.readFileSync(new URL('../src/core/unsupported-popup.html', import.meta.url), 'utf8');
assert.match(unsupportedPopup, /当前页面不受支持/);
assert.match(unsupportedPopup, /ChatGPT、豆包、DeepSeek、元宝、Gemini、Grok 或 Kimi/);

console.log('per-tab side panel availability contract ok');
