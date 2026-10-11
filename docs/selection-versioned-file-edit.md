# C1：选区引用、版本化 fileEdit 与历史 diff

本增量让用户从右侧 Markdown／代码中选择内容，在固定底部输入区提出修改要求，再由 DeepSeek 使用原版本哈希进行精确编辑。选择与查看不调用模型，不扩大项目权限，文件自动快照仍为默认行为；不增加扩展、模型或账单功能。

## 交互与范围

- **选区引用**：Markdown 渲染视图只接受唯一、连续的原文匹配；跨格式或重复文本提示切到源码。源码与代码使用只读 Monaco，将显示位置映射到含 BOM／CRLF 的原始 UTF-16 偏移，拒绝切开字符或换行。
- **底部输入区**：点击“让 Agent 修改”只添加版本化材料，不发送消息、不替换草稿。显式发送后才授权 readMaterial 按需读取；运行中仍走消息队列，暂停与决策区不被绕过。
- **项目内编辑**：已经授权项目目录中的普通文本文件，原文件至多65536字节，提供相对 targetPath。单份外部导入材料、成果库以及更大文件只作为引用，可要求产生新版本成果，不能因此直接覆盖源文件。
- **版本变化**：选区最多12000 UTF-16 单元。源文件变化时发送或引用会要求重新刷新、选择；旧选区不自动迁移。完整版本正文存于本地，模型默认只得到材料版本元信息与选区，readMaterial 才返回正文。
- **历史差异**：文件改动记录提供“查看差异”，右侧 Monaco 展示留档的写入前／后版本，并标明哈希和历史来源。不是当前磁盘 diff，不执行恢复，不自动把正文交给模型。

选区是用户的修改意图与精确定位，不是新的 OS 沙箱。已有项目目录读写权限仍覆盖该目录，不能宣称模型技术上只能写选区；文件哈希、路径检查与快照提供实际执行边界。

## Harness 参考与选择

Pi 的当前 edit 实现使用 edits 数组，所有块对同一原文匹配，处理唯一匹配、重叠、BOM 和换行，并对文件写入串行化；本增量借鉴其原版本批量编辑结构，但不照搬整个 runtime，参见 [Pi edit 源码](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/src/core/tools/edit.ts)。

Codex 文档强调 apply_patch 格式及训练适配，支持增加／删除／移动／更新；这说明模型与格式契约的重要性，不能证明 DeepSeek 在同一自由格式 patch 上更稳定，参见 [Codex prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide)。

OpenCode V2 同时提供精确字符串 edit 和多文件 patch，其文档将 patch 限定于支持的 GPT 模型，其他模型使用 edit/write；因此本产品先采用 DeepSeek 可通过严格 JSON schema 调用的单文件工具，不引入多文件 patch 解析器，参见 [OpenCode V2 tools](https://opencode.ai/v2/docs/tools/)。

这是工程选择，不是三种工具的模型成功率横评。当前只实测 Agent47 的 DeepSeek 流程，没有宣称已对 Pi／Codex／OpenCode 做同题 benchmark。

## fileEdit 契约

```json
{
  "path": "src/example.ts",
  "expectedHash": "<原始UTF-8正文的64位SHA256>",
  "edits": [
    {
      "oldText": "const value = 1;",
      "newText": "const value = 2;",
      "startOffset": 120
    }
  ]
}
```

- **原版本**：1–32个块全部匹配同一原始正文，不把前一块替换结果作为下一块输入。expectedHash 包含 BOM 与真实换行，readFile/readMaterial 返回一致的哈希。
- **匹配**：必须唯一；重复文本可用精确原始 UTF-16 startOffset 消除歧义。拒绝重叠、嵌套、空 oldText、无效偏移、无效 Unicode、NUL 与无意义修改，不做空白压缩或模糊猜测。
- **换行**：仅在非混合换行文件中允许 LF／CRLF 规范化匹配及替换适配；混合文件要求精确匹配。未改动正文保持原样，禁止切开 CRLF 或 UTF-16 代理对。
- **执行**：全部块预检成功后进入已有 TaskRuntime 权限／副作用／快照链路，一个文件写入一次，留一个恢复点。返回写入后 sha256、snapshotId 与原文匹配范围。
- **兼容**：旧 editFile 保留，已有持久检查点和恢复动作不改名、不重放。新模型提示优先 fileEdit，不删除 writeFile。

这不是任意 diff 脚本、文件创建／删除／移动或多文件事务。文件写入前有版本检查及临时文件 rename，但不具备与外部编辑器之间的跨进程原子 compare-and-swap，不能承诺杜绝所有检查后竞态；项目执行与恢复沿用已有本地锁。

## 快照、存储与恢复

新文件快照同时保存 before／after 和各自哈希；历史 diff 从该留档读取，不读取当前磁盘作为“写入后版本”。旧备份缺少 after 时明确提示不可用，不伪造历史内容。目录改动没有文件 diff；清理备份会移除 before 和 after。

已打开的 diff Tab 是独立本地查看快照，最多沿用10个 Tab 上限，可跨重启恢复；清理恢复备份不会移除该 Tab，关闭会移除它，界面明确提示。不同任务即使文件名与内容相同，也不会混用来源。持久化 diff 必须包含两版正文和哈希，缺失或校验失败拒绝加载。

Monaco 展示统一 LF 并隐藏文件头 BOM，属于文本差异，不是字节 diff。真实磁盘与快照哈希仍使用原正文；恢复沿用既有完整文件冲突检查，外部修改不会在正常检查路径被覆盖。Shell／JavaScript／远端改动不在文件快照覆盖内。

## 验收与证据边界

单元测试覆盖原文多块匹配、重复偏移、重叠拒绝、换行与 Unicode、预检失败无部分写入、哈希变化、单次快照、独立留档 diff、恢复／清理、选区材料上下文和旧工具兼容。界面测试覆盖 Markdown 实际鼠标选区、Monaco 实际键盘选区、草稿保持、材料引用、readonly diff 和紧凑窄屏。

`npm run test:selection:native` 使用真实 Electron／IPC／SQLite／文件 IO／Monaco 与系统临时目录，fixture 模式显式注入工具意图，不能当成真实模型证据。设置 `AGENT47_SELECTION_LIVE=1` 与已批准模型代理运行时由真实 DeepSeek 决定 readMaterial／fileEdit；只替换文件和目录选择器返回测试路径，不注入模型回复或工具结果。

真实场景选择两个重复代码中的第二处，保留 BOM／CRLF、第一处和随机证据标记，重启后发送，查看 diff，再从底部决策区确认恢复，并重启验证不重放。多块编辑由单元验证，真实模型选区场景仅使用一个块，二者不可混称。

Windows／macOS CI 为原生 fixture，不等同真模型实机、签名安装、系统安全存储或 OS 沙箱验收。网页选区、HTML 编辑、直接手工编辑、富文本／Office、Git 自动提交和多文件 patch 不在本增量范围内。
