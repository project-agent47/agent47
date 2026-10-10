import { readFileSync, writeFileSync } from 'node:fs';
const css = readFileSync('src/renderer/style.css', 'utf8');
const parse = block => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const light = parse(css.match(/:root\s*\{([^}]+)\}/)[1]);
const dark = { ...light, ...parse(css.match(/\[data-theme='dark'\]\s*\{([^}]+)\}/)[1]) };
const tokens = { light, dark };
function contrast(a, b) {
  const luminance = hex => {
    if (/^#[a-f\d]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map(c => c + c).join('');
    const rgb = hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
const pairs = [];
for (const mode of ['light', 'dark']) {
  for (const foreground of ['text', 'muted', 'faint', 'primary']) for (const background of ['bg', 'surface', 'surface-2', 'sidebar']) pairs.push({ mode, foreground, background, ratio: contrast(tokens[mode][`--color-${foreground}`], tokens[mode][`--color-${background}`]) });
  for (const [foreground, background] of [['primary', 'primary-highlight'], ['inverse', 'primary'], ['inverse', 'primary-hover'], ['warning', 'warning-bg'], ['error', 'error-bg']]) pairs.push({ mode, foreground, background, ratio: contrast(tokens[mode][`--color-${foreground}`], tokens[mode][`--color-${background}`]) });
}
if (pairs.some(p => !Number.isFinite(p.ratio) || p.ratio < 4.5)) throw new Error(`Invalid or low contrast: ${JSON.stringify(pairs.filter(p => !Number.isFinite(p.ratio) || p.ratio < 4.5))}`);
const tokenRows = Object.keys(light).map(k => `| \`${k}\` | \`${light[k]}\` | \`${dark[k]}\` |`).join('\n');
const spec = `# Agent47 desktop design system

## Context and scope

Rebuild mode. A single-user desktop assistant for frequent task handoff, progress review and exact-content approval. This system governs the React renderer and responsive review preview, not native OS dialogs or the contents of user-owned files. Designed tokens below are implemented in \`src/renderer/style.css\`; they are not recovered from the legacy UI.

The product UI and this offline showcase intentionally share all renderer tokens. They do not change OS colors or model-generated artifact content.

## Principles and rationale

- **Goal first:** the composer is the initial primary action; the user should not need to select a workflow to ask a question.
- **State before spectacle:** concise status labels, event timestamps and visible permission summaries make progress understandable without fictional activity.
- **Approve the actual change:** show filename and complete content adjacent to the decision, because a generic approve-stage button hides consequences.
- **Quiet technical workspace:** neutral green-gray surfaces, forest accent and packaged Geist fonts support long sessions without marketing decoration.
- **Honest empty states:** no saved artifacts means an explanation, not fake productivity metrics; preview data is explicitly labeled.

## Complete foundations

Values are designed. Color is semantic and mode-aware; type and spacing are shared. Native dialogs remain OS-owned.

| Token | Light | Dark |
|---|---|---|
${tokenRows}

## Vocabulary

| Term | Use | Avoid | Rationale |
|---|---|---|---|
| 任务 | Goal-scoped unit | Recipe / mandatory workflow | Goal determines the necessary steps |
| 待你审阅 | Pending exact-content action | Awaiting general stage approval | The user sees what is blocked |
| 批准创建 | One new artifact payload | Execute everything | Limited permission is explicit |
| 拒绝写入 | Refuse proposed creation | Skip approval | Denial is not bypass |
| 停止任务 | Stop future work | Roll back | In-flight approved I/O may finish |
| 成果 | Approved portable file | Fake browser output | Deliverable is traceable |
| 交互预览 | In-memory demo | Live agent | Avoid misleading capability claims |

## Layout and components

Desktop: 236px navigation rail, 65px header, fluid task content with 1040px reading canvas. Below 1150px the optional inspector stacks; below 760px navigation compresses and cards stack. Desktop application minimum: 900×650. Mobile 375px is preview accessibility, not a mobile application target.

- **Composer:** goal textarea, optional folder context, guidance selector, one submit action. Empty input disables submit; Ctrl/Cmd+Enter submits.
- **Navigation:** current page indication plus recent tasks. Ctrl/Cmd+N creates a new composition; no forced workflow menu.
- **Task row:** semantic status text, title, guidance and folder metadata; status never depends on color alone.
- **Approval:** warning top rule, exact filename, full scrollable source content, explicit scope, expiry, paired reject/approve actions.
- **Conversation:** text rendered safely, never raw HTML; assistant and user roles separated by labels and icons.
- **Inspector:** optional activity timeline and permission summary. It is not a permanently required third panel.
- **Artifact:** inspect before open/download; source task remains navigable.
- **Settings:** HTTPS base URL, model ID, password key field, storage availability, test status. Demo key input disabled.
- **Feedback:** loading spinner plus text; local error banner dismissible; empty states explain next action.
- **Modal:** content review, close button and Escape. Native desktop support follows browser interaction patterns.

## Motion and accessibility

Functional 160–180ms transitions; no background animation. Honor reduced motion. Use visible keyboard focus, explicit labels and disabled states; the core task path is keyboard-operable. Status text accompanies color. Source text wraps, and layout stacks at narrow widths.

Controlled text pairs are computed from the exact hex tokens. All listed enabled text pairs pass WCAG AA 4.5:1. Disabled controls are excluded from the normal contrast requirement. The showcase falls back to readable system fonts offline; production renderer bundles Geist fonts. Native high-contrast modes remain OS-owned and require separate platform validation.

Artifact dialog keyboard focus is managed in the product. 200% zoom and native screen-reader validation remain explicit platform acceptance checks rather than assumed passes.

## Computed contrast

| Mode | Foreground / background | Ratio |
|---|---|---|
${pairs.map(p => `| ${p.mode} | ${p.foreground} / ${p.background} | ${p.ratio.toFixed(2)}:1 |`).join('\n')}

## To confirm

Windows/macOS native menus, app icon exports, high-DPI behavior, OS high-contrast mode, target-platform screen-reader behavior, localization policy and brand naming remain open.

<!-- TOKENS_JSON ${JSON.stringify(tokens)} -->
`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent47 design system</title><style>${css}
body{padding:var(--space-6)}.showcase{max-width:1040px;margin:auto}.showcase header{display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);margin-bottom:var(--space-6)}.showcase section{margin-block:var(--space-8)}.showcase h2{margin-bottom:var(--space-4)}.showcase nav{display:flex;gap:var(--space-4);flex-wrap:wrap}.showcase a{color:var(--color-primary)}.demo-actions{display:flex;gap:var(--space-3);flex-wrap:wrap}.showcase table{border-collapse:collapse;width:100%;font-size:var(--text-xs)}.showcase td,.showcase th{padding:var(--space-2);border-bottom:1px solid var(--color-border);text-align:left;overflow-wrap:anywhere}.table-scroll{overflow:auto}.swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:var(--space-3)}.swatch{border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-3);font-size:var(--text-xs)}.swatch-color{height:44px;border:1px solid var(--color-border);margin-bottom:var(--space-2);border-radius:var(--radius-sm)}</style></head><body><div class="showcase"><header><div><span class="page-eyebrow">REBUILD · DESKTOP RENDERER</span><h1>Agent47 design system</h1></div><button class="secondary" id="theme">切换深色模式</button></header><nav id="toc" aria-label="组件目录"></nav>
<section id="foundations"><h2>基础：颜色与字体</h2><div class="swatches" id="swatches"></div><p>Geist / 系统回退字体 · 用目标决定步骤，用明确权限约束行动。</p></section>
<section id="composition"><h2>场景：交办目标</h2><form class="composer"><textarea aria-label="示例任务目标" placeholder="描述你想完成的目标"></textarea><div class="composer-bottom"><button class="context-chip" type="button" id="folder">选择项目目录</button><label class="skill-select"><select aria-label="任务指导"><option>通用助理</option><option>审阅与分析</option><option>成果交付</option></select></label><button class="primary" type="submit">开始示例</button></div></form><p class="composer-note" id="composition-result">这是离线组件展示，不执行任务。</p></section>
<section id="controls"><h2>动作与状态</h2><div class="demo-actions"><button class="primary">主要动作</button><button class="secondary">次要动作</button><button class="secondary" disabled>不可用</button><span class="status running">进行中</span><span class="status awaiting_approval">待你审阅</span><span class="status completed">已完成</span><span class="status failed">未完成</span></div></section>
<section id="navigation"><h2>导航、任务列表与筛选</h2><nav aria-label="示例主导航"><button class="nav active">任务中心</button><button class="nav">成果库</button><button class="nav">能力与边界</button></nav><div class="list-controls"><div class="tabs"><button class="tab selected">全部</button><button class="tab">进行中</button><button class="tab">待审阅</button></div><label class="search-box"><input aria-label="筛选示例任务" placeholder="搜索任务"></label></div><button class="task-row"><span class="row-body"><strong>整理桌面改造清单</strong><small>成果交付 · 已授权项目目录</small></span><span class="status awaiting_approval">待你审阅</span></button><p class="composer-note" id="list-feedback">切换导航、标签或输入关键词以检查交互反馈。</p></section>
<section id="activity"><h2>对话、执行详情与能力说明</h2><article class="message assistant"><div class="message-icon"><svg role="img" aria-label="Agent47" width="28" height="28" viewBox="0 0 40 40" fill="none"><path d="M8 29 19 8h7L15 29H8Z" fill="currentColor"/><path d="M20 22h11M29 12v18" stroke="currentColor" stroke-width="4"/></svg></div><div class="message-body"><div class="message-author">Agent47 <time>09:00</time></div><p class="message-text">我已整理草稿。确认内容后，将保存到成果库。</p></div></article><button class="secondary" id="inspector-toggle">显示执行详情</button><div class="inspector" id="inspector-sample" hidden><div class="permission-summary"><span>本次权限</span><p>授权目录：示例项目</p><p>成果写入逐次审批</p></div><div class="timeline-event"><span class="timeline-dot"></span><div><time>09:00 · 工具</time><p>readFile · README.md（示例）</p></div></div></div><div class="skill-cards"><article class="skill-card"><span class="skill-code">GENERAL</span><h2>通用助理</h2><p>按目标选择步骤，不强制流程。</p><button class="text-button">用于新任务</button></article></div><div class="boundary-note"><div><strong>权限不会随指导文字扩大</strong><p>未开放 Shell、浏览器或桌面控制。</p></div></div></section>
<section id="approval"><h2>场景：审阅具体写入</h2><div class="approval-card"><div class="approval-top"><div><span class="eyebrow">需要你的确认</span><h2>创建一份成果文件</h2></div><span class="badge">一次性授权</span></div><p>只写入成果库，不修改项目目录。</p><div class="file-preview"><div class="file-preview-bar"><strong>checklist.md</strong></div><pre># 改造清单\\n\\n- 接入真实模型\\n- 检查权限与恢复\\n</pre></div><div class="approval-footer"><span>绑定文件与完整内容</span><div><button class="secondary" id="deny">拒绝写入</button><button class="primary" id="approve">批准创建</button></div></div><p id="approval-result" role="status"></p></div></section>
<section id="artifacts"><h2>成果与预览弹窗</h2><button class="artifact-row" id="artifact-open"><span><strong>checklist.md</strong><small>已保存 · 示例成果</small></span><span class="badge">查看内容</span></button><div class="modal-backdrop" id="artifact-dialog" hidden><section class="artifact-modal" role="dialog" aria-modal="true" aria-label="checklist.md"><div class="modal-heading"><h2>checklist.md</h2><button class="secondary" id="artifact-close">关闭</button></div><pre># 改造清单\\n\\n这是组件示例，不是真实执行成果。</pre><div class="modal-footer"><button class="text-button" id="artifact-source">查看来源任务</button><button class="primary" id="artifact-download">下载示例</button></div></section></div></section>
<section id="feedback"><h2>反馈、输入与空状态</h2><label class="field-label">模型<input value="deepseek-v4.1-flash" aria-label="示例模型"></label><label class="field-label">API Key<input type="password" placeholder="离线展示不接收凭据" disabled></label><div class="storage-note">系统安全存储状态必须明确展示。</div><div class="settings-actions"><button class="secondary" id="connection-test">测试连接</button><button class="primary" disabled>保存连接</button></div><p class="test-result" id="connection-result" hidden></p><div class="working-state">正在推进任务，进展会保存在本地…</div><div class="empty-state bordered"><h3>还没有已保存的成果</h3><p>批准写入申请后，成果会出现在这里。</p></div><div class="error-banner" role="status">连接未完成。请检查配置后重试。</div></section>
<section id="contrast"><h2>自动计算的对比度</h2><div class="table-scroll"><table><thead><tr><th>模式</th><th>前景 / 背景</th><th>对比度</th></tr></thead><tbody id="contrast-body"></tbody></table></div></section></div>
<script id="design-tokens" type="application/json">${JSON.stringify(tokens)}</script><script>
const tokens=JSON.parse(document.getElementById('design-tokens').textContent);
const pairs=${JSON.stringify(pairs.map(({ mode, foreground, background }) => ({ mode, foreground, background })))};
${contrast.toString()}
document.getElementById('contrast-body').innerHTML=pairs.map(p=>'<tr><td>'+p.mode+'</td><td>'+p.foreground+' / '+p.background+'</td><td>'+contrast(tokens[p.mode]['--color-'+p.foreground],tokens[p.mode]['--color-'+p.background]).toFixed(2)+':1</td></tr>').join('');
document.getElementById('toc').innerHTML=[...document.querySelectorAll('section[id]')].map(s=>'<a href="#'+s.id+'">'+s.querySelector('h2').textContent+'</a>').join('');
for(const [key,value]of Object.entries(tokens.light).filter(([k,v])=>k.startsWith('--color-')&&v.startsWith('#'))){const item=document.createElement('div');item.className='swatch';const color=document.createElement('div');color.className='swatch-color';color.style.background='var('+key+')';item.append(color,document.createTextNode(key.replace('--color-','')));document.getElementById('swatches').append(item);}
document.getElementById('theme').onclick=()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';document.getElementById('theme').textContent=dark?'切换浅色模式':'切换深色模式';};
document.querySelector('form').onsubmit=e=>{e.preventDefault();document.getElementById('composition-result').textContent='已提交示例。没有模型调用或文件操作。';};
document.getElementById('folder').onclick=e=>e.target.textContent=e.target.textContent==='选择项目目录'?'示例目录（未授权真实文件）':'选择项目目录';
for(const id of ['approve','deny'])document.getElementById(id).onclick=()=>document.getElementById('approval-result').textContent=id==='approve'?'示例审批通过。未创建真实文件。':'示例写入被拒绝。';
for(const group of ['nav','tab'])for(const button of document.querySelectorAll('.'+group))button.onclick=()=>{for(const peer of button.parentElement.querySelectorAll('.'+group))peer.classList.remove(group==='nav'?'active':'selected');button.classList.add(group==='nav'?'active':'selected');document.getElementById('list-feedback').textContent='当前示例：'+button.textContent;};
document.querySelector('.search-box input').oninput=e=>document.querySelector('.task-row').hidden=!('整理桌面改造清单'.includes(e.target.value));
document.querySelector('.task-row').onclick=()=>document.getElementById('approval').scrollIntoView();
document.querySelector('.skill-card button').onclick=()=>document.getElementById('composition').scrollIntoView();
document.getElementById('inspector-toggle').onclick=e=>{const node=document.getElementById('inspector-sample');node.hidden=!node.hidden;e.target.textContent=node.hidden?'显示执行详情':'隐藏执行详情';};
const modal=document.getElementById('artifact-dialog');modal.style.display='none';
document.getElementById('artifact-open').onclick=()=>{modal.hidden=false;modal.style.display='grid';document.getElementById('artifact-close').focus();};
const close=()=>{modal.hidden=true;modal.style.display='none';document.getElementById('artifact-open').focus();};
document.getElementById('artifact-close').onclick=close;document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
document.getElementById('artifact-source').onclick=()=>{close();document.getElementById('activity').scrollIntoView();};
document.getElementById('artifact-download').onclick=()=>{const url=URL.createObjectURL(new Blob(['# 示例清单'],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='checklist.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.getElementById('connection-test').onclick=()=>{const result=document.getElementById('connection-result');result.hidden=false;result.textContent='离线展示：未发送网络请求。';};
</script></body></html>`;
function validate(specValue, htmlValue) {
  const s = JSON.parse(specValue.match(/<!-- TOKENS_JSON (.+) -->/)[1]);
  const h = JSON.parse(htmlValue.match(/<script id="design-tokens" type="application\/json">(.+?)<\/script>/)[1]);
  if (JSON.stringify(s) !== JSON.stringify(tokens) || JSON.stringify(h) !== JSON.stringify(tokens)) throw new Error('Design token drift');
}
if (process.argv.includes('--check')) {
  const s = readFileSync('docs/redesign/design-system.md', 'utf8');
  const h = readFileSync('docs/redesign/design-showcase.html', 'utf8');
  validate(s, h);
  let rejected = false;
  try { validate(s.replace(light['--color-primary'], '#000000'), h); }
  catch { rejected = true; }
  // First replacement can be outside the token JSON. Mutate the actual embedded token data.
  const mutated = { ...tokens, light: { ...light, '--color-primary': '#000000' } };
  try { validate(s.replace(JSON.stringify(tokens), JSON.stringify(mutated)), h); }
  catch { rejected = true; }
  if (!rejected) throw new Error('Drift negative test did not fail');
  console.log(JSON.stringify({ result: 'DESIGN_TOKENS_AND_CONTRAST_OK', textPairs: pairs.length, minimumRatio: Math.min(...pairs.map(p => p.ratio)).toFixed(2), mutationRejected: rejected }));
} else {
  writeFileSync('docs/redesign/design-system.md', spec);
  writeFileSync('docs/redesign/design-showcase.html', html);
  validate(spec, html);
  console.log(`Generated design specification/showcase; ${pairs.length} contrast pairs passed.`);
}
