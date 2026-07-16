# AI Chat Exporter 寄生平台架构与开发前置指南

> 状态：首期完成，聚焦 ChatGPT 与豆包
> 代码基线：v2.1.3 / commit 8d69d53
> 最近核验：2026-07-16
> 适用范围：平台适配、目录、跳转、导出、性能、路由、缓存和侧边栏生命周期相关改动

## 0. 先读这一页再改代码

AI Chat Exporter 不是拥有页面和数据的独立产品，而是寄生在第三方 AI Web App 上的浏览器扩展。宿主平台可以随时改变路由、DOM、网络请求、虚拟列表、流式渲染和安全策略。插件代码正确，不代表它符合当前平台现实。

任何涉及 ChatGPT 或豆包的开发，开始前必须回答：

1. 当前会话的唯一身份是什么？
2. 当前 DOM 是完整会话，还是虚拟列表的一个挂载窗口？
3. 数据来自宿主运行时、当前 DOM、历史缓存，还是三者合并？
4. 异步结果返回时，标签页、URL、会话 ID 和路由代次是否仍然一致？
5. 侧边栏关闭后，观察器、滚动监听、计时器、请求和缓存是否被释放？
6. “目录完整”和“页面定位可用”分别由什么证据保证？
7. 本次结论来自真实登录态长会话，还是只来自 fixture、短会话或代码推断？

如果任何一项答不清楚，先做平台审计，不要直接加选择器或定时器。

### 不可破坏的六条原则

- DOM 是视图窗口，不是会话数据库。
- route identity 是数据隔离边界，不是 UI 细节。
- 稳定 message ID 优先于 turn 序号，turn 序号优先于文本和索引。
- ChatGPT 的完整文本与页面标题来自不同数据面，必须有控制地合并。
- 豆包不得为了“完整”而自动滚动用户页面；完整性必须诚实标注。
- 侧边栏未使用时，不应持续给宿主页面制造观察、扫描或网络负担。

## 1. 证据等级与事实写法

平台内部 Web App 架构通常没有官方文档。文档必须区分证据，防止把推断写成事实。

| 等级 | 含义 | 可以支持什么结论 |
|---|---|---|
| A | Chrome / 平台官方文档 | 扩展执行世界、注入时机、公开分享等稳定边界 |
| B | 本项目真实登录态标签现场审计 | 当前 DOM、路由、挂载窗口、选择器和实际行为 |
| C | 独立开源实现或历史审计交叉佐证 | 选择器候选、内部端点候选、漂移趋势 |
| D | 从代码或短页面推断 | 只能写“待现场验证”，不能写成平台事实 |

事实记录格式：

~~~text
结论：
证据等级：
验证日期：
验证 URL 类型：普通会话 / 项目会话 / 分享页
长会话规模：
首 / 中 / 末锚点：
阻塞条件：
~~~

公共模型 API 不等于网页历史会话 API。OpenAI、火山引擎等开发者 API 的能力不能直接证明 ChatGPT 或豆包网页内部如何存储和加载历史。

## 2. 全局系统架构

### 2.1 执行世界与模块边界

~~~mermaid
flowchart LR
    Host["宿主 AI Web App<br/>路由 / DOM / 原生请求 / 虚拟列表"]
    Main["MAIN world 极小桥<br/>仅 ChatGPT"]
    Isolated["ISOLATED content<br/>生命周期 / 路由 / DOM 观察"]
    Index["ConversationIndex<br/>稳定 ID 归一化缓存"]
    Pipeline["Pipeline<br/>目录模型 / 标题合并"]
    Panel["Side Panel<br/>请求令牌 / UI / 跳转"]
    Worker["Service Worker<br/>按需注入 / 导出 / 下载"]

    Host -->|"原生 fetch 响应"| Main
    Main -->|"最小化 current branch<br/>window.postMessage"| Index
    Host -->|"当前挂载 DOM / scroll / mutation"| Isolated
    Isolated --> Index
    Index --> Pipeline
    Pipeline --> Panel
    Panel -->|"requestToken + URL"| Isolated
    Worker -->|"主动导出时一次快照"| Index
    Worker --> Panel
~~~

Chrome 官方边界：

- ISOLATED world 与页面共享 DOM，但 JS 变量彼此隔离。
- MAIN world 与页面共享 JS 环境，适合捕获宿主自身 fetch/history，但会受到宿主 CSP 和页面脚本影响。
- MAIN bridge 只做运行时数据捕获；平台 DOM、缓存、业务判断和 Chrome API 留在 ISOLATED world。
- 两个世界之间只传递最小化、可校验的数据。

当前对应代码：

| 边界 | 文件 | 责任 |
|---|---|---|
| MAIN bridge | src/core/chatgpt-api-bridge.js | 捕获 ChatGPT 原生会话请求，压缩当前分支，维护 route epoch |
| ISOLATED lifecycle | src/core/content.js | 侧栏生命周期、SPA 路由、目录刷新合并、清理 |
| Normalized index | src/core/conversation-index.js | ChatGPT / 豆包稳定 ID 缓存与统一消息模型 |
| Outline model | src/core/pipeline.js | 问题组、回答标题、API/DOM 标题合并 |
| Request owner | src/core/sidepanel.js | 当前 tab、URL、requestToken、过期结果拒绝 |
| Export owner | src/core/background.js | 按需注入、单 tab 导出锁、统一数据导出 |
| MAIN injection | manifest.json | ChatGPT document_start + world MAIN |

### 2.2 三个数据面不能混淆

| 数据面 | 优势 | 缺点 | 正确用途 |
|---|---|---|---|
| 宿主会话数据 | 完整文本、顺序、分支关系 | 内部接口高漂移，可能失败或超时 | ChatGPT 当前分支主数据 |
| 当前挂载 DOM | 真实 HTML、标题、可定位节点、最新流式内容 | 虚拟化后不完整，路由切换时可能残留旧节点 | 标题、跳转、增量补充 |
| 扩展本地索引 | 跨挂载窗口保留稳定记录 | 必须正确隔离会话和生命周期 | 目录、导出、去重、顺序 |

正确方向是：

~~~text
平台数据源 -> 稳定 ID 归一化 -> ConversationIndex -> 目录 / 跳转 / 导出
~~~

错误方向是：

~~~text
滚动到底 -> 读取当前 DOM -> 假设得到完整会话
~~~

## 3. 统一身份与状态模型

### 3.1 路由隔离键

完整的目标模型中，任何异步目录结果至少要同时匹配：

~~~text
tabId
current URL
conversationId
routeGeneration / routeEpoch
requestToken
~~~

不同层负责不同校验：

| 层 | 必须校验 |
|---|---|
| Side Panel | sender.tab.id、requestToken、diagnostics.url |
| Content | extraction 起始 URL、活动 requestToken、活动 request URL |
| ConversationIndex | conversationId、routeGeneration、pending URL |
| ChatGPT MAIN bridge | conversationId、routeEpoch、requestRouteUrl |

只检查其中一个不够。React pushState 后，sender.tab.url、location.href、旧 DOM 和旧请求可能短时间不同步。

实现状态必须单独核对：ChatGPT 已有 conversationId 与 generation/epoch；豆包 v2.1.3 仍按完整 `location.href` 隔离，尚未规范化为 `/chat/{id}` 会话键。表中的字段是跨平台目标约束，不代表每个平台已经全部实现。

### 3.2 统一消息记录

索引记录的概念字段：

~~~text
id              稳定消息 ID；不得优先使用数组索引
turnId          平台 turn/message 身份
turnNumber      页面顺序辅助信息，不是跨会话主键
role            user / assistant
text            归一化纯文本
markdown        保留换行的源文本，用于标题解析与导出
html            当前 DOM 的真实富文本（存在时）
offset          豆包虚拟窗口中的页面相对位置，仅作启发式排序 / 定位辅助
source          api / dom
sequence        本地首次观察顺序
~~~

排序优先级：

1. 平台可证明的 turnNumber。
2. 同一虚拟滚动容器中的 offset。
3. 当前窗口 windowIndex。
4. 本地 sequence。

禁止用“第几个节点”作为跨刷新、跨滚动或跨会话身份。

## 4. ChatGPT 平台架构卡

### 4.1 已证实的平台现实

| 项目 | 当前结论 | 证据 |
|---|---|---|
| 会话路由 | 普通会话含 /c/{conversationId}；项目/GPT 页面也可在嵌套路径中提取 /c/{id} | 真实标签 + currentConversationId |
| 完整分支数据 | 登录态页面会请求 /backend-api/conversation/{id}，响应含 mapping 与 current_node | 本项目运行时与第三方实现交叉佐证 |
| 长会话 DOM | 只挂载一个 turn 窗口，不代表全会话 | 2026-07-16 真实 Chrome |
| turn 容器 | SECTION[data-testid=conversation-turn-N][data-turn] | 2026-07-16 真实 Chrome |
| 稳定消息 ID | data-message-id 位于 turn 内部消息节点，不一定在 SECTION 上 | 2026-07-16 真实 Chrome |
| 一个回答 turn | 可能含进度 / commentary 与最终回答多个 message-id | 真实 Chrome + 当前代码注释 |
| 标题 | 最可靠的是当前挂载回答 DOM 的 H1-H6；API Markdown 可作为补充 | 本项目回归与现场 |
| 流式 | 同一 assistant turn 会持续变更，不能把每次 mutation 当新回答 | 平台行为 + observer 设计 |

2026-07-16 现场样本：

~~~text
页面标题：BOBO/YOGO - Figma Variable 插件
当前只挂载：conversation-turn-30 到 conversation-turn-34
挂载 turn：5
user turn：2
assistant turn：3
assistant 标题：30
data-message-id：7
~~~

这说明两个关键事实：

1. 30 以前的历史 turn 不在当前 DOM。
2. assistant SECTION 数量与 message-id 数量不相等，一个回答区域可能包含多个消息记录。

### 4.2 ChatGPT 数据流

~~~mermaid
sequenceDiagram
    participant Page as ChatGPT 页面
    participant Bridge as MAIN bridge
    participant Index as ConversationIndex
    participant Content as Content lifecycle
    participant Panel as Side Panel

    Page->>Bridge: 原生 fetch /backend-api/conversation/{id}
    Bridge->>Bridge: compact mapping 到 current_node 当前分支
    Bridge-->>Index: postMessage(payload, conversationId, routeEpoch, routeUrl)
    Page-->>Index: 当前挂载 turn / message-id / H1-H6
    Panel->>Content: getOutline(requestToken, URL)
    Content->>Index: refresh(observe=true, awaitApi=false)
    Index-->>Content: 先返回有界 DOM 索引
    Index-->>Content: API 到达后触发 index-updated
    Content-->>Panel: outline(requestToken, diagnostics.url)
    Panel->>Panel: 只接受当前 tab + token + URL
~~~

### 4.3 为什么必须同时使用 API 与 DOM

API / runtime data 负责：

- 当前分支完整消息顺序。
- 未挂载的历史 turn。
- 原始 Markdown 换行。
- 会话标题。

DOM 负责：

- 当前真正渲染的 H1-H6。
- 可滚动定位的节点。
- API 缓存之后的新流式内容。
- API 暂时不可用时的有界降级。

合并规则：

- 同一稳定 message ID 下，API Markdown 不得被扁平 DOM text 覆盖。
- DOM heading 优先用于页面目录，API Markdown heading 用于补全。
- 用 level + normalized text 去重。
- API 记录是 canonical，但不能删除 API 缓存之后新挂载的 DOM-only turn。
- turnNumber 只用于顺序和 fallback；跨会话绝不能只按 turnNumber 复用标题。

### 4.4 ChatGPT 状态机

~~~mermaid
stateDiagram-v2
    [*] --> ColdRoute
    ColdRoute --> MountedWindow: 页面挂载当前窗口
    ColdRoute --> ApiPending: 原生或显式会话请求
    MountedWindow --> PartialReady: 有界 DOM 可生成临时目录
    ApiPending --> CanonicalReady: 当前 route 的非空 payload
    PartialReady --> CanonicalReady: API 覆盖完整文本并保留 DOM 标题
    ApiPending --> PartialReady: API 超时 / 失败且 DOM 身份可信
    MountedWindow --> RouteReset: pushState / replaceState / popstate
    CanonicalReady --> RouteReset: 切换会话
    RouteReset --> ColdRoute: 清空 route 级状态并提升 generation
~~~

RouteReset 必须：

- 递增 route generation / epoch。
- 取消或拒绝旧 pending request。
- 清空 route 级 heading cache、DOM identity 和请求令牌。
- 记录旧 route 的 mounted identities，避免 React 过渡残影被当作新会话。
- 等待新 conversationId 的 payload 或新 DOM 身份证据。

### 4.5 ChatGPT 允许与禁止

允许：

- 在 MAIN world 用极小桥捕获宿主自己的单会话请求。
- 只压缩 current_node 当前分支，限制缓存会话数和 TTL。
- 在当前挂载窗口做有界扫描。
- 侧栏打开时观察，关闭时完全清理。
- API 失败时显示有边界的降级状态。

禁止：

- 对长会话做全页 querySelectorAll 后宣称完整。
- 用滚动加载模拟全量导出。
- 用固定延时替代 route identity 证据。
- 只按 turnNumber 缓存 heading。
- 让上一个 URL 的迟到 payload 更新当前目录。
- 在 API 成功后跳过 DOM heading 合并。
- 为解决空目录而恢复无界观察器或高频全页扫描。

### 4.6 ChatGPT 开发验收

每次相关改动至少验证：

| 场景 | 必须观察的结果 |
|---|---|
| 冷启动首次打开 A | 不依赖第二次打开；目录从空到部分/完整有明确状态 |
| 首次打开 B | 不显示 A 的问题、标题或缓存 |
| A -> B -> A | 三次结果分别绑定正确 URL 和 conversationId |
| 快速连续切换 | 迟到响应被丢弃，不闪回旧目录 |
| 长会话顶部 / 中部 / 底部 | DOM 数量可变化，索引身份不重复、不丢 canonical 数据 |
| 回答流式生成 | 同一 message/turn 更新，不生成重复问题组 |
| API 超时 / 403 / 空 mapping | 页面不被卡死，降级范围诚实 |
| 侧栏关闭 | observer、scroll、timer、port、pending request 清理 |
| 扩展升级后旧标签 | 旧 singleton 被版本号替换；必要时明确要求刷新页面 |

当前重要未决风险：

- “第一次打开会话不出目录、第二次打开才出现”曾在真实使用中出现。v2.1.3 的单元测试和结构检查不能单独证明此问题已消失。任何后续修复必须用全新会话冷打开验证，不能只复用已缓存页面。

## 5. 豆包平台架构卡

### 5.1 已证实的平台现实

| 项目 | 当前结论 | 证据 |
|---|---|---|
| 会话路由 | /chat/{numericConversationId} | 固定审计链接与真实页面 |
| 虚拟列表 | 页面使用虚拟滚动，滚动会挂载和回收消息窗口 | 2026-06 登录态审计与本项目历史 |
| 候选稳定身份 | data-message-id 是当前最有价值的候选消息身份，但不自动证明节点角色 | 登录态审计与当前代码 |
| 被动索引主路径 | 扫描所有 data-message-id，再用后代用户气泡 class 判断 user；未命中即暂按 assistant | conversation-index.js；存在 system/tool/card 误分类风险 |
| DOM fallback | send-msg-bubble、flow-markdown-body、conversation-page-message-host 等 | selector 配置与历史审计；不是主索引的扫描边界 |
| 完整会话 API | 尚无可重复、安全依赖的证据 | 待现场 Network/runtime 复验 |
| 当前隔离键 | 完整 location.href 变化即清空索引 | 当前代码；query 变化也会误清同一会话 |
| 完整性 | 只能保证“侧栏打开期间、扩展实际捕获窗口的累计覆盖”，不能默认全量 | 被动索引设计 |

历史现场证据：

- 2026-06-19：登录态测试通过，但出现 4 个问题节点、2 个回答节点，只提取出 2 组会话。这已经说明按 question/answer 数量配对不可靠。
- 2026-06-25：选择器审计通过。
- 2026-07-16：Chrome 对测试会话的页面读取连续超时。
- 2026-07-16：Codex 内置浏览器成功打开登录态 `/chat/33289229921282?channel=google_sem`，标题为“主对话 - 豆包”；截图确认回答正文已经渲染，人工向上滚动可看到同一回答的更早段落。
- 同一页面的完整 DOM snapshot、有界 Playwright evaluate 与轻量 CDP Runtime.evaluate 均连续超时并重置连接；可见交互树只稳定暴露按钮、输入框等控件，未暴露回答正文结构。

因此，本次可以确认“真实会话已加载、回答可滚动”，但不能把历史 selector 重新升级为 2026-07-16 的现场 DOM 合约。结构化读取超时是“重页面自动化验证边界”，不是“豆包 DOM 已失效”或“某个 selector 已失效”的证据。

### 5.2 豆包数据流

~~~mermaid
flowchart LR
    Panel["用户打开 Side Panel"]
    Inject["按需注入 content / index<br/>豆包不是 manifest 常驻 content script"]
    User["用户主动浏览 / 滚动"]
    Window["豆包虚拟挂载窗口"]
    Nodes["data-message-id 节点<br/>用户气泡 / 回答 host"]
    Fingerprint["role + text + htmlLength 指纹"]
    Cache["ConversationIndex<br/>按 message-id upsert"]
    Ordered["offset / windowIndex / sequence 排序"]
    Output["目录 / 已观察范围导出"]

    Panel --> Inject
    Inject --> Window
    User --> Window
    Window --> Nodes
    Nodes --> Fingerprint
    Fingerprint --> Cache
    Cache --> Ordered
    Ordered --> Output
~~~

观察机制：

- MutationObserver 监听 childList、subtree、characterData。
- scroll listener 使用 passive 模式。
- 连续滚动采用 leading + trailing throttle：滚动中约每 220ms 捕获一次，停止后补最后一次。
- mutation 默认延迟约 500ms 合并。
- 相同 message-id 在 `role + text + innerHTML.length` 指纹可检测到变化时更新，不新增重复记录；同文本、同 HTML 长度的结构变化仍可能漏检。
- 导出独立调用只做一次快照，不创建常驻 observer / scroll listener。

当前 fallback 与注入边界：

- 豆包不在 manifest 的 declarative content scripts 中；首次打开侧栏或主动导出时才通过 `chrome.scripting` 按需注入。这一层直接影响冷启动首开速度和失败模式。
- 被动索引未形成 conversation 时，目录会回退到通用 DOM selector，导出会回退到 `extractUnifiedData()`。
- fallback 结果当前不一定带有统一的覆盖范围元数据，因此“空索引回退却被误当完整”仍是待修风险。
- 目录与导出的问答归组尚未完全统一：目录允许一个 user 后吸收多个 assistant 标题，索引导出则遇到第一个 assistant 后清空 pending user。`user -> progress -> final`、`user -> user -> assistant` 必须单独验收。
- 初始化时真实聊天 scroller 若尚未挂载，当前实现会退回 `document.body`；宽泛的 `[class*="scroller"]` 也可能选错容器。后续真实 scroller 出现或被 SPA 重建时，当前监听不会自动重绑，这是首开与滚动刷新问题的重点排查项。

### 5.3 豆包完整性语义

产品和代码必须使用以下语言：

~~~text
已观察范围：侧栏打开期间，用户实际浏览并被扩展捕获的消息窗口。
覆盖候选：未来只有在首 / 中 / 末固定锚点和 coverage 元数据均实现后才可使用。
完整会话：只有平台数据源或可证明的全量索引才能声明。
~~~

当前 v2.1.3 只有 `passiveIndex: true`，没有首 / 中 / 末锚点、coverage 或 completeness 字段。“可能完整”是目标语义，不是现有产品能力。侧栏关闭后 records 与 fingerprints 会清空；侧栏打开前用户浏览过的窗口不会自动进入索引。

不得因为：

- question 数量等于 answer 数量；
- 当前 DOM 看起来从第一问到最后一问；
- 自动滚动一次后节点变多；
- fixture 全通过；

就宣称豆包完整。

### 5.4 豆包允许与禁止

允许：

- 用户滚动时按 data-message-id 被动累计。
- 用户明确点击目录项后，插件按 message-id 或 offset 执行定位滚动。
- 在 class 漂移时优先寻找 data-*、语义容器和稳定消息身份。
- 把 offset 作为同一会话内的排序辅助。
- 内容指纹可检测到变化时更新同一记录。
- 在 UI 中明确显示“继续浏览可补全”。

禁止：

- 为制造“采集完整性”而在后台自动滚动豆包页面。
- 把整个大容器误判为单轮 conversation。
- 按 questions[i] 与 answers[i] 直接配对。
- 把一个回答的多个 markdown/segment 节点当成多个回答。
- 使用随机 hash class 作为唯一身份。
- 在没有 Network/runtime 证据时复制 ChatGPT 的内部 API 方案。

### 5.5 豆包开发验收

| 场景 | 必须观察的结果 |
|---|---|
| 从未注入的旧标签首次打开侧栏 | content/index 成功按需注入，当前窗口快速生成目录，不为采集而滚动 |
| 扩展升级后旧标签 | 首次打开侧栏可替换旧 singleton；失败时给出刷新提示 |
| 关闭再打开侧栏 / 切 tab | Port 与观察生命周期重建，不复用错误 URL 的记录 |
| 顶部 -> 中部 -> 底部 | message-id 累计增长或更新，已有记录不因回收消失 |
| 底部 -> 顶部 | 去重稳定，顺序不倒置 |
| 流式回答 | 同一 message-id 更新，不生成重复回答 |
| 同会话 query 变化 | 目标行为是不丢缓存；当前完整 URL 隔离会误清，需修复为 `/chat/{id}` 会话键 |
| 切换会话 A -> B | A 的缓存不进入 B；目标以规范化 conversation key 重置 |
| role 分类 | system/tool/card 不进入问答；嵌套或重复 message-id 不互相覆盖 |
| question/answer DOM 数量不等 | 目录与导出分别验收，不按数组索引 |
| user -> progress -> final | 最终回答不被 progress 吞掉；目录与导出归组一致 |
| user -> user -> assistant | 两个用户消息的处理规则明确，不静默覆盖第一条 |
| 空被动索引 fallback | 仍标注当前范围，不冒充完整目录或完整导出 |
| scroller 延迟挂载 / 被替换 | 观察器重绑真实聊天容器，不绑定会话列表或侧边栏 scroller |
| 流式高度变化后往返滚动 | offset 仅作启发式辅助，顺序不因动态高度明显倒置 |
| 关闭侧栏 | observer 和 scroll listener 全部移除 |
| 主动导出 | 不创建常驻监听，不移动页面，只导出已证明的数据范围 |

豆包现场复验最小脚本应记录：

~~~text
location.href
滚动容器身份
data-message-id 首 / 中 / 末样本
用户气泡和回答 host 数量
滚动前后挂载节点集合差异
同一 message-id 流式前后指纹
页面是否发生未经用户发起的采集滚动
scroller 是否延迟出现、被替换或误选
role 分类与嵌套 / 重复 message-id
目录归组与导出归组差异
fallback 是否携带覆盖范围标记
~~~

## 6. 共享生命周期与性能预算

### 6.1 侧栏是观察生命周期的所有者

~~~mermaid
sequenceDiagram
    participant Panel as Side Panel
    participant Content as Content Script
    participant Index as ConversationIndex
    participant Host as Host Page

    Panel->>Content: connect port
    Content->>Index: connect + refresh
    Index->>Host: scoped observer / passive scroll
    Panel--xContent: panel unload / port disconnect
    Content->>Index: disconnect
    Index--xHost: remove observer / scroll / timers
~~~

要求：

- 页面安装、加载完成和后台 tab 激活不应自动启动重扫描。
- 同一 tab 的导出使用锁，避免并发注入和重复数据读取。
- outline refresh 如果正在执行，只设置一个 pending latch，结束后补一次，不排队无限任务。
- 观察器回调只触发节流扫描；扫描只有在索引实际变化时通知 UI。
- 缓存必须有数量上限、TTL 或明确生命周期。

### 6.2 性能门禁

任何声称“修复加载不全”的改动，都要同时证明：

- 没有引入全页高频扫描。
- 没有让侧栏等待内部 API 才首次渲染。
- 没有在侧栏关闭后残留 observer、timer 或 port。
- 没有恢复自动滚动。
- 长会话滚动和流式输出时 CPU / 主线程没有明显抖动。
- API 失败时页面仍可正常输入、滚动和生成回答。

## 7. 开发决策树

~~~mermaid
flowchart TD
    Start["收到目录 / 导出 / 跳转问题"] --> Scope{"所有平台还是单平台？"}
    Scope -->|"所有平台"| Shared["先查 sidepanel / content / background 共享状态"]
    Scope -->|"ChatGPT"| CG{"缺的是完整文本还是页面定位？"}
    Scope -->|"豆包"| DB{"缺的是未浏览历史还是已浏览窗口？"}
    CG -->|"完整文本"| Runtime["查 bridge / current branch / route isolation"]
    CG -->|"标题或定位"| Mounted["查 mounted DOM heading / message-id / turn anchor"]
    DB -->|"未浏览历史"| Honest["不能靠 DOM 保证；先找 runtime 证据，否则标注范围"]
    DB -->|"已浏览窗口"| Passive["查 data-message-id 被动缓存 / 指纹 / offset"]
    Shared --> Verify["真实冷启动 + A/B 切换 + 清理验收"]
    Runtime --> Verify
    Mounted --> Verify
    Honest --> Verify
    Passive --> Verify
~~~

代码落点：

| 问题类型 | 首查文件 |
|---|---|
| ChatGPT 原生请求、current branch、route epoch | chatgpt-api-bridge.js |
| ChatGPT / 豆包稳定消息缓存 | conversation-index.js |
| 路由变更、侧栏生命周期、刷新合并 | content.js |
| tab / URL / requestToken、旧结果闪回 | sidepanel.js |
| 问题组、标题合并、目录层级 | pipeline.js |
| 导出注入、并发锁、完整性声明 | background.js |
| DOM selector 漂移 | src/config/selectors.* 与 src/export/config/selectors.js |

## 8. 强制开发流程

### 8.1 开工前

1. 阅读本文件对应平台章节。
2. 确认目标代码基线、分支和未提交修改。
3. 从本机私有 scripts/test-urls.json 获取固定测试链接，不使用聊天记录里的旧 URL。
4. 打开真实登录态长会话，记录 route、挂载窗口、稳定 ID 和流式行为。
5. 判定问题属于平台数据面、共享生命周期还是 UI 状态。
6. 为现状建立可重复的失败证据，再改代码。

### 8.2 实现中

1. 平台现实变化先更新本文件，再调整 selector / index。
2. 共享逻辑不得用平台特例污染所有平台。
3. 任何异步路径都携带 route identity。
4. 任何缓存都写明 key、范围、TTL、清理时机和权威级别。
5. 任何降级路径都写清楚完整性上限。
6. 大改前先创建 checkpoint commit / branch，不再依赖会话记忆恢复。

### 8.3 交付前

1. 语法、fixture 和回归测试。
2. 真实冷打开，不使用已热缓存的二次打开。
3. A -> B -> A 快速切换。
4. 长会话顶部 / 中部 / 底部。
5. 流式回答开始、进行中、结束。
6. API 失败 / 空 payload / 超时。
7. 侧栏关闭后的资源清理。
8. 记录本次 live evidence 日期、URL 类型和未验证项。

## 9. 近期踩坑案例

案例只说明教训，不改变前文的平台事实。

### 案例 A：把当前 DOM 当完整会话

| 项目 | 内容 |
|---|---|
| 症状 | ChatGPT / 豆包长会话目录缺中间内容，滚动后旧内容消失 |
| 错误假设 | 滚动后 querySelectorAll 能得到全量 |
| 根因 | 宿主虚拟列表只保留挂载窗口，节点会回收 |
| 架构修复 | ChatGPT 使用 current branch + DOM 标题；豆包按 message-id 被动累计 |
| 防回归 | 首 / 中 / 末固定 ID，不以问答数量相等作为完整证据 |

### 案例 B：API 成功后目录仍缺回答标题

| 项目 | 内容 |
|---|---|
| 症状 | ChatGPT 完整消息已读取，但目录没有页面中的标题 |
| 错误假设 | API Markdown 与实际渲染 DOM 完全等价 |
| 根因 | API 路径成功后提前返回，跳过 mounted DOM heading merge |
| 架构修复 | API 管文本与顺序，DOM 管真实标题与定位，按 message ID / turn fallback 合并 |
| 防回归 | 同时测试 API-only Markdown heading 与 DOM-only heading |

### 案例 C：上一个会话目录带入下一个会话

| 项目 | 内容 |
|---|---|
| 症状 | A 切到 B 后，A 的目录短暂或持续出现在 B |
| 错误假设 | URL 变化后旧异步任务自然失效 |
| 根因 | React 路由、sender.tab.url、旧 DOM、API 返回和侧栏请求不同步 |
| 架构修复 | tabId + URL + conversationId + generation/epoch + requestToken 多层校验 |
| 防回归 | A -> B -> A 快速切换并故意延迟 A 响应 |

### 案例 D：第一次打不开，第二次才有目录

| 项目 | 内容 |
|---|---|
| 症状 | 首次打开 A、B 均无目录，回到 A 后才出现 |
| 可能根因 | MAIN bridge 注入时机、原生请求捕获、首次 route 状态、冷缓存与 observer 建立顺序 |
| 不能接受的验证 | 只测试已经打开过或已经缓存的会话 |
| 正确验收 | 新标签 / 新会话冷打开；bridge 在 document_start；首次原生请求和显式 fallback 都可追踪 |
| 当前状态 | 真实问题曾复现；v2.1.3 仍需冷启动现场证明，不得仅凭测试宣称解决 |

### 案例 E：性能修复把可用性一起删掉

| 版本阶段 | 教训 |
|---|---|
| v2.0.8 | 实际可用性较好，但存在性能负担 |
| v2.1.1 | 大幅减少 API / DOM 工作后，部分 ChatGPT 目录变空 |
| v2.1.2 | 恢复 API 目录，但 API-only 仍不足以覆盖真实标题和降级 |
| v2.1.3 | 发布 S3 checkpoint，保留路由隔离、混合索引和按生命周期观察 |

性能与可用性不是二选一。正确做法是缩小扫描范围、限定生命周期、合并请求和限制缓存，而不是删除核心数据通道。

### 案例 F：没有会话级版本，最后只能从日志逆向恢复

| 项目 | 内容 |
|---|---|
| 症状 | 多轮架构修改都堆在 v2.1.2 未提交工作区，无法一键回到指定对话前 |
| 后果 | 需要从 Codex 会话日志逆向 12 次补丁重建 S3 |
| 修复 | 创建 codex/pre-architecture-fix-20260715，checkpoint 7e3d0ef，发布 v2.1.3 |
| 新规则 | 每个架构阶段结束都必须 commit；高风险实验先建分支；不要把聊天轮次当版本 |

## 10. 漂移台账

| 日期 | 平台 | 证据 | 结论 | 后续 |
|---|---|---|---|---|
| 2026-06-19 | 豆包 | 登录态审计 | question=4、answer=2、提取=2，证明数组配对不可靠 | 使用 message-id 索引 |
| 2026-06-25 | ChatGPT / 豆包 | 本机 manual audit | 当时选择器通过 | 不能替代长会话虚拟化验证 |
| 2026-07-16 | ChatGPT | 真实 Chrome 长会话 | 仅挂载 turn 30-34；5 turn、7 message-id、30 heading | 保持 hybrid index |
| 2026-07-16 | ChatGPT | 真实 Chrome | MAIN bridge global 未出现 | 可能是当前标签未加载 v2.1.3 bridge；升级后需刷新验证 |
| 2026-07-16 | 豆包 | Chrome | 页面可导航，但读取关键 DOM 连续超时 | 下次优先轻量 CDP / 手工 DevTools |
| 2026-07-16 | 豆包 | Codex 内置浏览器 | 登录态会话与回答正文可见，人工滚动有效；snapshot、evaluate、CDP 读取均超时 | 确认页面可用，不把历史 selector 当成本次现场 DOM 合约 |

每次平台变化追加一行，不覆盖历史。旧结论保留日期，避免“最新一次看起来正常”抹掉回归线索。

## 11. 资料与本地证据

官方边界：

- Chrome content scripts 与 isolated world：https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Manifest content_scripts、run_at 与 world：https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
- OpenAI ChatGPT 分享链接：https://help.openai.com/en/articles/7925741-chatgpt-shared-links-faq

交叉佐证，不作为宿主承诺：

- ChatGPT DOM 导出器：https://github.com/rashidazarang/chatgpt-chat-exporter
- ChatGPT 非官方会话导出器：https://github.com/brianjlacy/export-chatgpt

本机私有审计资产，不随公共仓库发布：

- scripts/SKILL-dom-selector-audit.md
- scripts/test-urls.json
- scripts/reports/manual-audit-2026-06-19.json
- scripts/reports/manual-audit-2026-06-25.json

## 12. 一页式提交检查

~~~text
[ ] 我确认了当前分支和代码基线
[ ] 我读了对应平台章节
[ ] 我使用的是 scripts/test-urls.json 当前链接
[ ] 我区分了完整数据、挂载 DOM 和本地缓存
[ ] 我定义了稳定 ID 与 route identity
[ ] 我没有为采集完整性而后台自动滚动豆包
[ ] 我没有对 ChatGPT 做无界全页扫描
[ ] 我验证了首次冷打开
[ ] 我验证了 A -> B -> A
[ ] 我验证了流式输出
[ ] 我验证了侧栏关闭后的清理
[ ] 我记录了 live evidence 与未验证项
[ ] 我为本阶段创建了 checkpoint commit / branch
~~~

## 13. 后续扩展位

首期只把 ChatGPT 与豆包写深、写实。DeepSeek、元宝、Gemini、Grok、Kimi 后续按相同模板补充：

1. 平台现实。
2. 路由 identity。
3. DOM / runtime 数据源。
4. 虚拟化与流式模型。
5. 稳定 ID。
6. 数据流图。
7. 允许 / 禁止。
8. 冷启动、切换、长会话与清理验收。
9. 漂移台账。

在完成真实登录态长会话审计前，不把这些平台的选择器配置写成“平台架构事实”。
