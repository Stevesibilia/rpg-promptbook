import { expect, test } from '@playwright/test';
import { signIn } from './helpers.js';

// Print… against the seeded Sabaoth. The headless shell the other tests run
// in has no PDF viewer and leaves the new tab blank; Chromium in its new
// headless mode shows the PDF as a desktop browser does.
test.use({ channel: 'chromium' });

test('print opens the PDF in a tab', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  const { projects } = (await (await page.request.get('/api/projects')).json()) as {
    projects: { id: string; title: string }[];
  };
  await page.goto(`/projects/${projects.find((p) => p.title === "L'Ancora di Sabaoth")!.id}`);
  await expect(page.locator('.cm-content')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+Shift+P');
  const review = page.getByRole('region', { name: 'PDF review' });
  // The first PDF of a page loads the engine.
  await expect(review.locator('.thumbs-col .th').first()).toBeVisible({ timeout: 60_000 });
  const popup = page.waitForEvent('popup');
  await review.getByRole('button', { name: 'Print…' }).click();
  await expect.poll(async () => (await popup).url(), { timeout: 60_000 }).toMatch(/^blob:/);
  await (await popup).close();
});
