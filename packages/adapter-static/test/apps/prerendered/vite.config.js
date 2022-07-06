const { sveltekit } = await import(process.env.SVELTEKIT_PLUGIN ?? '../../../../kit/src/vite/index.js');

/** @type {import('vite').UserConfig} */
const config = {
	build: {
		minify: false
	},
	plugins: [sveltekit()]
};

export default config;
