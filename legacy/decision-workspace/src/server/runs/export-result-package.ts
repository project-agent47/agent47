import type { ResultPackage } from '@/lib/runtime/types';

export function exportResultPackage(packageData: ResultPackage): string {
  const lines = [
    '# Result Package',
    '',
    `## Summary`,
    packageData.summary,
    '',
    `## Recommendation`,
    packageData.recommendation,
    '',
    '## Next Actions',
    ...packageData.nextActions.map((action) => `- ${action}`),
  ];

  return lines.join('\n');
}
