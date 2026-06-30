import { expect, test } from '@playwright/test';

test('signs in and starts a learning path run from the fullscreen workbench', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start a workspace' }).click();

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

  await expect(page.locator('body')).toContainText('Run created. Review the brief and the next steps on the right.');
  await expect(
    page.getByTestId('workbench-activity').getByRole('heading', { name: 'Plan my frontend growth' }),
  ).toBeVisible();
});
