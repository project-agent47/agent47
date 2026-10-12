import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { RunProjectContext } from '../shared/contracts';
export function validateRunContext(input: RunProjectContext | undefined) {
  if (!input) return;
  const c = z.object({ projectId: z.string().uuid(), name: z.string().min(1).max(96), revision: z.number().int().nonnegative(), instructions: z.string().max(6000), instructionHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(input);
  if (createHash('sha256').update(c.instructions).digest('hex') !== c.instructionHash) throw new Error('Invalid immutable project context hash');
}
