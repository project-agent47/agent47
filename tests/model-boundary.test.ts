import { expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../src/core/store';
import { TaskRuntime } from '../src/core/runtime';
it('rejects duplicate tool-call IDs instead of reusing a past approval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent47-call-id-'));
  const store = new TaskStore(join(root, 'tasks.db'));
  const runtime = new TaskRuntime(store, async () => ({
    text: '', calls: [{ toolCallId: 'same', toolName: 'unknown', input: { path: '.' } }],
    messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'same', toolName: 'unknown', input: { path: '.' } }] }]
  }), join(root, 'artifacts'));
  runtime.start(); runtime.create('repeat call ID', 'general');
  try {
    const deadline = Date.now() + 5000;
    while (runtime.list()[0].status !== 'failed') {
      if (Date.now() > deadline) throw new Error('Timeout');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    expect(runtime.list()[0].steps).toBe(1);
    expect(runtime.list()[0].artifacts).toHaveLength(0);
  } finally { runtime.shutdown(); store.close(); }
});
