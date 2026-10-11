# Agent47：公共网页标签与审阅后页面入模

本批沿用右侧产物工作区，不建立另一个接管浏览器会话。网页由用户浏览，Agent 只有在用户确认后才收到一份固定正文摘录，没有页面点击、提交表单或导航工具。

## 工作流与参考范围

- **Pi：** 借鉴持续上下文与工具边界的 steering 思路，网页摘录发送到已有队列/追问链路，不绕过暂停中的决定。[Pi 的公开说明](https://pi.dev/)区分 steering 与 follow-up，强调最小 harness 与 context management。
- **Codex：** 保留技术边界与授权策略的区别，不把一次回答或网页内容误当权限；[Codex manual](https://developers.openai.com/codex/codex-manual.md)将 sandbox 和 approval policy 分开描述。本应用没有因此获得 Codex 的 OS 工具 sandbox。
- **OpenCode：** 已授予的普通操作不反复审批，真正的数据发送通过明确动作；[OpenCode permissions](https://opencode.ai/docs/permissions/)区分 allow/ask/deny，不因自动批准撤销 deny。
- **DeepSeek Harness：** 桌面/工作区参考范围限定 Harness，公开[官方 Web UI 指南](https://deepseek-harness.github.io/deepseek-harness/)说明工作区、会话和权限入口。同名 Desktop 社区项目很多，尚未指定具体 fork，本批不把任意社区实现冒充官方桌面体验。

不新增 extension SDK、MCP、自定义 provider、插件市场或第三方工具注册接口。现有 SKILL.md 管理保持原功能，未扩展成新的可执行插件系统。

## 交互

打开右侧工作区，在地址栏输入公共 HTTPS 地址，点击“打开网页”。这是实际原生网页，不是服务器抓取后展示文本。每个网页使用独立临时 session，不继承系统浏览器 Cookie、模型密钥或应用 preload。

可以使用网站本身的普通链接和页面交互；这些是用户浏览行为，不是 Agent 的工具调用。下载、弹窗及摄像头等 permission request 被拒绝，不提供自动化、密码管理、HTTP Basic 网站认证或持久登录。浏览器原生文件选择不属于同一 permission API，用户仍可能主动选择文件并上传到网站；Agent 没有文件上传接口，不能把这层浏览器隔离描述成所有用户网页操作的阻断器。

选择一个对话并完成当前问题/审批后，点击“将页面内容交给 Agent”。应用读取主文档摘录，在固定底部决策区展示目标对话、实际 URL、时间、内容哈希、截断状态和完整将发送的文本。取消不发送；确认后已完成对话创建 follow-up，运行中对话按原工具边界队列消费。普通聊天草稿不被用作发送按钮。

最多 8000 字符正文，必要时因 JSON/消息大小进一步缩短；只采集主文档的文本，不采集 iframe、Shadow DOM、canvas 或完整浏览器状态。程序不直接读取 Cookie、storage、表单值、脚本或隐藏节点；网页可展示私人内容，因此必须审阅，不承诺可见正文没有敏感信息。模型收到的是不可信材料，不是新增权限。

摘录固定在用户审阅时的版本，不在确认后悄悄重读。ticket 绑定任务、Tab、URL、digest 和 10 分钟有效期；关闭、停止、刷新或导航后旧票据不可发送。重新采集同一 Tab/任务撤销前次票据，避免取消后堆积。提取在 isolated world 执行，有 8 秒超时，不把网页主世界原型污染当可信 API。

## 网络和生命周期

每个网页通过仅监听 loopback 的临时、认证 CONNECT 网关，只支持公共 HTTPS / 443。网关在连接前解析 IPv4、排除私有/保留地址，并直接连接已验证 IP，不让 Chromium 第二次 DNS 解析带来 rebinding。TLS 仍由 Chromium 验证，网关不解密内容，也不接触模型密钥或页面 Cookie。

拒绝 HTTP、IP 字面地址、内网/localhost/custom port、非 HTTPS 资源、WebSocket 和绕过代理的 UDP；系统权限、下载、弹窗、应用协议和 Node/IPC 都不开放。每个网关限制连接数量，DNS/连接有截止时间，闲置连接会关闭。它是浏览器网络边界，不是本机 Shell/Node 的 OS 安全沙箱。

网页 Tab 仅持久化地址/状态；重启后暂停，用户刷新才重新联网，不恢复 Cookie 或浏览历史。停止/关闭销毁页面、代理、连接和待发送摘录。原有本地 HTML 保持离线策略，不能因为增加网页 Tab 而访问外网。

本轮还修复了 HTML 同内容刷新时 native view 已销毁但 React 没有重新布局的问题：增加独立 revision，不靠内容 hash 变化触发原生重建。

## 验证与限制

网关单元测试验证认证、目的地址拒绝和 DNS pin；测试拨号仅映射到 localhost echo fixture，不是生产绕过。原生网页 fixture 截获 HTTPS 响应，但使用真实 Electron、DOM、IPC、runtime 与数据库；不会冒充真实联网或模型验收。

真实验收使用公开 Pi 页面和 DeepSeek，必须证实浏览不调用模型、页面在无应用 IPC/Node 的独立会话加载、底部审阅后内容进入新执行轮次、模型总结包含页面证据，以及重启不自动联网。Windows/macOS fixture CI 与 Linux 真模型验收仍分开。

现阶段没有 Agent 页面操作、网页工具授权或 Tab 控制 API、持久登录、浏览器历史恢复、扩展系统、签名安装与原生系统密钥存储验收。未来页面工具也应复用本工作区并绑定目标，而不是让模型获得整个浏览器的隐式权限。
