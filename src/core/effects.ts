import { lstat, readFile, realpath, open, rename, unlink } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import type { Approval } from '../shared/contracts';
import type { ToolCall } from './store';
import { safeProjectPath, sha256, writeInput, editInput, shellInput, codeInput } from './tools';

export type HostExecutor = (approval: Approval, signal: AbortSignal) => Promise<unknown>;
export const effectNames = new Set(['writeFile', 'editFile', 'runShell', 'runCode']);
export function effectDigest(taskId: string, action: Approval): string {
  return sha256(JSON.stringify({ taskId, id: action.id, kind: action.kind, root: action.root, name: action.name, content: action.content, payload: action.payload, before: action.before }));
}
async function writeTarget(root: string | undefined, path: string): Promise<string> {
  const parent = await safeProjectPath(root, dirname(path).replaceAll('\\', '/'));
  // Validate the filename even when it doesn't exist; no parent creation or hidden paths.
  if (basename(path) !== path.split('/').at(-1) || !/^[^\\/:.\0][^\\/:\0]*$/.test(basename(path))) throw new Error('Invalid project filename');
  const target = resolve(parent, basename(path));
  try { return await safeProjectPath(root, path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return target; }
}
export async function prepareEffect(taskId: string, call: ToolCall, root: string | undefined, hostEnabled: boolean): Promise<Approval> {
  let kind: Approval['kind'], name: string, content: string, payload: Record<string, unknown>, before: string | undefined;
  if (call.toolName === 'writeFile' || call.toolName === 'editFile') {
    const input = call.toolName === 'writeFile' ? writeInput.parse(call.input) : editInput.parse(call.input);
    const target = await writeTarget(root, input.path);
    let previous: string | undefined;
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.size > 65536 || stat.isSymbolicLink()) throw new Error('Only bounded regular text can be modified');
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
  const target = await writeTarget(action.root, path);
  let current: string | undefined;
  try { current = await readFile(target, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (current !== undefined && sha256(current) === sha256(action.content)) return { saved: true, path, sha256: sha256(current), replayVerified: true };
  if ((current === undefined ? null : sha256(current)) !== action.payload?.expectedHash) throw new Error('File changed after approval; refusing overwrite');
  if (await realpath(dirname(target)) !== dirname(target)) throw new Error('Parent changed');
  const temp = resolve(dirname(target), `agent47-${crypto.randomUUID()}.tmp`);
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(action.content); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temp, target); } finally { await unlink(temp).catch(() => {}); }
  return { saved: true, path, sha256: sha256(action.content) };
}
