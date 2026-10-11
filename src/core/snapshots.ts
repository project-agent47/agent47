import { mkdir, lstat, readFile, open, rename, unlink, rmdir, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Approval } from '../shared/contracts';
import { sha256, safeProjectPath } from './tools';
import { applyProjectWrite, effectDigest, projectTarget, ensureProjectParents } from './effects';

interface Snapshot {
  id: string; taskId: string; root: string; path: string; digest: string;
  kind: 'project_write' | 'directory'; before?: string; beforeMode?: number;
  afterHash: string; createdDirectories: string[]; state: 'prepared' | 'applied' | 'restoring' | 'restored';
}
async function atomicText(path: string, text: string, mode = 0o600): Promise<void> {
  const temp = join(dirname(path), `agent47-${crypto.randomUUID()}.tmp`);
  const handle = await open(temp, 'wx', mode);
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temp, path); } finally { await unlink(temp).catch(() => {}); }
}
/** App-owned write-ahead snapshots, separate from git and project content. */
export class FileSnapshots {
  constructor(private base: string) {}
  private async manifest(taskId: string, id: string): Promise<string> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(taskId) || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid snapshot ID');
    await mkdir(this.base, { recursive: true, mode: 0o700 });
    if ((await lstat(this.base)).isSymbolicLink() || await realpath(this.base) !== resolve(this.base)) throw new Error('Snapshot root changed');
    const folder = join(this.base, taskId);
    await mkdir(folder, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    if ((await lstat(folder)).isSymbolicLink()) throw new Error('Snapshot directory changed');
    const file = join(folder, `${id}.json`);
    try { if ((await lstat(file)).isSymbolicLink()) throw new Error('Snapshot file changed'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return file;
  }
  async apply(taskId: string, action: Approval): Promise<{ saved: true; path: string; snapshotId: string; replayVerified?: boolean }> {
    if (!['project_write', 'directory'].includes(action.kind ?? '') || action.state !== 'approved' || effectDigest(taskId, action) !== action.digest) throw new Error('Approval changed');
    const id = sha256(action.id), file = await this.manifest(taskId, id);
    let snapshot: Snapshot | undefined;
    try { snapshot = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (snapshot) {
      if (snapshot.digest !== action.digest || snapshot.taskId !== taskId || snapshot.state === 'restoring' || snapshot.state === 'restored') throw new Error('Snapshot replay conflict');
    } else {
      const path = String(action.payload?.path);
      const { target, missing } = await projectTarget(action.root, path);
      let before: string | undefined, beforeMode: number | undefined;
      if (action.kind === 'project_write') {
        try {
          const stat = await lstat(target);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || stat.size > 65536) throw new Error('Unsafe snapshot target');
          before = await readFile(target, 'utf8'); beforeMode = stat.mode & 0o777;
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if ((before === undefined ? null : sha256(before)) !== action.payload?.expectedHash) throw new Error('File changed before snapshot');
      }
      snapshot = { id, taskId, root: action.root!, path, digest: action.digest, kind: action.kind as Snapshot['kind'],
        before, beforeMode, afterHash: sha256(action.content),
        createdDirectories: action.kind === 'directory' ? missing : missing.slice(0, -1), state: 'prepared' };
      // This must succeed before ANY project directory creation or file modification.
      await atomicText(file, JSON.stringify(snapshot));
    }
    let replayVerified = false;
    if (action.kind === 'project_write') {
      const result = await applyProjectWrite(taskId, action) as { replayVerified?: boolean };
      replayVerified = !!result.replayVerified;
    } else {
      await ensureProjectParents(action.root, snapshot.path);
      await mkdir(resolve(action.root!, snapshot.path), { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const target = await safeProjectPath(action.root, snapshot.path);
      if (!(await lstat(target)).isDirectory()) throw new Error('Directory target changed');
    }
    snapshot.state = 'applied'; await atomicText(file, JSON.stringify(snapshot));
    return { saved: true, path: snapshot.path, snapshotId: id, replayVerified };
  }
  async restore(taskId: string, id: string): Promise<void> {
    const file = await this.manifest(taskId, id);
    const snapshot = JSON.parse(await readFile(file, 'utf8')) as Snapshot;
    if (snapshot.taskId !== taskId || snapshot.id !== id) throw new Error('Snapshot not restorable');
    if (snapshot.state === 'restored') return; // Reconcile a disk commit whose TaskStore acknowledgement was interrupted.
    const { target } = await projectTarget(snapshot.root, snapshot.path);
    if (snapshot.kind === 'project_write') {
      let current: string | undefined;
      try {
        const stat = await lstat(target);
        if (!stat.isFile() || stat.nlink > 1 || stat.isSymbolicLink() || stat.size > 4_000_000) throw new Error('Unsafe restore target');
        current = await readFile(target, 'utf8');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const alreadyRestored = snapshot.state === 'restoring' && current === snapshot.before;
      if (!alreadyRestored && (current === undefined || sha256(current) !== snapshot.afterHash)) throw new Error('Snapshot conflict: file changed since Agent47 wrote it. No overwrite performed.');
      snapshot.state = 'restoring'; await atomicText(file, JSON.stringify(snapshot));
      if (!alreadyRestored) {
        if (snapshot.before === undefined) await unlink(target);
        else await atomicText(target, snapshot.before, snapshot.beforeMode);
      }
    } else {
      snapshot.state = 'restoring'; await atomicText(file, JSON.stringify(snapshot));
    }
    // Only remove directories we created, and only if still empty.
    for (const path of [...snapshot.createdDirectories].reverse()) {
      try { await rmdir(await safeProjectPath(snapshot.root, path)); }
      catch (error) {
        if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        if (snapshot.kind === 'directory' && ['ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) throw new Error('Snapshot conflict: directory is no longer empty.');
      }
    }
    snapshot.state = 'restored'; await atomicText(file, JSON.stringify(snapshot));
  }
}
