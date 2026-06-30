import { chromium, type Browser, type Page } from 'playwright';
import type { BrowserTool, PageNote } from '../types';

async function withBrowser<T>(handler: (page: Page) => Promise<T>): Promise<T> {
  const browser: Browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== '0',
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });

  try {
    const page = await browser.newPage();
    return await handler(page);
  } finally {
    await browser.close();
  }
}

function buildSummary(title: string, bodyText: string): string {
  const collapsed = bodyText.replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return title ? `Opened ${title}.` : 'Opened the page.';
  }

  return collapsed.slice(0, 320);
}

export function createPlaywrightBrowser(): BrowserTool {
  return {
    async inspect(url: string): Promise<PageNote> {
      return withBrowser(async (page) => {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const title = (await page.title()).trim() || url;
        const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
        return {
          url: page.url(),
          title,
          summary: buildSummary(title, bodyText),
          citations: [page.url()],
        };
      });
    },

    async execute(planStep: string): Promise<string> {
      return withBrowser(async (page) => {
        await page.setContent(`<main><pre data-step>${planStep}</pre></main>`);
        return `Executed browser step: ${planStep}`;
      });
    },
  };
}
