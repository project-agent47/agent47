import { expect, test } from '@playwright/test';

test('signs in and starts a learning path run from the fullscreen workbench', async ({ page }) => {
  await page.goto('/');
  await Promise.all([
    page.waitForURL(/\/signin$/),
    page.getByRole('link', { name: 'Start a workspace' }).click(),
  ]);

  await page.getByLabel('Email').fill('demo@decision.work');
  await page.getByLabel('Password').fill('demo-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/workspaces\//);
  await expect(page.getByTestId('workbench-sidebar')).toBeVisible();
  await expect(page.getByTestId('workbench-activity')).toBeVisible();
  await expect(page.getByTestId('workbench-inspector')).toBeVisible();
  await expect(page.getByTestId('workbench-composer')).toBeVisible();
  await expect(page.getByPlaceholder('Describe the decision, deliverable, or question you need help with.')).toBeVisible();

  await page.getByPlaceholder('Describe the decision, deliverable, or question you need help with.').fill('Plan my frontend growth');
  await page.getByRole('button', { name: 'Run' }).click();

  await expect(page.locator('body')).toContainText(
    'Run created with the fallback recipe. Review the evidence and next steps on the right.',
  );
  await expect(
    page.getByTestId('workbench-activity').getByRole('heading', { name: 'Plan my frontend growth' }),
  ).toBeVisible();
});

test('approves a research run and shows packaged artifacts in the workbench', async ({ page }) => {
  await page.goto('/');
  await Promise.all([
    page.waitForURL(/\/signin$/),
    page.getByRole('link', { name: 'Start a workspace' }).click(),
  ]);

  await page.getByLabel('Email').fill('demo@decision.work');
  await page.getByLabel('Password').fill('demo-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/workspaces\//);

  const createdWorkspaceJson = (await page.evaluate(async () => {
    const response = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Lifecycle workspace' }),
    });

    return (await response.json()) as {
      workspace: { id: string };
    };
  })) as {
    workspace: { id: string };
  };
  const workspaceId = createdWorkspaceJson.workspace.id;

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page).toHaveURL(new RegExp(`/workspaces/${workspaceId}$`));

  await page.getByPlaceholder('Describe the decision, deliverable, or question you need help with.').fill(
    'Research a frontend learning path',
  );

  const createRunResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes(`/api/workspaces/${workspaceId}/runs`) &&
      !response.url().includes('/approve'),
  );
  await page.getByRole('button', { name: 'Run' }).click();

  const createdRun = await createRunResponse;
  expect(createdRun.ok()).toBeTruthy();

  const createdRunJson = (await createdRun.json()) as {
    run: { id: string; approval?: { status?: string } | null };
  };
  expect(createdRunJson.run.approval?.status).toBe('pending');
  await expect(page.getByTestId('workbench-inspector')).toContainText('Awaiting approval');
  await expect(page.getByTestId('workbench-inspector')).toContainText('Research dossier ready for approval.');

  const approveResult = (await page.evaluate(
    async ({ workspaceId: currentWorkspaceId, runId }) => {
      const response = await fetch(`/api/workspaces/${currentWorkspaceId}/runs/${runId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      });

      return {
        status: response.status,
        body: (await response.json()) as {
          run?: {
            approval?: { status?: string } | null;
            artifactBundle?: { generatedFileIds?: string[]; reportArtifactId?: string | null } | null;
          };
        },
      };
    },
    { workspaceId, runId: createdRunJson.run.id },
  )) as {
    status: number;
    body: {
      run?: {
        approval?: { status?: string } | null;
        artifactBundle?: { generatedFileIds?: string[]; reportArtifactId?: string | null } | null;
      };
    };
  };

  expect(approveResult.status).toBe(200);
  const approvedRunJson = approveResult.body;

  expect(approvedRunJson.run.approval?.status).toBe('approved');
  expect(approvedRunJson.run.artifactBundle?.generatedFileIds).toHaveLength(2);
  expect(approvedRunJson.run.artifactBundle?.reportArtifactId).toBeTruthy();

  await page.reload();
  await expect(page.getByTestId('workbench-inspector')).toContainText('Approved for execution');
  await expect(page.getByTestId('workbench-activity')).toContainText('Execution completed');
  await expect(page.getByTestId('workbench-activity')).toContainText('Execution packaged');

  for (const artifactId of approvedRunJson.run.artifactBundle?.generatedFileIds ?? []) {
    await expect(page.getByText(artifactId)).toBeVisible();
  }
});
