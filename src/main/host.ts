import { utilityProcess } from 'electron';
import { join } from 'node:path';
import type { HostExecutor } from '../core/effects';
import { safeProjectPath } from '../core/tools';
import { relative } from 'node:path';

export const executeHost: HostExecutor = async (action, signal) => {
  const cwd = String(action.payload?.cwd);
  await safeProjectPath(action.root, relative(action.root!, cwd).replaceAll('\\', '/') || '.');
  const timeoutMs = Number(action.payload?.timeoutMs);
  const env: Record<string, string> = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP', 'LANG']) if (process.env[key]) env[key] = process.env[key]!;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Execution cancelled'));
    const child = utilityProcess.fork(join(__dirname, 'host-worker.cjs'), [], { cwd, env, stdio: 'pipe', serviceName: 'Agent47 Approved Host Tool' });
    let output = '', bytes = 0, settled = false;
    const capture = (chunk: Buffer) => { const room = Math.max(0, 65536 - bytes); output += chunk.subarray(0, room).toString('utf8'); bytes += chunk.length; };
    child.stdout?.on('data', capture); child.stderr?.on('data', capture);
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); child.kill();
      if (error) reject(error); else resolve({ result: value, output, truncated: bytes > 65536, sandboxed: false });
    };
    const abort = () => finish(new Error('Execution cancelled; effects may already have occurred'));
    const timer = setTimeout(() => finish(new Error('Execution timeout; effects may already have occurred')), timeoutMs + 1000);
    signal.addEventListener('abort', abort, { once: true });
    child.once('message', value => finish(undefined, value));
    child.once('exit', () => finish(new Error('Execution exited without a result; effects may have occurred')));
    child.once('spawn', () => child.postMessage({ kind: action.kind, content: action.content, cwd, timeoutMs }));
  });
};
