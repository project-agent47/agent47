import { randomUUID } from 'node:crypto';
import { relative, isAbsolute, join, basename } from 'node:path';
import { z } from 'zod';
import type { MaterialSnapshot } from '../core/materials';
import { validateMaterialSnapshot } from '../core/materials';
import { sha256, safeProjectPath } from '../core/tools';
import type { ProjectStore } from '../core/projects';
import type { TaskStore } from '../core/store';
import type { Workspace } from './workspace';
import type { ProjectContext, MaterialView, ResourceSource, ResourceView, RunProjectContext } from '../shared/contracts';

const id = z.string().uuid();
export const resourceSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('artifact'), taskId: id, artifactId: z.string().min(1).max(128) }).strict(),
  z.object({ kind: z.literal('pin'), projectId: id, pinId: id, expectedHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ kind: z.literal('projectFile'), projectId: id, path: z.string().min(1).max(4096), expectedHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
  z.object({ kind: z.literal('taskFile'), taskId: id, path: z.string().min(1).max(4096), expectedHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
]);
export const materialView = (m: MaterialSnapshot): MaterialView => ({ id: m.id, name: m.name, sha256: m.sha256, bytes: m.bytes, capturedAt: m.capturedAt, source: m.source, frozen: m.frozen, sourceTaskId: m.sourceTaskId, sourceArtifactId: m.sourceArtifactId });
export const resourceKey = (m: MaterialSnapshot) => sha256(m.source === 'artifact' ? `artifact:${m.sourceTaskId}:${m.sourceArtifactId}` : `file:${m.path}`);

/** A projection, not another artifact repository. Version bodies use TaskStore.material_versions. */
export class Resources {
  constructor(private projects: ProjectStore, private store: TaskStore, private workspace: Workspace) {
    for (const p of projects.list()) this.context(p.id); // Fail closed on dangling pins.
  }
  context(projectId: string): ProjectContext {
    const p = this.projects.get(projectId), c = this.projects.context(projectId);
    return { projectId, name: p.name, revision: c.revision, instructions: c.instructions, instructionHash: c.instructionHash,
      pins: c.pins.map(pin => {
        const material = this.store.material(pin.materialId);
        if (!material.frozen || resourceKey(material) !== pin.resourceKey) throw new Error('Invalid immutable project resource binding');
        return { id: pin.id, material: materialView(material) };
      }) };
  }
  runContext(projectId: string): RunProjectContext {
    const { pins, ...context } = this.context(projectId); void pins; return context;
  }
  list(projectId?: string): ResourceView[] {
    if (projectId) this.projects.get(projectId);
    const rows = new Map<string, ResourceView>();
    const working = new Set<string>();
    for (const t of this.projects.decorate(this.store.views())) if ((!projectId || t.projectId === projectId) && t.root) for (const change of [...(t.fileChanges ?? [])].reverse()) {
      if (change.kind === 'directory' || !change.sha256 || change.bytes === undefined || change.state === 'restored' || change.cleanedFrom === 'restored') continue;
      const p = this.projects.list().find(p => p.rootEnabled && p.root === t.root);
      const key = sha256(`file:${join(t.root, change.path)}`); if (working.has(key)) continue; working.add(key);
      rows.set(`${key}:${change.sha256}`, { key, name: basename(change.path), sha256: change.sha256, bytes: change.bytes, kind: 'artifact', taskId: t.id, pins: [], projectNames: t.projectId ? [this.projects.get(t.projectId).name] : [],
        source: p ? { kind: 'projectFile', projectId: p.id, path: change.path, expectedHash: change.sha256 } : { kind: 'taskFile', taskId: t.id, path: change.path, expectedHash: change.sha256 } });
    }
    for (const t of this.projects.decorate(this.store.views())) if (!projectId || t.projectId === projectId) for (const a of t.artifacts) {
      const key = sha256(`artifact:${t.id}:${a.id}`);
      rows.set(`${key}:${a.sha256}`, { key, name: a.name, sha256: a.sha256, bytes: Buffer.byteLength(a.content), kind: 'artifact', source: { kind: 'artifact', taskId: t.id, artifactId: a.id }, taskId: t.id, pins: [], projectNames: t.projectId ? [this.projects.get(t.projectId).name] : [] });
    }
    for (const p of this.projects.list().filter(p => !projectId || p.id === projectId)) for (const pin of this.projects.context(p.id).pins) {
      const m = this.store.material(pin.materialId), key = `${pin.resourceKey}:${m.sha256}`, prior = rows.get(key);
      const binding = { projectId: p.id, pinId: pin.id };
      if (prior) { prior.pins.push(binding); prior.projectNames = [...new Set([...(prior.projectNames ?? []), p.name])]; prior.source = { kind: 'pin', projectId: p.id, pinId: pin.id, expectedHash: m.sha256 }; }
      else rows.set(key, { key: pin.resourceKey, name: m.name, sha256: m.sha256, bytes: m.bytes, kind: m.source === 'artifact' ? 'artifact' : 'material', taskId: m.sourceTaskId, projectNames: [p.name],
        source: { kind: 'pin', projectId: p.id, pinId: pin.id, expectedHash: m.sha256 }, pins: [binding] });
    }
    return [...rows.values()];
  }
  private pin(source: Extract<ResourceSource, { kind: 'pin' }>) {
    const pin = this.projects.context(source.projectId).pins.find(p => p.id === source.pinId);
    if (!pin) throw new Error('请刷新资源列表：固定关系已移除。');
    const material = this.store.material(pin.materialId);
    if (material.sha256 !== source.expectedHash) throw new Error('请重新选择资源：固定版本已更新。');
    return { pin, material };
  }
  async capture(source: ResourceSource): Promise<MaterialSnapshot> {
    if (source.kind === 'pin') return this.pin(source).material;
    const material = source.kind === 'artifact' ? await this.workspace.captureResource(source)
      : await this.workspace.captureResource({ root: source.kind === 'projectFile' ? (await this.projects.folder(source.projectId)).root! : this.taskRoot(source.taskId), path: source.path });
    if (['projectFile', 'taskFile'].includes(source.kind) && 'expectedHash' in source && source.expectedHash && source.expectedHash !== material.sha256) throw new Error('请在目录视图重新选择当前版本：工作文件已变化，不能引用旧写入记录。');
    for (const p of this.projects.list()) for (const pin of this.projects.context(p.id).pins) if (pin.resourceKey === resourceKey(material)) {
      const known = this.store.material(pin.materialId); if (known.sha256 === material.sha256) return known;
    }
    return material;
  }
  private taskRoot(id: string) {
    const task = this.store.get(id);
    if (!task.root || !this.projects.allowed(task)) throw new Error('请重新授权原目录后查看工作文件。');
    return task.root;
  }
  async open(source: ResourceSource) {
    if (source.kind === 'pin') return this.workspace.openMaterial(this.pin(source).material);
    if (source.kind === 'artifact') return this.workspace.openSource(source);
    const root = source.kind === 'projectFile' ? (await this.projects.folder(source.projectId)).root! : this.taskRoot(source.taskId);
    return this.workspace.openProjectPath(root, source.path);
  }
  pinMaterial(projectId: string, expectedRevision: number, original: MaterialSnapshot, originProjectId?: string) {
    const c = this.projects.context(projectId);
    if (c.revision !== expectedRevision) throw new Error('请重新审阅项目上下文：版本已变化。');
    validateMaterialSnapshot(original);
    if (original.selection) throw new Error('请固定完整文本资源；选区仅用于对话引用。');
    const key = resourceKey(original), old = c.pins.find(p => p.resourceKey === key);
    if (old && this.store.material(old.materialId).sha256 === original.sha256) return this.context(projectId);
    let material: MaterialSnapshot = { ...original, frozen: true };
    // Same source+version across projects shares one immutable body.
    for (const p of this.projects.list()) for (const pin of this.projects.context(p.id).pins) if (pin.resourceKey === key) {
      const known = this.store.material(pin.materialId); if (known.sha256 === material.sha256) material = known;
    }
    const pins = [...c.pins.filter(p => p.id !== old?.id), { id: old?.id ?? randomUUID(), materialId: material.id, resourceKey: key, originProjectId }];
    if (pins.length > 10 || pins.reduce((n, p) => n + (p.materialId === material.id ? material.bytes : this.store.material(p.materialId).bytes), 0) > 5_000_000) throw new Error('请减少固定材料：最多10份、合计5 MB。');
    this.store.archiveMaterial(material); this.projects.saveContext(projectId, expectedRevision, { pins });
    return this.context(projectId);
  }
  async updatePin(projectId: string, expectedRevision: number, pinId: string, remove = false) {
    const c = this.projects.context(projectId), pin = c.pins.find(p => p.id === pinId);
    if (!pin) throw new Error('请刷新固定材料列表。');
    if (remove) { this.projects.saveContext(projectId, expectedRevision, { pins: c.pins.filter(p => p.id !== pinId) }); return this.context(projectId); }
    const old = this.store.material(pin.materialId);
    if (pin.originProjectId) {
      const p = await this.projects.folder(pin.originProjectId), path = relative(p.root!, old.path!).replaceAll('\\', '/');
      if (isAbsolute(path) || await safeProjectPath(p.root, path) !== old.path) throw new Error('请重新授权原目录后更新固定版本。');
    }
    const next = await this.workspace.refreshMaterial(old);
    return this.pinMaterial(projectId, expectedRevision, next, pin.originProjectId);
  }
}
