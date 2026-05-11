# AI Chat Exporter 维护指南

## 🛡️ 核心原则：最小影响

> **修改选择器配置 ≠ 修改导出逻辑。永远只改配置，不动逻辑。**

### 仓库架构

```
chat-exporter/
├── src/
│   ├── config/selectors.js      ← ✅ 唯一允许修改的文件（平台配置）
│   ├── background.js            ← ❌ 不要动（导出流程）
│   ├── utils/
│   │   ├── markdown-generator.js ← ❌ 不要动
│   │   ├── download-manager.js   ← ❌ 不要动
│   │   └── sanitizer.js         ← ❌ 不要动
│   └── lib/                      ← ❌ 不要动（第三方库）
├── popup.js / popup.html        ← ❌ 不要动
├── manifest.json                ← ⚠️ 仅新增平台时添加 host_permissions
└── MAINTENANCE.md               ← 本文件
```

### 维护规则

1. **只改 `src/config/selectors.js`** — 所有平台的适配都在这个文件里完成
2. **每个平台一个 config 对象** — 如 `doubaoConfig`、`chatgptConfig`
3. **修改范围仅限于 config 对象内部** — 不改函数、不改流程、不改其他平台
4. **manifest.json 仅在新增平台时修改** — 添加 `host_permissions` 中的域名

### 为什么不动导出逻辑？

- `background.js` → 流程编排（获取 tab → 注入脚本 → 提取数据 → 生成 markdown → 下载）
- `markdown-generator.js` → 数据转 markdown
- `download-manager.js` → Blob 下载 + `.md` 扩展名
- `sanitizer.js` → 文件名清理

这些是通用逻辑，对所有平台一视同仁。**任何平台的问题都应该通过配置层解决，而不是改逻辑层。**

### 新增平台 checklist

1. 在 `selectors.js` 中新增 `{platform}Config` 对象
2. 定义 `name`、`urlPatterns`、`selectors`、`features`
3. 将配置加入 `SELECTORS` 导出对象
4. 在 `manifest.json` 的 `host_permissions` 中添加域名
5. 测试导出

### 维护现有平台

当某平台页面改版导致选择器失效时：

1. 打开该平台的对话页面
2. 用浏览器 DevTools 找到实际 DOM 结构
3. 更新 `selectors.js` 中对应 config 的 `selectors` 字段
4. 仅此而已
