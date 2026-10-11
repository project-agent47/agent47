import { lstat, readFile, realpath, open, rename, unlink, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Approval } from '../shared/contracts';
import type { ToolCall } from './store';
import { safeProjectPath, sha256, writeInput, editInput, shellInput, codeInput, pathInput } from './tools';

export type HostExecutor = (approval: Approval, signal: AbortSignal) => Promise<unknown>;
export const effectNames = new Set(['writeFile', 'editFile', 'makeDirectory', 'runShell', 'runCode']);
export function effectDigest(taskId: string, action: Approval): string {
  return sha256(JSON.stringify({ taskId, id: action.id, kind: action.kind, root: action.root, name: action.name, content: action.content, payload: action.payload, before: action.before }));
}
export async function projectTarget(root: string | undefined, path: string): Promise<{ target: string; missing: string[] }> {
  if (!path || path === '.' || path.endsWith('/')) throw new Error('Invalid project path');
  await safeProjectPath(root, '.');
  let ancestor = path;
  const missing: string[] = [];
  while (true) {
    try {
      const existing = await safeProjectPath(root, ancestor);
      if (ancestor !== path && !(await lstat(existing)).isDirectory()) throw new Error('Parent is not a directory');
      return { target: resolve(root!, path), missing: missing.reverse() };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing.push(ancestor); ancestor = dirname(ancestor).replaceAll('\\', '/');
    }
  }
}
export async function ensureProjectParents(root: string | undefined, path: string): Promise<void> {
  const { missing } = await projectTarget(root, path);
  for (const part of missing.slice(0, -1)) {
    await safeProjectPath(root, dirname(part).replaceAll('\\', '/'));
    await mkdir(resolve(root!, part), { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    await safeProjectPath(root, part);
  }
}
export async function prepareEffect(taskId: string, call: ToolCall, root: string | undefined, hostEnabled: boolean): Promise<Approval> {
  let kind: Approval['kind'], name: string, content: string, payload: Record<string, unknown>, before: string | undefined;
  if (call.toolName === 'makeDirectory') {
    const { path } = pathInput.parse(call.input);
    const { target } = await projectTarget(root, path);
    try { if (!(await lstat(target)).isDirectory()) throw new Error('Target is not a directory'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    kind = 'directory'; name = path; content = `Create directory: ${path}`; payload = { path };
  } else if (call.toolName === 'writeFile' || call.toolName === 'editFile') {
    const input = call.toolName === 'writeFile' ? writeInput.parse(call.input) : editInput.parse(call.input);
    const { target } = await projectTarget(root, input.path);
    let previous: string | undefined;
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.size > 65536 || stat.isSymbolicLink() || stat.nlink > 1) throw new Error('Only bounded regular non-linked text can be modified');
      const data = await readFile(target); if (data.includes(0)) throw new Error('Binary modification denied');
      previous = new TextDecoder('utf-8', { fatal: true }).decode(data);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if ((previous === undefined ? null : sha256(previous)) !== input.expectedHash) throw new Error('File changed or hash does not match. Read the file again.');
    before = previous;
    if (call.toolName === 'editFile') {
      const edit = editInput.parse(input);
      if (previous === undefined || previous.split(edit.oldText).length !== 2) throw new Error('Edit must match exactly once');
      content = previous.replace(edit.oldText, edit.newText);
    } else content = writeInput.parse(input).content;
    kind = 'project_write'; name = input.path; payload = { path: input.path, expectedHash: input.expectedHash };
  } else {
    if (!hostEnabled) throw new Error('Host execution is disabled');
    const input = call.toolName === 'runShell' ? shellInput.parse(call.input) : codeInput.parse(call.input);
    const cwd = await safeProjectPath(root, input.cwd);
    if (!(await lstat(cwd)).isDirectory()) throw new Error('cwd is not a directory');
    kind = call.toolName === 'runShell' ? 'shell' : 'code'; name = kind === 'shell' ? '主机 Shell 命令' : 'Node JavaScript';
    content = 'command' in input ? input.command : input.code;
    payload = { cwd, timeoutMs: input.timeoutMs };
  }
  const action: Approval = { id: call.toolCallId, kind, name, content, root, payload, before,
    digest: '', expiresAt: new Date(Date.now() + 86400_000).toISOString(), state: 'pending' };
  action.digest = effectDigest(taskId, action); return action;
}
export async function applyProjectWrite(taskId: string, action: Approval): Promise<unknown> {
  if (action.state !== 'approved' || action.kind !== 'project_write' || effectDigest(taskId, action) !== action.digest) throw new Error('Approval changed');
  const path = String(action.payload?.path);
  await ensureProjectParents(action.root, path);
  const { target } = await projectTarget(action.root, path);
  let current: string | undefined;
  let mode = 0o600;
  try {
    const stat = await lstat(target);
    if (!stat.isFile() || stat.nlink > 1 || stat.isSymbolicLink() || stat.size > 1_000_000) throw new Error('Unsafe write target');
    mode = stat.mode & 0o777; current = await readFile(target, 'utf8');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (current !== undefined && sha256(current) === sha256(action.content)) return { saved: true, path, sha256: sha256(current), replayVerified: true };
  if ((current === undefined ? null : sha256(current)) !== action.payload?.expectedHash) throw new Error('File changed after approval; refusing overwrite');
  if (await realpath(dirname(target)) !== dirname(target)) throw new Error('Parent changed');
  const temp = resolve(dirname(target), `agent47-${crypto.randomUUID()}.tmp`);
  const handle = await open(temp, 'wx', mode);
  try { await handle.writeFile(action.content); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temp, target); } finally { await unlink(temp).catch(() => {}); }
  return { saved: true, path, sha256: sha256(action.content) };
}
