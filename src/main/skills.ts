import { mkdir, readdir, lstat, readFile, writeFile, realpath, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { sha256 } from '../core/tools';
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
  private expected = new Map<string, string | undefined>();
  private versions = new Map<string, Bundle>();
  private mutations = Promise.resolve();
  constructor(private root: string) {}
  async start() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (await realpath(this.root) !== resolve(this.root)) throw new Error('Skill storage symlink denied');
    const index = await readFile(join(this.root, '.registry.json'), 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return undefined; throw error; });
    if (index !== undefined) {
      const entries = z.array(z.object({ id: meta.shape.name, hash: z.string().regex(/^[a-f0-9]{64}$/), enabled: z.boolean() }).strict()).parse(JSON.parse(index));
      for (const entry of entries) {
        const folder = join(this.root, '.versions', entry.id);
        for (const file of await readdir(folder)) {
          if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
          const bundle = JSON.parse(await readFile(join(folder, file), 'utf8')) as Bundle;
          if (bundle.view.id !== entry.id || bundle.view.hash !== file.slice(0, -5) || this.hash(bundle) !== bundle.view.hash) throw new Error('Skill integrity failure');
          this.versions.set(`${entry.id}:${bundle.view.hash}`, bundle);
        }
        const bundle = this.versions.get(`${entry.id}:${entry.hash}`);
        if (!bundle) throw new Error('Skill version missing');
        bundle.view.enabled = entry.enabled; this.bundles.set(entry.id, bundle);
      }
      return;
    }
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const bundle = await scan(join(this.root, entry.name));
      const state = JSON.parse(await readFile(join(this.root, entry.name, '.enabled.json'), 'utf8').catch(() => 'false'));
      bundle.view.enabled = state === true; this.bundles.set(bundle.view.id, bundle);
      await this.archive(bundle);
    }
    await this.persist();
  }
  private hash(bundle: Bundle) { return sha256(JSON.stringify(Object.entries(bundle.files).sort(([a], [b]) => a.localeCompare(b)))); }
  private async archive(bundle: Bundle) {
    const folder = join(this.root, '.versions', bundle.view.id);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const path = join(folder, `${bundle.view.hash}.json`);
    try { await writeFile(path, JSON.stringify(bundle), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    this.versions.set(`${bundle.view.id}:${bundle.view.hash}`, structuredClone(bundle));
  }
  private async persist() {
    const file = join(this.root, '.registry.json');
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(this.list().map(({ id, hash, enabled }) => ({ id, hash, enabled }))), { flag: 'wx', mode: 0o600 });
    await rename(temp, file);
  }
  private mutate(operation: () => Promise<void>) {
    const pending = this.mutations.then(operation); this.mutations = pending.catch(() => {}); return pending;
  }
  list() { return [...this.bundles.values()].map(bundle => structuredClone(bundle.view)); }
  catalog() { return this.list().filter(s => s.enabled).map(s => ({ id: s.id, description: s.description, hash: s.hash })); }
  async preview(path: string): Promise<SkillImport> {
    const bundle = await scan(path);
    const ticket = crypto.randomUUID(); this.tickets.set(ticket, bundle); this.expected.set(ticket, this.bundles.get(bundle.view.id)?.view.hash);
    return { ticket, skill: bundle.view, instructions: bundle.instructions, resources: structuredClone(bundle.files), replaces: this.bundles.get(bundle.view.id)?.view.hash };
  }
  install(ticket: string) { return this.mutate(async () => {
    const bundle = this.tickets.get(ticket);
    if (!bundle) throw new Error('Skill import ticket expired');
    if (this.bundles.get(bundle.view.id)?.view.hash !== this.expected.get(ticket)) throw new Error('Skill changed after preview; review again');
    await this.archive(bundle);
    const before = this.bundles.get(bundle.view.id);
    this.bundles.set(bundle.view.id, bundle);
    try { await this.persist(); } catch (error) { if (before) this.bundles.set(bundle.view.id, before); else this.bundles.delete(bundle.view.id); throw error; }
    this.tickets.delete(ticket); this.expected.delete(ticket);
  }); }
  set(id: string, enabled: boolean) { return this.mutate(async () => {
    const bundle = this.bundles.get(id); if (!bundle) throw new Error('Skill not found');
    const prior = bundle.view.enabled;
    bundle.view.enabled = enabled;
    try { await this.persist(); } catch (error) { bundle.view.enabled = prior; throw error; }
  }); }
  remove(id: string) { return this.mutate(async () => {
    const prior = this.bundles.get(id); if (!prior) throw new Error('Skill not found');
    this.bundles.delete(id);
    try { await this.persist(); } catch (error) { this.bundles.set(id, prior); throw error; }
  }); }
  private selected(id: string, hash?: string) {
    if (!this.bundles.get(id)?.view.enabled) throw new Error('Skill missing or disabled');
    const bundle = hash ? this.versions.get(`${id}:${hash}`) : this.bundles.get(id);
    if (!bundle) throw new Error('Skill pinned version missing');
    return bundle;
  }
  load(id: string, hash?: string) {
    const bundle = this.selected(id, hash);
    return { ...bundle.view, enabled: true, instructions: bundle.instructions, advisory: true, grantsPermissions: false };
  }
  async read(id: string, path: string, hash?: string) {
    const bundle = this.selected(id, hash);
    if (!Object.hasOwn(bundle.files, path)) throw new Error('Skill file missing or disabled');
    // Package contents were scanned and copied; never reopen user-controlled paths.
    return { path, content: bundle.files[path], untrusted: true };
  }
}
