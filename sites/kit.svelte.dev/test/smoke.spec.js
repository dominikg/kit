import { test, expect } from '@playwright/test';
test.describe('kit.svelte.dev site',() => {
	test.beforeEach(async ({page}) => {
		await page.goto('/');
	});
	test('has a descriptive title', async ({ page }) => {
		const title = page.locator('head > title');
		await expect(title).toHaveText('SvelteKit • The fastest way to build Svelte apps');
	});
	// TODO more tests, nav, search, error pages etc
});

