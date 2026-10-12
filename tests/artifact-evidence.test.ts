import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { artifactEvidence, bindArtifactEvidence } from '../src/core/artifact-evidence';
import { captureEvidence, type EvidenceSnapshot } from '../src/core/evidence';
import { sha256 } from '../src/core/tools';
import type { TaskRecord } from '../src/core/store';
function setup() {
  const task: TaskRecord = { id: randomUUID(), goal: 'Sources', skill: 'general', status: 'completed', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), steps: 0, events: [], artifacts: [], messages: [], pending: [] };
  const { source } = captureEvidence(task, { toolName: 'readFile', toolCallId: 'read', input: {} }, { path: 'notes.md', content: 'ARCHIVED_RANDOM', sha256: sha256('ARCHIVED_RANDOM') }) as { source: EvidenceSnapshot };
  const content = `[事实](${source.uri}) [伪造](agent47-source:s0000000000000000)`;
  const artifact = { id: 'brief', name: 'brief.md', content, sha256: sha256(content), evidenceIds: bindArtifactEvidence(content, task.evidenceSnapshots) };
  return { task, source, artifact };
}
it('freezes only successful observed receipts, deduplicates and rejects malformed IDs', () => {
  const { task, source, artifact } = setup();
  expect(artifact.evidenceIds).toEqual([source.id]);
  expect(bindArtifactEvidence(`${artifact.content} ${source.uri}1`, task.evidenceSnapshots)).toEqual([source.id]);
  expect(bindArtifactEvidence(`${source.uri}f`, task.evidenceSnapshots)).toEqual([]);
});
it('does not activate legacy, unbound or cross-owner citations', () => {
  const { task, artifact } = setup();
  expect(artifactEvidence({ ...artifact, evidenceIds: undefined }, artifact.sha256, task.evidenceSnapshots)).toEqual([]);
  expect(artifactEvidence({ ...artifact, evidenceIds: [] }, artifact.sha256, task.evidenceSnapshots)).toEqual([]);
  expect(artifactEvidence(artifact, artifact.sha256, {})).toEqual([]);
});
it('validates artifact hash and refuses corrupted provenance metadata', () => {
  const { task, artifact } = setup();
  expect(() => artifactEvidence(artifact, '0'.repeat(64), task.evidenceSnapshots)).toThrow();
  expect(() => artifactEvidence({ ...artifact, content: 'changed' }, artifact.sha256, task.evidenceSnapshots)).toThrow();
  expect(() => artifactEvidence({ ...artifact, evidenceIds: ['fake'] }, artifact.sha256, task.evidenceSnapshots)).toThrow();
  expect(() => artifactEvidence({ ...artifact, evidenceIds: [...artifact.evidenceIds, ...artifact.evidenceIds] }, artifact.sha256, task.evidenceSnapshots)).toThrow();
});
it('missing or corrupt archived body fails closed without current-file fallback', () => {
  const { task, source, artifact } = setup();
  task.evidenceSnapshots![source.id].content = 'CORRUPTED';
  expect(artifactEvidence(artifact, artifact.sha256, task.evidenceSnapshots)).toEqual([]);
});
