import { z } from 'zod';

export const browserTabInput = z.object({ tabId: z.string().uuid() }).strict();
export const browserOpenInput = z.object({ url: z.string().url().max(2048) }).strict();
export const browserNavigationInput = browserTabInput.extend({ url: z.string().url().max(2048) }).strict();
export const browserElementInput = browserTabInput.extend({ snapshotId: z.string().uuid(), ref: z.string().regex(/^e\d{1,3}$/) }).strict();
export const browserFillInput = browserElementInput.extend({ text: z.string().max(4000) }).strict();
export const browserScrollInput = browserTabInput.extend({ deltaY: z.number().int().min(-2000).max(2000) }).strict();
export const browserReadInput = browserTabInput.extend({
  snapshotId: z.string().uuid().optional(), regionRef: z.string().regex(/^r\d{1,2}$/).optional(),
  offset: z.number().int().min(0).max(64000).default(0), limit: z.number().int().min(500).max(8000).default(4000),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/).optional()
}).strict().superRefine((v, ctx) => {
  if (v.regionRef && !v.snapshotId) ctx.addIssue({ code: 'custom', message: 'Region requires snapshotId' });
  if (v.offset && !v.expectedDigest) ctx.addIssue({ code: 'custom', message: 'Pagination requires expectedDigest' });
});
export const browserWaitInput = browserTabInput.extend({
  condition: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('loaded') }).strict(),
    z.object({ kind: z.literal('text'), text: z.string().min(1).max(200) }).strict(),
    z.object({ kind: z.literal('element'), name: z.string().min(1).max(160) }).strict(),
    z.object({ kind: z.literal('url'), url: z.string().url().max(2048) }).strict()
  ]), timeoutMs: z.number().int().min(250).max(15000).default(5000)
}).strict();
export const browserReadNames = new Set(['browserTabs', 'browserRead', 'browserWait', 'browserNavigate', 'browserActivate', 'browserScroll']);
export const browserEffectNames = new Set(['browserOpen', 'browserClick', 'browserFill']);

/** Fixed programs only. Model data is serialized, never evaluated as JavaScript. */
export const browserSnapshotScript = `(() => {
  const visible = e => { const r = e.getBoundingClientRect(); if (!e.isConnected || !r.width || !r.height || e.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let p = e; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false; } return true; };
  const describe = e => ({
    tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || '',
    name: (e.getAttribute('aria-label') || (e.labels && Array.from(e.labels).map(l => l.textContent).join(' ')) || e.getAttribute('placeholder') || (!['INPUT','TEXTAREA','SELECT'].includes(e.tagName) ? e.textContent : '') || '').trim().slice(0, 160),
    type: e.getAttribute('type') || '', href: (e.getAttribute('href') || '').slice(0,2048),
    disabled: !!e.disabled, readOnly: !!e.readOnly
  });
  const nodes = Array.from(document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[role="link"]')).filter(e => visible(e) && !e.closest('iframe,[contenteditable]') && !['password','file','hidden'].includes((e.getAttribute('type') || '').toLowerCase())).slice(0, 60);
  const refs = nodes.map((e, i) => ({ ref: 'e' + i, ...describe(e) }));
  const regionNodes = Array.from(document.querySelectorAll('main,article,section,[role="region"],[role="main"]')).filter(visible).slice(0,40);
  const regions = regionNodes.map((e,i) => ({ ref:'r'+i, tag:e.tagName.toLowerCase(), name:(e.getAttribute('aria-label') || e.querySelector('h1,h2,h3,h4')?.textContent || e.id || '').trim().slice(0,160) }));
  globalThis.__agent47Browser = { nodes, describe, visible, regionNodes, regions };
  return { title: document.title.slice(0,200), elements: refs, regions };
})()`;

/** Fixed bounded extraction, never model-provided selectors/JS; no form values. */
export function browserTextScript(regionIndex?: number, regionDescriptor?: unknown) {
  return `(() => {
    const registry=globalThis.__agent47Browser;
    const root=${regionIndex === undefined ? 'document.body' : `registry?.regionNodes[${regionIndex}]`};
    if(!root) throw new Error('Missing browser region');
    ${regionIndex === undefined ? '' : `if(!registry.visible(root) || JSON.stringify(registry.regions[${regionIndex}]) !== ${JSON.stringify(JSON.stringify(regionDescriptor))}) throw new Error('Stale browser region');`}
    const cache=new WeakMap();
    function allowed(el) {
      if(!el)return true; if(cache.has(el))return cache.get(el);
      const s=getComputedStyle(el), ok=!el.matches('script,style,noscript,form,input,textarea,select,[contenteditable],iframe,[hidden],[aria-hidden="true"]') &&
        s.display!=='none' && s.visibility!=='hidden' && s.opacity!=='0' && allowed(el.parentElement);
      cache.set(el,ok);return ok;
    }
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT), pieces=[];
    let node,count=0,visited=0,truncated=false;
    while(node=walker.nextNode()){
      if(++visited>50000){truncated=true;break;}
      if(!allowed(node.parentElement))continue;
      const text=(node.textContent||'').replace(/\\\\s+/g,' ').trim();if(!text)continue;
      pieces.push(text.slice(0,64001-count));count+=text.length+1;
      if(count>64000){truncated=true;break;}
    }
    return {title:document.title.slice(0,200),content:pieces.join(' ').slice(0,64000),truncated};
  })()`;
}

/** Poll controls without replacing the current actionable element registry. */
export function browserElementProbeScript(name: string) {
  return `(() => {
    const nodes=Array.from(document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[role="link"]')).slice(0,2000);
    return nodes.some(e=>{
      if(e.closest('iframe,[contenteditable],[hidden],[aria-hidden="true"]') || ['password','file','hidden'].includes((e.getAttribute('type')||'').toLowerCase()))return false;
      const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;
      for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;}
      const label=(e.getAttribute('aria-label')||(e.labels&&Array.from(e.labels).map(l=>l.textContent).join(' '))||e.getAttribute('placeholder')||(!['INPUT','TEXTAREA','SELECT'].includes(e.tagName)?e.textContent:'')||'').trim().slice(0,160);
      return label===${JSON.stringify(name)};
    });
  })()`;
}

export function browserActionScript(action: 'click' | 'fill', index: number, descriptor: unknown, text?: string) {
  return `(() => {
    const registry = globalThis.__agent47Browser, e = registry?.nodes[${index}];
    if (!e || !registry.visible(e) || JSON.stringify(registry.describe(e)) !== ${JSON.stringify(JSON.stringify(descriptor))} || e.disabled || e.readOnly) throw new Error('Stale browser element');
    if (${JSON.stringify(action)} === 'fill') {
      if (!['INPUT','TEXTAREA'].includes(e.tagName) || !['text','search','email','url','tel','number',''].includes((e.getAttribute('type') || '').toLowerCase())) throw new Error('Unsupported or sensitive input');
      const proto = e.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(text ?? '')});
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.tagName) && ['password','file','hidden'].includes((e.getAttribute('type') || '').toLowerCase())) throw new Error('Sensitive input');
      e.click();
    }
    return { dispatched: true, verifiedOutcome: false };
  })()`;
}
