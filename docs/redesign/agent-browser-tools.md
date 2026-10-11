# Agent47：右侧网页工作区的 Agent 操作设计

这不是另建一个“接管浏览器”，也不是开放插件接口。目标是在已有右侧 WebContentsView 工作区内，让左侧 DeepSeek 通过有限的内置工具完成“观察 → 操作 → 再观察”，用户始终能看到目标网页、权限与真实工具记录。

## 产品原则

- **一个工作区：** 用户和 Agent 使用同一组原生网页 Tab；不另开隐藏浏览器，不读取系统浏览器配置或 Cookie。
- **按目标授权：** 权限绑定当前 conversation、指定 Tab 与 exact HTTPS origin，不绑定全局“浏览器已开启”，不继承 Shell 信任。
- **低打断：** 已授权的读取、同站导航、滚动和切换无需反复确认；需要时可明确授权此 Tab 的可信交互，免点击/输入确认。
- **不把语义识别当安全：** 任意按钮及输入事件都可能改变远端数据。不存在可靠的“普通点击永远安全／提交才有副作用”分类；可信交互必须明确承认这一边界。
- **不伪造完成：** 派发点击/输入不等于业务成功；Agent 必须重新读取页面，依据实际文字报告结果。
- **保留现有行为：** 手动浏览不入模、手动摘录底部审阅、文件快照、可信本机执行、问题与消息队列都保留。

## 工具与契约

| 工具 | 输入 | 输出／边界 |
| --- | --- | --- |
| browserOpen | 公共 HTTPS URL | 底部批准具体 URL 后打开 Tab，授权当前对话读取/同站导航；点击/输入仍逐次批准。最多沿用 10 Tab 限制。重定向到另一 origin 不自动授权 |
| browserTabs | 空对象 | 仅本对话已授权 Tab 的 ID、URL、激活状态和模式，不列出其他对话或未授权页面 |
| browserActivate | tabId | 在右侧选择已授权网页；原生布局/加载后才能读取，不恢复暂停网页权限 |
| browserRead | tabId | 主文档正文、标题、实际 URL、snapshotId、有限交互元素 refs；全部是外部不可信证据 |
| browserNavigate | tabId、URL | 同一已授权 exact origin 导航；跨站须另行打开/授权。禁止以动作 GET URL 绕过确认是模型约束，不声称能识别所有服务端副作用 |
| browserScroll | tabId、deltaY | 单次上下最多 2000 px，随后重新观察；不是任意脚本 |
| browserClick | tabId、snapshotId、ref | 精确元素点击，默认底部审批；可信交互模式免重复批准。返回 dispatched/verifiedOutcome=false |
| browserFill | 同上、text | 普通 input/textarea 替换内容并派发 input/change，最多 4000 字符，不发送 Enter；事件本身也可能向站点发送数据 |

工具是 AI SDK 的类型化意图，无 SDK execute 直接副作用。TaskRuntime 先保存 tool call，再交由 main-process broker 检查权限、元素版本与审批；浏览器页面没有工具注册 API、应用 IPC、Node 或模型密钥。

浏览器内置工具列表在各步骤保持稳定，权限由 broker 拦截，不靠动态隐藏 schema 充当权限。真实模型验收曾在首次打开后沿用授权前“无读取工具”的推断，未执行 browserRead；该轮没有计为通过，因此改为稳定 catalog，再验证完整打开/批准/读取链路。

## Agent 能拿到哪些 context

每个模型步骤的系统 context 只带本次对话已授权 Tab 的摘要元信息。具体正文与元素信息必须通过 browserRead 按需读取，不自动把所有标签、浏览记录或整个 DOM 塞进模型。

正文复用固定 isolated-world 的只读提取程序，主文档最多返回 4000 字符。排除 form/input/textarea/select/contenteditable、脚本、iframe 与常见隐藏节点，不直接读取 Cookie、storage 或表单值；正文仍可能有私人信息，授权意味着允许将这些可见证据发送给外部 DeepSeek。

控制项最多 60 个，元素集合序列化最多 12000 字符，返回 ref、tag、role、名称、type、href、disabled/readOnly。输入框名称来自标签/aria-label/placeholder，不读取值；password/file/hidden 控件不列出。有截断标记，不冒充完整无障碍树或完整视觉状态，也不包含 Shadow DOM、canvas、iframe 内容。

正文、标签和链接 URL 仍可能携带私人信息或查询参数；排除密码控件值不等于能够自动识别所有秘密。授权区明确提示这些信息会进入 DeepSeek，用户不应授权包含敏感内容的页面。

refs 是一次读取的短期句柄，不是模型提供的 CSS selector。main 保存 snapshotId、conversation、WebContents 身份、URL、时间与元素描述；isolated world 保留实际 Element 引用。操作前核对句柄、连接/渲染状态与元素描述，避免同位置新按钮、页面导航或旧引用被当作原目标。

完整工具结果留在本地会话历史，自动压缩继续沿用已有完整 call/result 配对和安全 turn 边界。压缩摘要不承载浏览器执行权限；即使摘要保留旧 ref，broker 仍拒绝过期操作。

## 用户权限入口

右侧网页地址下面直接显示“Agent 权限”，不藏在设置页：

- **未授权：** 用户可浏览，Agent 无读取/操作权限。
- **读取与同站导航：** 一次底部授权后，允许读取、滚动、激活和同站导航，不允许 click/fill。
- **交互逐次确认：** 普通读取免确认；click/fill 的目标元素、实际 URL 和完整输入内容在底部展示。
- **可信交互免确认：** 明确审阅本 Tab／本 origin／本 conversation 的范围与风险后，click/fill 不再逐次询问。可能包含发布、提交或删除效果，不能保证语义层面的不可逆动作都被自动拦截。

首次授权与升级均在原固定底部决策区确认，保留聊天草稿。撤销立即生效，不需要再发一条“不要操作”的消息；动作准备/执行检查 grant generation，已经开始的外部动作不能保证撤回。

等待网页工具确认时仍可修改权限；升级或撤销会让旧审批与引用失效，运行时返回旧意图错误并要求重新观察，不把范围授权隐式当成旧点击/输入的批准。

权限只存在应用本次进程中；同一对话后续 Run 可沿用，其他 conversation 不可沿用。关闭/停止/刷新和应用重启撤销；重启网页仍暂停。网页跨 origin 后原授权不再可用，同一 Tab 回到原站点也不应把已撤销权限重新激活。

## 版本、恢复与失败语义

操作引用最长 2 分钟。导航、刷新、停止、关闭、新读取或工具动作使旧引用失效；审批展示并绑定 task/call、URL、snapshot/ref、元素描述、完整输入、grant generation 与 expiry。浏览器审批不能转换成文件或 Shell 授权。

点击/输入执行前保存 effectStarted；执行已开始但中断、超时或重启时，进入既有“检查执行结果”决策区，不自动重放。用户确认检查后，只结束未知意图并继续，不代表回滚，也不能制造“成功”证据。部分校验错误也可能被保守记成未知，宁可要求检查而不重放远端效果。

browserOpen、导航和滚动的成功只代表打开／导航／滚动，不代表站点业务操作成功。网站可能通过 GET、页面加载或滚动监听产生服务端效果，允许这些操作就不能承诺它们绝对无副作用。

## 安全与能力边界

沿用已有公共 HTTPS/443、私网拒绝、DNS pin、认证 CONNECT 网关、临时 session、TLS 校验和 renderer sandbox 配置。不关闭 webSecurity，不开放 arbitrary JS、Cookie/storage、文件上传、密码输入、跨 frame 操作、下载、弹窗或系统浏览器接管。

站点可以在自身页面执行脚本并访问其正常公开网络资源。DOM click/fill 是合成操作，有的网站要求 trusted input、验证码或复杂组件，可能不兼容；目前不支持视觉坐标点击、键盘快捷键、下拉框选择、拖拽和自动等待复杂 SPA 状态。应报告限制，不自动回退成不受控脚本或 Shell。

描述校验并不冻结网站行为：同一个元素的事件处理逻辑仍可能在审批期间变化。正文被截断的长页面也不等于全文总结；当前没有全文分页读取工具。现有每 Run 12 个模型步骤和自动压缩上限保持不变，复杂任务应拆分后续轮次，不能声称无限自主执行。

用户手动选择上传文件仍是浏览器自身能力，不等于 Agent 获得文件上传工具。私有正文、恶意页面和 prompt injection 不能只靠提示词解决；真正的目标/范围校验在 broker，但授权范围内错误业务操作仍是风险。

本地产物 HTML 保持离线查看，没有跟随本批变成联网或模型控制页面。现有 SKILL.md 只是既有能力，不扩展成插件／第三方接口；没有新增 MCP、扩展 SDK、工具注册或 provider。

## 参考限定

- **Pi.dev：** [最小 harness、上下文与 steering/follow-up](https://pi.dev/)，保留目标驱动工具循环和低打断授权，不套固定 workflow。
- **Codex：** [manual](https://developers.openai.com/codex/codex-manual.md) 中执行边界与批准策略分离；本产品不因此宣称拥有 Codex OS sandbox。
- **OpenCode：** [allow/ask/deny 权限模型](https://opencode.ai/docs/permissions/)，借鉴明确、可撤销且可观察的范围授权。
- **DeepSeek Harness Desktop：** 确切仓库尚未指定，只沿用此前[官方 Harness 工作区公开指南](https://deepseek-harness.github.io/deepseek-harness/)，不把某个社区 Desktop fork 冒充指定实现。

## 分阶段路线

本批实现上述八个内置工具与底部授权/审阅，不做扩展系统。下一步先用 macOS 实机检验真实站点兼容性、用户接管时的控制状态、日志与布局；再决定是否需要 select/键盘/复杂等待、登录会话生命周期或视觉定位，不以“浏览器已经有能力”跳过产品与恢复设计。
