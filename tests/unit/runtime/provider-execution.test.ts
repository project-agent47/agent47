import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeRecipeWithProvider } from '@/lib/runtime/provider-execution';

describe('executeRecipeWithProvider', () => {
  const originalApiKey = process.env.DEEPSEEK_API_KEY;
  const originalBaseUrl = process.env.DEEPSEEK_BASE_URL;
  const originalPlaywrightFlag = process.env.PLAYWRIGHT_TEST;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.test';
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalApiKey;
    }

    if (originalBaseUrl === undefined) {
      delete process.env.DEEPSEEK_BASE_URL;
    } else {
      process.env.DEEPSEEK_BASE_URL = originalBaseUrl;
    }

    if (originalPlaywrightFlag === undefined) {
      delete process.env.PLAYWRIGHT_TEST;
    } else {
      process.env.PLAYWRIGHT_TEST = originalPlaywrightFlag;
    }
  });

  it('parses a structured provider response into a result package', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '{"summary":"A focused learning path for Rust","recommendation":"Start with syntax and build a small CLI tool","citations":[{"source":"DeepSeek","title":"Rust guide"}],"next_actions":["Ship a tiny project"],"confidence":0.93,"open_questions":["What do you want to ship first?"]}',
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await executeRecipeWithProvider({
      workspaceId: 'workspace-1',
      title: 'Learn Rust',
      recipe: 'learning-path',
      goal: 'Learn Rust',
      experience: 'beginner',
      constraints: 'two hours a day',
    });

    expect(result.providerUsed).toBe('openai-compatible');
    expect(result.resultPackage.summary).toContain('focused learning path');
    expect(result.resultPackage.nextActions).toEqual(['Ship a tiny project']);
    expect(result.checkpoints).toContain('Provider response received');
  });

  it('uses the OPENAI-style environment aliases when they are present', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    process.env.OPENAI_APIKEY = 'alias-key';
    process.env.OPENAI_BASEURL = 'https://api.deepseek.test/v1';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '{"summary":"A focused learning path for Rust","recommendation":"Start with syntax and build a small CLI tool","citations":[{"source":"DeepSeek","title":"Rust guide"}],"next_actions":["Ship a tiny project"],"confidence":0.93,"open_questions":[]}',
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await executeRecipeWithProvider({
      workspaceId: 'workspace-1',
      title: 'Learn Rust',
      recipe: 'learning-path',
      goal: 'Learn Rust',
      experience: 'beginner',
      constraints: 'two hours a day',
    });

    expect(result.providerUsed).toBe('openai-compatible');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('uses the local fallback when Playwright marks the server as test-only', async () => {
    process.env.PLAYWRIGHT_TEST = '1';

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeRecipeWithProvider({
      workspaceId: 'workspace-1',
      title: 'Learn Rust',
      recipe: 'learning-path',
      goal: 'Learn Rust',
      experience: 'beginner',
      constraints: 'two hours a day',
    });

    expect(result.providerUsed).toBe('fallback');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the local recipe when provider credentials are unavailable', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_APIKEY;
    delete process.env.OPENAI_BASEURL;

    const result = await executeRecipeWithProvider({
      workspaceId: 'workspace-1',
      title: 'Learn Rust',
      recipe: 'learning-path',
      goal: 'Learn Rust',
      experience: 'beginner',
      constraints: 'two hours a day',
    });

    expect(result.providerUsed).toBe('fallback');
    expect(result.resultPackage.summary).toContain('Learn Rust');
    expect(result.resultPackage.nextActions).toEqual(['Create a weekly study schedule', 'Pick one project to ship']);
  });
});
