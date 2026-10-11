import { createHash } from 'node:crypto';
import type { TaskRecord, ToolCall } from './store';
/** Canonical observation keys, not a semantic measure of task completion. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function inputKey(call: ToolCall): string {
  return createHash('sha256').update(JSON.stringify([call.toolName, canonical(call.input)])).digest('hex');
}
export function recordObservation(task: TaskRecord, call: ToolCall, value: unknown, error: boolean): void {
  const input = inputKey(call);
  const observation = createHash('sha256').update(JSON.stringify([input, error, canonical(value)])).digest('hex');
  const g = task.progressGuard ?? { repeatedInputs: 0, repeatedObservations: 0, consecutiveErrors: 0 };
  g.repeatedInputs = g.input === input ? g.repeatedInputs + 1 : 1;
  g.repeatedObservations = g.observation === observation ? g.repeatedObservations + 1 : 1;
  g.consecutiveErrors = error ? g.consecutiveErrors + 1 : 0;
  g.input = input; g.observation = observation;
  if (g.repeatedObservations >= 3) g.reason = 'repeated_tool';
  if (g.consecutiveErrors >= 4) g.reason = 'errors';
  task.progressGuard = g;
  task.progress!.tools++; if (error) task.progress!.errors++;
  task.progress!.lastTool = call.toolName; task.progress!.lastAt = new Date().toISOString();
}
