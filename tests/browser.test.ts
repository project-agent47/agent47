import { expect, it } from 'vitest';
import { browserActionScript, browserElementInput, browserFillInput, browserNavigationInput } from '../src/shared/browser-tools';

it('uses bounded element references, not selectors or arbitrary page JavaScript', () => {
  const tabId = crypto.randomUUID(), snapshotId = crypto.randomUUID();
  expect(browserElementInput.parse({ tabId, snapshotId, ref: 'e12' }).ref).toBe('e12');
  for (const ref of ['#submit', 'e1000', 'e1;window.alert(1)']) expect(() => browserElementInput.parse({ tabId, snapshotId, ref })).toThrow();
  expect(() => browserFillInput.parse({ tabId, snapshotId, ref: 'e1', text: 'x'.repeat(4001) })).toThrow();
  expect(() => browserNavigationInput.parse({ tabId, url: 'https://example.com/', script: '1' })).toThrow();
});
it('serializes model text rather than interpolating executable source', () => {
  const text = '");globalThis.evil=true;//';
  const script = browserActionScript('fill', 1, { tag: 'input' }, text);
  expect(script).toContain(JSON.stringify(text));
  expect(script).toContain('Unsupported or sensitive input');
  expect(script).toContain('verifiedOutcome: false');
});
