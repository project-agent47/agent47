import type { BrowserTool, FileWriterTool } from '@/lib/tools/types';
import type { ResearchDossier, RunArtifact } from './types';

export async function executeExecutionPhase(input: {
  runId: string;
  dossier: ResearchDossier;
  browserTool: BrowserTool;
  fileWriterTool: FileWriterTool;
}): Promise<{ artifacts: RunArtifact[]; executionLog: string[] }> {
  const executionLog: string[] = [];

  for (const step of input.dossier.proposedExecutionPlan) {
    executionLog.push(await input.browserTool.execute(step));
  }

  const artifacts = await input.fileWriterTool.writeArtifacts(input.runId, [
    {
      name: 'research-report.md',
      kind: 'markdown',
      content: `# Report\n\n${input.dossier.findings.join('\n')}`,
    },
    {
      name: 'result.json',
      kind: 'json',
      content: JSON.stringify({ findings: input.dossier.findings }, null, 2),
    },
  ]);

  return { artifacts, executionLog };
}
