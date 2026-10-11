import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

// This process is isolated from the UI/main process, NOT an OS security sandbox.
const port = (process as typeof process & { parentPort: { on: (name: string, fn: (event: { data: { kind: string; content: string; cwd: string; timeoutMs: number } }) => void) => void; postMessage: (value: unknown) => void } }).parentPort;
port.on('message', ({ data }) => {
  if (data.kind === 'code') {
    try {
      const run = new Function('require', data.content);
      Promise.resolve(run(createRequire(__filename))).then(
        () => port.postMessage({ ok: true }),
        () => port.postMessage({ ok: false, error: 'JavaScript execution failed' })
      );
    } catch { port.postMessage({ ok: false, error: 'JavaScript execution failed' }); }
    return;
  }
  const executable = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : '/bin/sh';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', data.content] : ['-c', data.content];
  const child = spawn(executable, args, { cwd: data.cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
  child.stdout.on('data', chunk => process.stdout.write(chunk));
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  const killTree = () => {
    if (!child.pid) return;
    if (process.platform === 'win32') spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
  };
  const timer = setTimeout(killTree, data.timeoutMs);
  process.on('SIGTERM', () => { killTree(); process.exit(1); });
  child.on('error', () => { clearTimeout(timer); port.postMessage({ ok: false, error: 'Shell failed to start' }); });
  child.on('close', (code, signal) => { clearTimeout(timer); port.postMessage({ ok: code === 0, exitCode: code, signal }); });
});
