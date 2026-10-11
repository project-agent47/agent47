import { z } from 'zod';

export const browserTabInput = z.object({ tabId: z.string().uuid() }).strict();
export const browserOpenInput = z.object({ url: z.string().url().max(2048) }).strict();
export const browserNavigationInput = browserTabInput.extend({ url: z.string().url().max(2048) }).strict();
export const browserElementInput = browserTabInput.extend({ snapshotId: z.string().uuid(), ref: z.string().regex(/^e\d{1,3}$/) }).strict();
export const browserFillInput = browserElementInput.extend({ text: z.string().max(4000) }).strict();
export const browserScrollInput = browserTabInput.extend({ deltaY: z.number().int().min(-2000).max(2000) }).strict();
export const browserReadNames = new Set(['browserTabs', 'browserRead', 'browserNavigate', 'browserActivate', 'browserScroll']);
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
  globalThis.__agent47Browser = { nodes, describe, visible };
  return { title: document.title.slice(0,200), elements: refs };
})()`;

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
