import { markdownGenerator } from './markdown-generator.js';

export const EXPORT_FORMATS = Object.freeze({
  markdown: { label: 'Markdown', extension: 'md', mimeType: 'text/markdown;charset=utf-8', pro: false },
  html: { label: 'HTML', extension: 'html', mimeType: 'text/html;charset=utf-8', pro: true },
  json: { label: 'JSON', extension: 'json', mimeType: 'application/json;charset=utf-8', pro: true },
  txt: { label: 'TXT', extension: 'txt', mimeType: 'text/plain;charset=utf-8', pro: true }
});

export function normalizeExportFormat(format = 'markdown') {
  const normalized = String(format || 'markdown').trim().toLowerCase();
  if (!Object.hasOwn(EXPORT_FORMATS, normalized)) {
    throw new Error('不支持的导出格式');
  }
  return normalized;
}

export function isProExportFormat(format) {
  return EXPORT_FORMATS[normalizeExportFormat(format)].pro;
}

export function getRequiredExportFeatures(format, { selected = false } = {}) {
  const normalized = normalizeExportFormat(format);
  const features = [];
  if (selected) features.push('selected_markdown_export');
  if (EXPORT_FORMATS[normalized].pro) features.push('additional_export_formats');
  return features;
}

export async function authorizeExport(format, { selected = false, canUse } = {}) {
  const normalized = normalizeExportFormat(format);
  if (typeof canUse !== 'function') throw new Error('导出权限检查不可用');
  for (const feature of getRequiredExportFeatures(normalized, { selected })) {
    if (await canUse(feature)) continue;
    if (feature === 'selected_markdown_export') {
      throw new Error('勾选局部导出是 Pro 功能，请先激活授权码');
    }
    throw new Error(`${normalized.toUpperCase()} 导出是 Pro 功能，请先激活授权码`);
  }
  return normalized;
}

function text(value) {
  return value == null ? '' : String(value);
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeAnswer(answer = {}) {
  return {
    thinking: text(answer.thinking),
    search: text(answer.search),
    content: text(answer.content),
    codeBlocks: Array.isArray(answer.codeBlocks)
      ? answer.codeBlocks.map(block => ({ language: text(block?.language), code: text(block?.code) }))
      : []
  };
}

export function normalizeExportData(data = {}) {
  return {
    title: text(data.title) || 'AI Chat Export',
    platform: text(data.platform),
    url: text(data.url),
    exportedAt: new Date().toISOString(),
    conversations: Array.isArray(data.conversations)
      ? data.conversations.map((conversation, index) => ({
          index: index + 1,
          question: text(conversation?.question),
          answer: normalizeAnswer(conversation?.answer)
        }))
      : []
  };
}

export function generateHtml(data) {
  const normalized = normalizeExportData(data);
  const metadata = [normalized.platform, normalized.url]
    .filter(Boolean)
    .map(value => `<span>${escapeHtml(value)}</span>`)
    .join(' · ');
  const conversations = normalized.conversations.map(conversation => {
    const answer = conversation.answer;
    const sections = [];
    if (answer.thinking) sections.push(`<section><h3>思考过程</h3><pre>${escapeHtml(answer.thinking)}</pre></section>`);
    if (answer.search) sections.push(`<section><h3>搜索结果</h3><pre>${escapeHtml(answer.search)}</pre></section>`);
    if (answer.content) sections.push(`<section><h3>回答</h3><pre>${escapeHtml(answer.content)}</pre></section>`);
    answer.codeBlocks.forEach(block => {
      const language = block.language ? ` class="language-${escapeHtml(block.language)}"` : '';
      sections.push(`<section><h3>代码${block.language ? ` · ${escapeHtml(block.language)}` : ''}</h3><pre><code${language}>${escapeHtml(block.code)}</code></pre></section>`);
    });
    return `<article><h2>${conversation.index}. ${escapeHtml(conversation.question)}</h2>${sections.join('')}</article>`;
  }).join('');

  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(normalized.title)}</title><style>body{max-width:900px;margin:40px auto;padding:0 24px;color:#202124;font:16px/1.65 system-ui,sans-serif}header{border-bottom:1px solid #dadce0;margin-bottom:32px}.meta{color:#5f6368;font-size:14px}article{margin:32px 0;padding-bottom:24px;border-bottom:1px solid #e8eaed}h1,h2,h3{line-height:1.3}h2{font-size:20px}h3{font-size:15px;color:#5f6368}pre{padding:16px;border-radius:8px;background:#f6f8fa;white-space:pre-wrap;overflow-wrap:anywhere;overflow-x:auto}</style></head><body><header><h1>${escapeHtml(normalized.title)}</h1>${metadata ? `<p class="meta">${metadata}</p>` : ''}</header><main>${conversations}</main></body></html>`;
}

export function generateJson(data) {
  return JSON.stringify(normalizeExportData(data), null, 2);
}

export function generateText(data) {
  const normalized = normalizeExportData(data);
  const lines = [normalized.title];
  if (normalized.platform) lines.push(`平台：${normalized.platform}`);
  if (normalized.url) lines.push(`来源：${normalized.url}`);
  lines.push('');
  normalized.conversations.forEach(conversation => {
    lines.push(`问题 ${conversation.index}：${conversation.question}`, '');
    const answer = conversation.answer;
    if (answer.thinking) lines.push('【思考过程】', answer.thinking, '');
    if (answer.search) lines.push('【搜索结果】', answer.search, '');
    if (answer.content) lines.push('【回答】', answer.content, '');
    answer.codeBlocks.forEach(block => lines.push(`【代码${block.language ? ` · ${block.language}` : ''}】`, block.code, ''));
    lines.push('---', '');
  });
  return lines.join('\n').trim();
}

export function generateExport(data, format = 'markdown') {
  const normalizedFormat = normalizeExportFormat(format);
  const metadata = EXPORT_FORMATS[normalizedFormat];
  let content;
  if (normalizedFormat === 'markdown') content = markdownGenerator.generate(data);
  if (normalizedFormat === 'html') content = generateHtml(data);
  if (normalizedFormat === 'json') content = generateJson(data);
  if (normalizedFormat === 'txt') content = generateText(data);
  return { format: normalizedFormat, content, ...metadata };
}
