/** @type {import('@playwright/test').PlaywrightTestConfig} */
const customURL = process.env.SMOKE_TEST_URL;

export default {
	forbidOnly: !!process.env.CI,
	// generous timeouts on CI
	timeout: process.env.CI ? 45000 : 15000,
	webServer: customURL ? undefined : {
		command:'pnpm build && pnpm preview -- --port 3000',
		port: 3000
	},
	retries: process.env.CI ? 5 : 0,
	use: {
		baseURL: customURL || 'http://localhost:3000',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	},
	workers: process.env.CI ? 2 : undefined
};
