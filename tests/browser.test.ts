import { expect, it } from 'vitest';
import { browserActionScript, browserElementInput, browserFillInput, browserNavigationInput, browserReadInput, browserWaitInput, browserTextScript, browserElementProbeScript } from '../src/shared/browser-tools';

it('uses bounded element references, not selectors or arbitrary page JavaScript', () => {
  const tabId = crypto.randomUUID(), snapshotId = crypto.randomUUID();
  expect(browserElementInput.parse({ tabId, snapshotId, ref: 'e12' }).ref).toBe('e12');
  for (const ref of ['#submit', 'e1000', 'e1;window.alert(1)']) expect(() => browserElementInput.parse({ tabId, snapshotId, ref })).toThrow();
  expect(() => browserFillInput.parse({ tabId, snapshotId, ref: 'e1', text: 'x'.repeat(4001) })).toThrow();
  expect(() => browserNavigationInput.parse({ tabId, url: 'https://example.com/', script: '1' })).toThrow();
});
it('bounds wait conditions and pagination, rejecting JS/selectors and unversioned offsets', () => {
  const tabId = crypto.randomUUID();
  expect(browserReadInput.parse({ tabId })).toMatchObject({ offset: 0, limit: 4000 });
  for (const input of [{ tabId, regionRef: 'r0' }, { tabId, offset: 1 }, { tabId, limit: 8001 }, { tabId, selector: '#x' }]) expect(() => browserReadInput.parse(input)).toThrow();
  for (const input of [{ tabId, condition: { kind: 'js', code: '1' } }, { tabId, condition: { kind: 'loaded' }, timeoutMs: 15001 }]) expect(() => browserWaitInput.parse(input)).toThrow();
});
it('fixed read/probe scripts serialize data and explicitly exclude private form values', () => {
  const malicious = '");globalThis.evil=true;//';
  expect(browserElementProbeScript(malicious)).toContain(JSON.stringify(malicious));
  expect(browserTextScript()).toContain('form,input,textarea,select');
  expect(browserTextScript()).toContain('64000');
  expect(browserTextScript(1, { name: malicious })).toContain(JSON.stringify(JSON.stringify({ name: malicious })));
});
it('serializes model text rather than interpolating executable source', () => {
  const text = '");globalThis.evil=true;//';
  const script = browserActionScript('fill', 1, { tag: 'input' }, text);
  expect(script).toContain(JSON.stringify(text));
  expect(script).toContain('Unsupported or sensitive input');
  expect(script).toContain('verifiedOutcome: false');
});
