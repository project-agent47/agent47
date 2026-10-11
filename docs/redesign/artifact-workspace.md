# Agent47：右侧本地产物工作区

本增量承接统一底部决策区，不改回逐文件审批。Agent47 仍是 DeepSeek-only 的紧凑 Agentic Workbench；查看材料不是运行任务，也不是批准写入。

## 可用交互

- **打开来源：** 已保存成果、底部确认区的待保存提案，以及用户通过“打开文件”选择的本地材料。
- **右侧多 Tab：** 切换、关闭、左右排序、收起再展开、拖动或键盘调整宽度。内容快照、顺序、当前标签和宽度跨重启保留。
- **HTML：** 独立 Electron WebContentsView，支持内联 CSS/JavaScript 和页面内交互。可以查看源码、停止页面、刷新重新加载；停止不会重放 Agent 工具。
- **Markdown：** 使用既有 ReactMarkdown/GFM Renderer，支持表格与代码块，抑制原始 HTML、远端图片和直接链接跳转。
- **代码：** 懒加载 Monaco，内置本地 ESM worker，仅只读查看和语法着色，不支持修改、运行、扩展、LSP。
- **其他文档：** PDF、Office 文档和常见图片显示暂不支持提示，可以点击使用系统默认查看器；不是在 Agent47 内解析。

提案按 approval ID 和 digest 绑定。预览不创建文件、不更改审批状态，批准后打开的是已保存成果。旧提案标签明确保留审阅快照，不冒充最新文件。

## 隔离与版本

HTML 不加载应用 preload，关闭 Node integration、启用 context isolation / sandbox / webSecurity，使用非持久 session。禁止外网/相对资源、表单提交、弹窗、下载、系统权限和 iframe；CSP、协议处理、请求过滤与拒绝代理构成多层约束。Inline script 仍可能消耗 CPU，隔离不等于资源配额；停止/关闭会销毁页面 WebContents。设计采用官方 [WebContentsView API](https://www.electronjs.org/docs/latest/api/web-contents-view)，遵循 [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)。

切换、确认区遮挡和缩放会重新同步原生视图位置。异步加载采用串行队列及 generation 检查，避免旧请求覆盖新标签或已停止页面。关闭窗口主动清理原生子页面与 session。

用户选定的文本使用 UTF-8 验证、文件身份检查和有界读取，拒绝敏感文件名、可执行文件、符号链接和二进制文本。文本限制 1 MB，其他允许文档 20 MB，最多 10 个标签。工作区保存本地内容副本，关闭标签会移除该副本，但不删除原文件。

外部修改不会静默覆盖当前快照，需显式刷新；系统打开前再次核对版本。系统浏览器打开 HTML 会离开应用隔离策略，因此额外显示明确警告。损坏的工作区记录不会被默认数据覆盖；当前错误会阻止启动，需要恢复记录，尚无专门恢复界面。

## 工程与验证

Monaco 按官方 [ESM 集成说明](https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md) 使用本地 worker；已安装 0.57.0 使用新版 exports 路径。只读编辑器按需加载，约 2.7 MB minified，gzip 约 695 KB，构建保留体积警告，不假装消除。Monaco 的 DOMPurify 传递依赖通过 overrides 固定为 3.4.16。

`npm run test:workspace:native` 使用真实 Electron/HTML/Markdown/Monaco/IPC/存储，但不调用模型；文件选择器和系统查看器启动由 harness 替代。覆盖内联交互、IPC/Node/网络隔离、停止销毁、版本固定、刷新、重启与只读行为。`npm run test:desktop:live` 使用真实 DeepSeek 和实际 runtime/tool/IPC，新增 HTML 提案预览、批准保存及原生按钮交互链路。

浏览器交互预览仅使用示例数据，不读取本机文件、不调用模型；其中 HTML 脚本关闭，与桌面版原生交互验收严格区分。CI 包含 Windows/macOS 原生 viewer fixture，不等于签名安装器、系统密钥存储或原生付费模型验收。

## 下一增量边界

本次没有实现 URL 标签、登录 Cookie、网页总结、页面读写工具或 Agent Tab 操作。后续应复用这个工作区，把“用户打开页面”“发送页面内容给模型”“授权 Agent 操作页面”分开，而不是新增一套接管浏览器会话。资源 bundle、文件变更提示、编辑和大型文档支持也留待下一步。
