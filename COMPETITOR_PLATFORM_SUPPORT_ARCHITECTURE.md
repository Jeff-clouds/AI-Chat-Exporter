# AI 对话插件竞品的平台支持架构

> 核验日期：2026-07-16  
> 目标：分析竞品如何寄生或连接 ChatGPT、Gemini、Claude 等平台，并把公开证据转化为可执行的架构判断。  
> 边界：公开仓库只能证明对应提交的实现，不能自动证明 2026 年商店生产版仍使用相同 endpoint 或 selector；闭源产品只记录其官方声明，不反推私有源码。

## 1. 证据等级

| 等级 | 含义 | 可以得出的结论 |
|---|---|---|
| A | 官方公开源码、manifest、具体实现文件 | 可以描述该版本的权限、注入时机、数据路径和存储方式 |
| B | 官方商店页、官网、隐私说明 | 可以描述产品行为和公开承诺，不能确认内部 selector 或 API |
| C | 根据 A/B 作出的架构推断 | 只能作为设计参考，必须明确写“推断” |

## 2. 六种典型架构

| 竞品 | UI 入口 | 数据权威源 | 平台适配方式 | 生命周期与存储 | 完整性边界 |
|---|---|---|---|---|---|
| Superpower ChatGPT | 直接增强 ChatGPT 页面 | ChatGPT 会话 API graph | 单平台深度 adapter | 常驻 content script；分页同步到 `chrome.storage.local` | 当前分支可从 graph 恢复；依赖非公开接口 |
| ChatGPT Exporter（yang-shuohao） | popup / 右键菜单 | 当前页面 DOM | 单平台极简 selector | 点击时 `executeScript`，无常驻观察 | 只能保证当前已挂载内容 |
| ChatHub | 扩展自己的 side panel / app | 各模型 Web API 或公共 API | 每个平台独立 bot adapter | service worker、side panel、本地历史；必要时用真实平台标签代理请求 | 它创建自己的对话，不等于读取用户当前宿主历史 |
| insidebar.ai | side panel 内嵌真实网站 | 各平台当前 DOM | 每个平台独立 extractor，共享规范化与 IndexedDB | 多平台 content script + 手动保存 + 本地历史库 | 保存时抓当前可见/已挂载内容；iframe 权限面较大 |
| amazingpaddy / AI Chat Exporter | 宿主页面导出按钮 | Gemini DOM；ChatGPT 原生 Copy/剪贴板 | 同产品内不同平台走不同路径 | content script；导出时允许主动滚动 | 以显式操作和页面扰动换取更多挂载内容 |
| rashidazarang / ChatGPT Chat Exporter | userscript / console | 当前 DOM | canonical engine + provider adapter + selector cascade | 无服务端；fixture 验证多种分发产物 | fallback 增强兼容性，但仍不能证明虚拟历史完整 |

## 3. Superpower ChatGPT：会话图 + 本地同步

公开 manifest 显示它是 MV3 扩展，在 ChatGPT 页面从 `document_start` / `document_end` 注入拦截与增强模块，不是用户点击后才临时扫描。[^1][^2]

其公开 API 层直接调用 ChatGPT 的 `backend-api/conversations` 和 `backend-api/conversation/{id}`，分页同步历史会话并写入本地存储。导出时从 conversation graph 的 `current_node` 沿 `parent` 回溯当前分支，再按角色生成 JSON、TXT 或 Markdown。[^3][^4][^5]

架构形态：

~~~text
ChatGPT 会话列表 / 单会话 graph
        -> 分页同步与 current_node 当前分支
        -> chrome.storage.local 本地副本
        -> 搜索 / 文件夹 / tree map / 批量导出
~~~

可借鉴点：

- 长会话和分支的权威源是 conversation graph，不是当前可见 DOM。
- 本地缓存需要同步状态、更新时间、刷新规则和失败回退。
- 官方商店专门提供 Quick Sync，只同步最近 100 条来改善性能，说明“完整历史同步”本身也有明确成本。[^6]

不能照搬的部分：公开仓库仍出现旧 `chat.openai.com` 等历史信息，适合证明架构模式，不适合当成当前 endpoint 合约。

## 4. ChatGPT Exporter：点击时 DOM 快照

该开源扩展使用 popup、service worker、`activeTab` 和 `scripting`。平时没有常驻内容脚本，用户点击 popup 或右键菜单后才在当前标签执行导出函数。[^7][^8]

导出函数查询 `[data-message-author-role]`，分别读取用户和助手内容，再递归转换为 Markdown。[^8]

架构形态：

~~~text
用户点击 Export
        -> 向 activeTab 临时注入
        -> 读取当前 DOM
        -> 转 Markdown / 下载
        -> 操作结束
~~~

优势是权限小、空闲成本接近零、故障面容易解释。代价是没有会话 API、本地索引或虚拟窗口累计，只能承诺“当前已经加载的页面内容”。

这个案例说明：如果产品只卖一次性导出，按需快照是合理架构；如果产品卖实时目录和长会话导航，就必须承担持续生命周期管理，不能用同一套性能标准比较。

## 5. ChatHub：统一 UI，不统一数据通道

ChatHub 把多个模型放进自己的 side panel/app，而不是主要给原宿主页面加目录。公开源码中，每个平台拥有独立 bot/client：ChatGPT Web 模式调用其 Web endpoint 并解析 SSE；Claude Web 模式调用 Claude 的组织、会话和 append message 接口；Gemini 另有官方 SDK/API Key 路径。[^9][^10][^11][^12]

扩展直接请求失败时，ChatHub 会寻找或创建一个 ChatGPT 标签页，通过内容脚本代理 fetch，并处理就绪超时和 403 刷新。[^13]

架构形态：

~~~text
共享 side panel / 消息模型 / 历史 UI
        -> ChatGPT Web adapter
        -> Claude Web adapter
        -> Gemini API adapter
        -> 其他模型 adapter
~~~

最重要的结论是：**多平台可以统一 UI 和消息模型，但不能统一真实数据通道。** 平台 adapter 不是架构失败，而是宿主差异的必要表达。

同时要注意，ChatHub 创建和维护自己的对话状态；它不是“读取用户正在看的原宿主历史会话”的完全同类竞品。

## 6. insidebar.ai：真实网站 iframe + 平台 extractor + IndexedDB

insidebar.ai 为 ChatGPT、Claude、Gemini、Grok、DeepSeek 分别注册内容脚本和 CSS，同时复用会话工具与语言检测模块。[^14]

它通过 declarativeNetRequest 删除子框架响应的 `X-Frame-Options` 和 `Content-Security-Policy`，把真实 AI 网站放入 side panel iframe，继续使用用户现有 cookie 登录态。[^15]

保存会话时，各平台 extractor 从 DOM 读取角色和内容，归一化后写入本地 IndexedDB；本地历史层维护 provider、URL、时间戳、搜索文本、容量错误和导入导出。[^16][^17][^18]

可借鉴点：

- provider adapter 负责平台 selector；共享层负责消息模型、搜索和存储。
- 保存记录必须有 provider 与 conversation identity，不能只用标题或全局文本 hash。

风险：修改 CSP/X-Frame-Options 会显著扩大权限和宿主安全面；全页面 MutationObserver 若缺少明确断开和 route epoch，也容易产生重复初始化或持续扫描。这种聚合侧栏架构不适合直接搬到轻量目录/导出产品。

## 7. amazingpaddy：同一产品允许不同平台走不同方案

该扩展为 ChatGPT 和 Gemini 注册独立 content script。Gemini 从 `conversation-container` 内读取 `user-query`、`model-response` 和 `message-content .markdown`，再用 Turndown 转 Markdown。[^19][^20]

Gemini 导出前会主动把聊天滚动容器拉到顶部，最多尝试 60 次并等待节点数量稳定；ChatGPT 则复用宿主 Copy 按钮和剪贴板获取格式化内容。[^20][^21]

这证明同一个“导出”产品可以合理采用：

- Gemini：DOM + HTML to Markdown。
- ChatGPT：宿主 Copy + clipboard。
- 共享层：选择、Markdown、下载和 UI。

自动滚动只适合用户明确触发的导出，而且必须说明它会改变页面位置和增加等待。它不适合实时目录刷新，更不应在后台用来制造“完整性”。

## 8. canonical engine + provider adapter + fallback cascade

rashidazarang 的公开项目把 ChatGPT 与 Gemini 导出器从一个 canonical extraction engine 生成；平台层分别识别 ChatGPT 的 `data-message-author-role` 和 Gemini 的 `user-query` / `model-response`，再按 data attribute、ARIA、semantic HTML、heuristic 建立多级 fallback。[^22]

它的真正价值不是“一个选择器兼容所有平台”，而是：

1. provider adapter 保留平台语义；
2. canonical engine 保证多种分发产物使用同一提取规则；
3. fixture 和产物一致性测试防止修改一个版本却遗漏另一个；
4. heuristic 只放在最后一级，不让宽泛命中伪装成正确轮次。

## 9. 闭源竞品能确认什么

以下只能作为 B 级产品声明：

- Universal Chat Exporter 声称页面加载时零注入，只有点击 Export 才运行，并在内存中本地处理；没有公开源码，不能确认其 DOM/API 细节。[^23]
- SaveAIChat 同样声称用户主动操作时本地导出多平台对话；不能进一步推导其内部 selector。[^24]
- Monica 是自有账号和后端模型服务，更接近跨站 AI 助手，不适合作为宿主页面目录的数据架构对标。[^25]

## 10. 对平台支持架构的指导结论

### 10.1 目录与完整导出应分开设计

目录要求低扰动、实时、可定位和严格路由隔离；完整导出可以在用户明确触发后接受额外 API 请求、分页或经过说明的有限滚动。不要为了导出完整性，把重操作塞进持续目录刷新。

### 10.2 平台层必须保留四类责任

| 平台层责任 | 必须回答的问题 |
|---|---|
| route identity | 当前是哪个 provider、agent、conversation 和分支？ |
| message boundary | 什么是一轮 user / assistant，thinking 和工具属于哪里？ |
| authority | 数据来自宿主 API、当前 DOM、宿主 Copy，还是已观察缓存？ |
| lifecycle | 流式、滚动、A -> B、关闭 UI 时，旧状态如何失效？ |

共享层只负责规范化消息、格式生成、选择状态、下载和通用 UI。共享层不能替平台层猜测角色和完整性。

### 10.3 DOM 必须声明范围

| 数据路径 | 可以承诺 | 不能自动承诺 |
|---|---|---|
| 当前 DOM 快照 | 当前已挂载内容 | 虚拟列表中的完整历史 |
| 宿主 Copy | 宿主当次序列化的内容 | 其他轮次、当前分支或全部历史 |
| 用户滚动后的缓存 | 已观察窗口累计 | 从未挂载过的消息 |
| conversation graph | 已校验的当前分支 | 接口长期稳定、全部历史分支 |
| 自动滚动 | 本次操作制造出的更多挂载内容 | 无扰动、低延迟和长期稳定 |

### 10.4 MutationObserver 只能触发增量更新

不要在每次 character mutation 后全量扫描大页面。Observer 应只负责触发节流任务，再按稳定 message identity 更新已有记录；route 切换或功能关闭时必须断开旧 observer、timer 和 pending request。

### 10.5 权限和隐私说明要逐项对应

`activeTab + scripting`、常驻 host permission、本地历史、clipboard、宿主 API 登录态、iframe header 修改不是同一种风险。“本地运行”不能替代逐项说明每个权限为什么存在、数据活多久、何时清理。

## 11. 最小决策模板

新增或修复一个平台前，先写清：

~~~text
平台：
目录权威源：
完整导出权威源：
会话身份：
消息稳定身份：
thinking / tool / final 的边界：
是否虚拟化：
允许的页面扰动：
缓存 key / authority / lifetime / cleanup：
A -> B -> A 的失效规则：
公开承诺的完整性范围：
~~~

如果这些字段不能回答，说明目前只有 selector 候选，还没有平台架构。

## 脚注

[^1]: [Superpower ChatGPT manifest](https://github.com/saeedezzati/superpower-chatgpt/blob/main/manifest.json)
[^2]: [Superpower 注入入口](https://github.com/saeedezzati/superpower-chatgpt/blob/main/scripts/interceptor/loadScript.js)
[^3]: [Superpower ChatGPT API 层](https://github.com/saeedezzati/superpower-chatgpt/blob/main/scripts/content/api.js)
[^4]: [Superpower ChatGPT 导出实现](https://github.com/saeedezzati/superpower-chatgpt/blob/main/scripts/content/export.js)
[^5]: [Superpower ChatGPT 自动同步](https://github.com/saeedezzati/superpower-chatgpt/blob/main/scripts/content/autoSave.js)
[^6]: [Superpower ChatGPT - Chrome Web Store](https://chromewebstore.google.com/detail/superpower-for-chatgpt/amhmeenmapldpjdedekalnfifgnpfnkc)
[^7]: [yang-shuohao/chatgpt-export manifest](https://github.com/yang-shuohao/chatgpt-export/blob/main/manifest.json)
[^8]: [yang-shuohao/chatgpt-export popup](https://github.com/yang-shuohao/chatgpt-export/blob/main/popup.js)
[^9]: [ChatHub repository](https://github.com/chathub-dev/chathub)
[^10]: [ChatHub ChatGPT Web client](https://github.com/chathub-dev/chathub/blob/main/src/app/bots/chatgpt-webapp/client.ts)
[^11]: [ChatHub Claude Web adapter](https://github.com/chathub-dev/chathub/blob/main/src/app/bots/claude-web/index.ts)
[^12]: [ChatHub Gemini API adapter](https://github.com/chathub-dev/chathub/blob/main/src/app/bots/gemini-api/index.ts)
[^13]: [ChatHub request proxy](https://github.com/chathub-dev/chathub/blob/main/src/app/bots/chatgpt-webapp/requesters.ts)
[^14]: [insidebar.ai manifest](https://github.com/xiaolai/insidebar-ai/blob/main/manifest.json)
[^15]: [insidebar.ai DNR rules](https://github.com/xiaolai/insidebar-ai/blob/main/rules/bypass-headers.json)
[^16]: [insidebar.ai ChatGPT extractor](https://github.com/xiaolai/insidebar-ai/blob/main/content-scripts/chatgpt-history-extractor.js)
[^17]: [insidebar.ai Claude extractor](https://github.com/xiaolai/insidebar-ai/blob/main/content-scripts/claude-history-extractor.js)
[^18]: [insidebar.ai history manager](https://github.com/xiaolai/insidebar-ai/blob/main/modules/history-manager.js)
[^19]: [amazingpaddy/ai-chat-exporter manifest](https://github.com/amazingpaddy/ai-chat-exporter/blob/main/manifest.json)
[^20]: [amazingpaddy Gemini implementation](https://github.com/amazingpaddy/ai-chat-exporter/blob/main/src/content_scripts/gemini.js)
[^21]: [amazingpaddy/ai-chat-exporter README](https://github.com/amazingpaddy/ai-chat-exporter)
[^22]: [rashidazarang/chatgpt-chat-exporter](https://github.com/rashidazarang/chatgpt-chat-exporter)
[^23]: [Universal Chat Exporter - Chrome Web Store](https://chromewebstore.google.com/detail/export-ai-chat-claude-cha/gfhigpoceginmhbpncohekbkipabidhe)
[^24]: [SaveAIChat - Chrome Web Store](https://chromewebstore.google.com/detail/saveaichat-%E2%80%93-export-chatg/geldeioopgibgcimhnfebibladfecbdk)
[^25]: [Monica - Chrome Web Store](https://chromewebstore.google.com/detail/monica-your-ai-copilot-po/ofpnmcalabcbjgholdjcjblkibolbppb)
