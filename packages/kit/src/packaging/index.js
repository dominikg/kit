import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

import micromatch from 'micromatch';
import { preprocess } from 'svelte/compiler';

import { mkdirp, rimraf, walk } from '../utils/filesystem.js';

const essential_files = ['README', 'LICENSE', 'CHANGELOG', '.gitignore', '.npmignore'];

/**
 * @param {import('types/config').ValidatedConfig} config
 * @param {string} cwd
 */
export async function make_package(config, cwd = process.cwd()) {
	rimraf(path.join(cwd, config.kit.package.dir));

	if (config.kit.package.emitTypes) {
		// Generate type definitions first so hand-written types can overwrite generated ones
		await emit_dts(config);
	}

	const files_filter = create_filter(config.kit.package.files);
	const exports_filter = create_filter({
		include: config.kit.package.exports.include,
		exclude: [...config.kit.package.exports.exclude, '**/*.d.ts']
	});

	const files = walk(config.kit.files.lib);

	const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));

	delete pkg.scripts;
	pkg.type = 'module';

	/** @type {Record<string, string>} */
	const generated = { './package.json': './package.json' };

	/** @type {Record<string, string>} */
	const clashes = {};

	for (const file of files) {
		const ext = path.extname(file);
		const svelte_ext = config.extensions.find((ext) => file.endsWith(ext)); // unlike `ext`, could be e.g. `.svelte.md`

		if (!files_filter(file.replace(/\\/g, '/'))) {
			const dts_file = (svelte_ext ? file : file.slice(0, -ext.length)) + '.d.ts';
			const dts_path = path.join(cwd, config.kit.package.dir, dts_file);
			if (fs.existsSync(dts_path)) fs.unlinkSync(dts_path);
			continue;
		}

		const filename = path.join(config.kit.files.lib, file);
		const source = fs.readFileSync(filename, 'utf8');

		/** @type {string} */
		let out_file;

		/** @type {string} */
		let out_contents;

		if (svelte_ext) {
			// it's a Svelte component
			out_file = file.slice(0, -svelte_ext.length) + '.svelte';
			out_contents = config.preprocess
				? (await preprocess(source, config.preprocess, { filename })).code
				: source;
		} else if (ext === '.ts' && file.endsWith('.d.ts')) {
			// TypeScript's declaration emit won't copy over the d.ts files, so we do it here
			out_file = file;
			out_contents = source;
			if (fs.existsSync(path.join(cwd, config.kit.package.dir, out_file))) {
				console.warn(
					'Found already existing file from d.ts generation for ' +
						out_file +
						'. This file will be overwritten.'
				);
			}
		} else if (ext === '.ts') {
			out_file = file.slice(0, -'.ts'.length) + '.js';
			out_contents = await transpile_with_esbuild(filename, source);
		} else {
			out_file = file;
			out_contents = source;
		}

		write(path.join(cwd, config.kit.package.dir, out_file), out_contents);

		if (exports_filter(file)) {
			const original = `$lib/${file.replace(/\\/g, '/')}`;
			const entry = `./${out_file.replace(/\\/g, '/')}`;
			const key = entry.replace(/\/index\.js$|(\/[^/]+)\.js$/, '$1');

			if (clashes[key]) {
				throw new Error(
					`Duplicate "${key}" export. Please remove or rename either ${clashes[key]} or ${original}`
				);
			}

			generated[key] = entry;
			clashes[key] = original;
		}
	}

	pkg.exports = { ...generated, ...pkg.exports };
	write(path.join(cwd, config.kit.package.dir, 'package.json'), JSON.stringify(pkg, null, '  '));

	const whitelist = fs.readdirSync(cwd).filter((file) => {
		const lowercased = file.toLowerCase();
		return essential_files.some((name) => lowercased.startsWith(name.toLowerCase()));
	});
	for (const pathname of whitelist) {
		const full_path = path.join(cwd, pathname);
		if (fs.lstatSync(full_path).isDirectory()) continue; // just to be sure

		const package_path = path.join(cwd, config.kit.package.dir, pathname);
		if (!fs.existsSync(package_path)) fs.copyFileSync(full_path, package_path);
	}
}

/**
 * @param {{ include: string[]; exclude: string[] }} options
 * @returns {(str: string) => boolean}
 */
function create_filter(options) {
	return (str) =>
		micromatch.isMatch(str, options.include) && !micromatch.isMatch(str, options.exclude);
}

/**
 * @param {string} file
 * @param {string} contents
 */
function write(file, contents) {
	mkdirp(path.dirname(file));
	fs.writeFileSync(file, contents);
}

/**
 * @param {import('types/config').ValidatedConfig} config
 */
export async function emit_dts(config) {
	const require = createRequire(import.meta.url);
	const emit = await try_load_svelte2tsx_emit_dts();
	await emit({
		libRoot: config.kit.files.lib,
		svelteShimsPath: require.resolve('svelte2tsx/svelte-shims.d.ts'),
		declarationDir: config.kit.package.dir
	});
}

async function try_load_svelte2tsx_emit_dts() {
	const [svelte2tsx] = await try_load(['svelte2tsx'],'You need to install $pkg if you want to generate type definitions');
	const emit_dts = svelte2tsx.emitDts;
	if (!emit_dts) {
		throw new Error(
			'You need to install svelte2tsx >=0.4.1 if you want to generate type definitions'
		);
	}
	return emit_dts;
}

const tsconfck_cache = new Map();
/**
 * @param {string} filename
 * @param {string} source
 */
async function transpile_with_esbuild(filename, source) {
	if (source.trim().length === 0) {
		return source;
	}
	const [esbuild, tsconfck] = await try_load(['esbuild','tsconfck'],'You need to install $pkg if you want to transpile TypeScript files');
	const tsconfig = await tsconfck.parse(filename,{cache: tsconfck_cache}).tsconfig;
	const result = await esbuild.transform(source, { loader: 'ts', tsconfigRaw: tsconfig, sourcefile: filename });
	return result.code;
}

/**
 * @param {string[]} packageNames packages to load
 * @param {string} errorMessage error message for package load error, $pkg is replaced with package name
 * @returns {Promise<any[]>} loaded packages (pkg.default || pkg)
 */
async function try_load(packageNames, errorMessage) {
	return Promise.all(packageNames.map(pkg => {
		return import(pkg).then(pkg => pkg.default || pkg,err => {
			throw new Error(errorMessage.replace('$pkg',pkg));
		});
	}));
}
