# AI Chat Exporter 架构总览

> 当前基线：v2.1.3
> 平台开发的强制前置文档：[PLATFORM_ARCHITECTURE_GUIDE.md](PLATFORM_ARCHITECTURE_GUIDE.md)

本文件只描述代码模块边界。ChatGPT 与豆包的真实路由、虚拟化、数据源、稳定 ID、踩坑案例和现场验收，以 PLATFORM_ARCHITECTURE_GUIDE.md 为准。

## 核心架构

AI Chat Exporter 采用“平台数据源 -> 归一化消息索引 -> 目录 / 跳转 / 导出”的结构。

~~~mermaid
flowchart LR
    Host["AI Web App"]
    Bridge["ChatGPT MAIN bridge"]
    Content["Content lifecycle"]
    Index["ConversationIndex"]
    Pipeline["Pipeline"]
    Panel["Side Panel"]
    Background["Service Worker / Export"]

    Host --> Bridge
    Host --> Content
    Bridge --> Index
    Content --> Index
    Index --> Pipeline
    Pipeline --> Panel
    Background --> Index
~~~

## 模块责任

| 文件 | 责任 |
|---|---|
| manifest.json | MV3 权限、Side Panel、ChatGPT document_start MAIN bridge |
| src/core/chatgpt-api-bridge.js | ChatGPT 页面运行时会话捕获与 route epoch |
| src/core/conversation-index.js | ChatGPT / 豆包稳定 ID 消息索引 |
| src/core/content.js | 侧栏生命周期、SPA 路由、观察器和清理 |
| src/core/pipeline.js | 统一目录模型与标题合并 |
| src/core/sidepanel.js | 当前 tab / URL / requestToken、UI 和跳转 |
| src/core/background.js | 按需注入、导出锁、授权与下载 |
| src/config/selectors.* | 目录 DOM selector 配置 |
| src/export/config/selectors.js | DOM 导出 selector 配置 |

## 三类平台路径

| 路径 | 平台 | 数据策略 |
|---|---|---|
| Runtime + DOM hybrid | ChatGPT | current branch 主数据 + mounted DOM heading / locator |
| Passive virtual index | 豆包 | 用户浏览时按 data-message-id 累计 |
| Direct DOM pipeline | DeepSeek、元宝、Gemini、Grok、Kimi | 当前挂载 DOM 的 nested / flat selector 提取；无完整历史索引 |

2026-07-16 真实 Chrome 已确认 Gemini 的 v2.1.3 旧 selector 全部为 0；当前页面改为 `USER-QUERY`、`MODEL-RESPONSE` 等 custom elements。该平台在修复并重新验收前不得视为当前可用。

## 生命周期

- 页面分析由侧栏打开或用户主动导出触发。
- 侧栏 Port 是观察生命周期所有者。
- 侧栏关闭后清理 observer、scroll listener、timer、pending request 和索引连接。
- 导出按 tab 加锁，只做当前操作所需的快照。
- 异步目录结果必须匹配当前 tab、URL、会话和请求令牌。

## 开发入口

任何平台相关修改从 PLATFORM_ARCHITECTURE_GUIDE.md 的“0. 先读这一页”“开发决策树”“强制开发流程”和对应平台卡开始。

旧版“配置即逻辑、ChatGPT 使用 nested DOM、滚动后读取完整页面”的描述已经失效，不得继续作为开发依据。
