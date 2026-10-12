import type { Artifact } from '../shared/contracts';
import { validateEvidence, type EvidenceSnapshot } from './evidence';
import { sha256 } from './tools';

/** Freeze only actual receipts already available when the artifact is saved. */
export function bindArtifactEvidence(content: string, archive: Record<string, EvidenceSnapshot> = {}): string[] {
  const ids = [...new Set([...content.matchAll(/agent47-source:(s[a-f0-9]{16})(?![a-f0-9])/g)].map(match => match[1]))];
  return ids.filter(id => {
    const source = archive[id];
    if (!source || source.id !== id) return false;
    try { validateEvidence(source); return true; } catch { return false; }
  }).slice(0, 128);
}

/** No legacy inference, cross-task lookup, network request or current-file read. */
export function artifactEvidence(artifact: Artifact, contentHash: string, archive: Record<string, EvidenceSnapshot> = {}): EvidenceSnapshot[] {
  if (artifact.sha256 !== contentHash || sha256(artifact.content) !== contentHash) throw new Error('成果版本已变化。');
  if (artifact.evidenceIds === undefined) return [];
  if (!Array.isArray(artifact.evidenceIds) || artifact.evidenceIds.length > 128 ||
    artifact.evidenceIds.some(id => typeof id !== 'string' || !/^s[a-f0-9]{16}$/.test(id)) ||
    new Set(artifact.evidenceIds).size !== artifact.evidenceIds.length) throw new Error('成果来源清单损坏，请保留数据。');
  const referenced = new Set(bindArtifactEvidence(artifact.content, archive));
  return artifact.evidenceIds.filter(id => referenced.has(id)).map(id => archive[id]);
}
