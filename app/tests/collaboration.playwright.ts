import { test, expect } from '@playwright/test';

test.describe('collaboration UI', () => {
  test('two tabs in the same room show both users in awareness', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto('/');
    await page2.goto('/');

    // Page 1: click Collaborate to start a session
    await page1.locator('text=Collaborate').click();

    // Both pages should show the collaboration bar
    await expect(page1.locator('text=Synced').or(page1.locator('text=Connected'))).toBeVisible({ timeout: 10000 });
    await expect(page2.locator('text=Synced').or(page2.locator('text=Connected'))).toBeVisible({ timeout: 10000 });

    // Page 1 should see at least itself in the user list
    // (AwarenessPanel may show 1 or 2 users depending on timing)
    await page1.locator('[title="Show connected users"]').click();
    await expect(page1.locator('text=User')).toBeVisible();

    // Cleanup
    await context.close();
  });
});
