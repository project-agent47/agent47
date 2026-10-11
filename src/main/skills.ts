import { mkdir, readdir, lstat, readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { sha256, safeProjectPath } from '../core/tools';
import type { SkillView, SkillImport } from '../shared/contracts';

const meta = z.object({ name: z.string().max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), description: z.string().min(1).max(1024) });
interface Bundle { view: SkillView; instructions: string; files: Record<string, string> }
async function scan(path: string): Promise<Bundle> {
  if (await realpath(path) !== resolve(path) || (await lstat(path)).isSymbolicLink()) throw new Error('Skill symlink denied');
  const files: Record<string, string> = {};
  let bytes = 0, entries = 0;
  async function walk(folder: string, prefix = '', depth = 0) {
    if (depth > 10) throw new Error('Skill bundle nesting exceeds limit');
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (++entries > 500) throw new Error('Skill bundle exceeds entry limit');
      if (entry.name.startsWith('.')) continue;
      if (entry.isSymbolicLink()) throw new Error('Skill bundle contains symlinks');
      const rel = prefix + entry.name, file = join(folder, entry.name);
      if (entry.isDirectory()) await walk(file, rel + '/', depth + 1);
      else if (entry.isFile()) {
        const stat = await lstat(file);
        if (stat.size > 65536 || Object.keys(files).length >= 200) throw new Error('Skill bundle exceeds file limits');
        const data = await readFile(file); bytes += data.length;
        if (bytes > 1_000_000 || data.includes(0)) throw new Error('Skill bundle must be bounded UTF-8 text');
        files[rel] = new TextDecoder('utf-8', { fatal: true }).decode(data);
      }
    }
  }
  await walk(path);
  const instructions = files['SKILL.md'];
  const match = instructions?.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('SKILL.md needs YAML frontmatter');
  const header = meta.parse(parse(match[1], { maxAliasCount: 0 }));
  const hash = sha256(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))));
  return { instructions, files, view: { id: header.name, ...header, enabled: false, hash, files: Object.keys(files).sort() } };
}
export class SkillRegistry {
  private bundles = new Map<string, Bundle>();
  private tickets = new Map<string, Bundle>();
  constructor(private root: string) {}
  async start() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (await realpath(this.root) !== resolve(this.root)) throw new Error('Skill storage symlink denied');
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const bundle = await scan(join(this.root, entry.name));
      const state = JSON.parse(await readFile(join(this.root, entry.name, '.enabled.json'), 'utf8').catch(() => 'false'));
      bundle.view.enabled = state === true; this.bundles.set(bundle.view.id, bundle);
    }
  }
  list() { return [...this.bundles.values()].map(bundle => structuredClone(bundle.view)); }
  catalog() { return this.list().filter(s => s.enabled).map(s => ({ id: s.id, description: s.description, hash: s.hash })); }
  async preview(path: string): Promise<SkillImport> {
    const bundle = await scan(path);
    if (this.bundles.has(bundle.view.id)) throw new Error('Skill name already installed; remove/update support is not enabled');
    const ticket = crypto.randomUUID(); this.tickets.set(ticket, bundle);
    return { ticket, skill: bundle.view, instructions: bundle.instructions };
  }
  async install(ticket: string) {
    const bundle = this.tickets.get(ticket);
    if (!bundle || this.bundles.has(bundle.view.id)) throw new Error('Skill import ticket expired');
    const root = join(this.root, bundle.view.id);
    await mkdir(root, { mode: 0o700 });
    for (const [path, content] of Object.entries(bundle.files)) {
      const file = join(root, path);
      await mkdir(resolve(file, '..'), { recursive: true, mode: 0o700 });
      await writeFile(file, content, { flag: 'wx', mode: 0o600 });
    }
    await writeFile(join(root, '.enabled.json'), 'false', { mode: 0o600 });
    this.bundles.set(bundle.view.id, bundle); this.tickets.delete(ticket);
  }
  async set(id: string, enabled: boolean) {
    const bundle = this.bundles.get(id); if (!bundle) throw new Error('Skill not found');
    await writeFile(join(this.root, id, '.enabled.json'), JSON.stringify(enabled), { mode: 0o600 });
    bundle.view.enabled = enabled;
  }
  load(id: string) {
    const bundle = this.bundles.get(id);
    if (!bundle?.view.enabled) throw new Error('Skill missing or disabled');
    return { ...bundle.view, instructions: bundle.instructions, advisory: true, grantsPermissions: false };
  }
  async read(id: string, path: string) {
    const bundle = this.bundles.get(id);
    if (!bundle?.view.enabled || !bundle.files[path]) throw new Error('Skill file missing or disabled');
    await safeProjectPath(join(this.root, id), path);
    return { path, content: bundle.files[path], untrusted: true };
  }
}
