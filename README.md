# AI Chat Exporter

> 面向 AI 长对话的侧边栏大纲与 Markdown 导出工具

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-安装-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ai-chat-exporter/eplnkdnnbmmijjadnabdefmjnjgapigm)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**AI Chat Exporter** 帮你浏览、定位和保存 AI 长对话：在浏览器侧边栏生成对话大纲，点击标题快速跳转，并将当前对话导出为 Markdown 文件。

Exporter 是现在唯一维护的产品名称；**Pro 是扩展内的付费功能层，不是另一款插件**。原 AI Chat Export Pro 的大纲导航和局部导出能力已经合并到本仓库与同一个商店条目中。

## 核心功能

- **侧边栏对话大纲**：自动识别问题、回答和回答内标题。
- **点击快速定位**：从目录跳转到对应问题或答案位置。
- **阅读位置高亮**：长对话滚动时同步显示当前阅读位置。
- **完整 Markdown 导出**：免费导出当前对话，保留正文、代码块、思考过程和搜索结果等可读取内容。
- **Pro 局部导出**：勾选重要问题组，只导出选中的问题及其完整答案。
- **本地处理**：对话内容在浏览器本地读取和转换，不上传到开发者服务器。

## 免费版与 Pro

| 功能 | 免费版 | Pro |
| --- | :---: | :---: |
| 侧边栏大纲与定位 | ✅ | ✅ |
| 阅读位置高亮 | ✅ | ✅ |
| 完整 Markdown 导出 | ✅ | ✅ |
| 勾选问题组局部导出 | — | ✅ |

Pro 采用授权码解锁，无需注册账号、不绑定机器，激活状态保存在浏览器本地。

当前创始用户价为 **9.9 元人民币，终身使用当前及后续 Pro 功能**。后续新用户价格会随功能版本逐步调整，已购用户无需补差价。授权码属于数字商品，发放后不支持无理由退款；如遇重复付款或授权码无法激活，请联系开发者处理。

[购买或了解 Pro](https://wj.qq.com/s2/26957751/9rvt/)

## 支持平台

| 平台 | 网址 | 支持内容 |
| --- | --- | --- |
| DeepSeek | deepseek.com | 对话、思考过程、代码和搜索结果 |
| 腾讯元宝 | yuanbao.tencent.com | 对话、深度思考、参考链接和卡片内容 |
| ChatGPT | chatgpt.com | 对话、回答内标题和代码块 |
| 豆包 | doubao.com | 对话、回答内标题和搜索来源 |
| Gemini | gemini.google.com | 对话和草稿内容 |
| Grok | grok.com | 对话和 Markdown 内容 |
| Kimi | kimi.com / moonshot.cn | 对话、代码块和 Markdown 内容 |

## 安装

### Chrome 应用商店（推荐）

[前往 Chrome 应用商店安装 AI Chat Exporter](https://chromewebstore.google.com/detail/ai-chat-exporter/eplnkdnnbmmijjadnabdefmjnjgapigm)

商店版本会自动更新，适合绝大多数用户。

### GitHub Releases

1. 从 [Releases](https://github.com/Jeff-clouds/AI-Chat-Exporter/releases) 下载最新 `.zip` 文件并解压。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`。
3. 开启“开发者模式”，选择“加载已解压的扩展程序”。
4. 选择解压后的扩展文件夹。

### 本地开发

```bash
git clone https://github.com/Jeff-clouds/AI-Chat-Exporter.git
```

本项目无需额外构建，可直接在浏览器扩展管理页加载项目目录。

## 使用方法

1. 打开一个受支持的 AI 对话页面。
2. 点击浏览器工具栏中的 **AI Chat Exporter** 图标，打开侧边栏。
3. 点击大纲标题定位到对应内容，使用箭头展开或收起回答目录。
4. 点击“导出完整对话”保存 Markdown 文件。
5. Pro 用户可进入选择模式，勾选问题组后导出已选对话。

### ChatGPT 与豆包长对话说明

- **ChatGPT**：扩展会优先读取完整会话数据；如果页面暂时无法提供完整数据，则使用当前已加载的对话内容生成大纲与导出文件。
- **豆包**：为避免扩展擅自滚动页面或打断阅读，目录会随着你浏览对话逐步补全。导出时以已经加载并完成索引的内容为准。

如果目录内容暂时不完整，继续正常滚动原对话页面即可，无需重复打开侧边栏。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+Shift+O`（macOS 为 `Command+Shift+O`） | 打开或关闭侧边栏 |
| `Alt+O` | 展开或折叠全部大纲项 |
| `Alt+J` | 跳转到下一个标题 |
| `Alt+K` | 跳转到上一个标题 |

## 隐私

- 扩展仅在用户打开的受支持 AI 对话页面上读取内容，用于生成大纲和用户主动触发的本地导出。
- 对话内容不会上传到开发者服务器，也不会用于广告、分析或用户画像。
- 扩展仅在浏览器本地保存界面状态和 Pro 激活状态。

完整说明请查看[隐私政策](privacy-policy.md)。

## 开发与反馈

欢迎提交 [Issue](https://github.com/Jeff-clouds/AI-Chat-Exporter/issues) 或 Pull Request。

主要目录：

- `src/core/`：侧边栏、页面索引、授权状态与后台逻辑
- `src/config/`：各平台页面识别配置
- `src/export/`：Markdown 转换和文件下载
- `public/assets/`：扩展图标与公开资源

完整版本记录请查看 [CHANGELOG.md](CHANGELOG.md) 和 [GitHub Releases](https://github.com/Jeff-clouds/AI-Chat-Exporter/releases)。

## 作者

- Jeff（大王）
- [小红书：王路飞汐汐](https://www.xiaohongshu.com/user/profile/5cb950aa0000000011035bef)（206524823）
- [即刻：王路飞汐汐](https://okjk.co/uFbsJq)

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。
