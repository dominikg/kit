import glob from 'tiny-glob/sync.js';
import fs from 'fs';
const changesets = glob('./*-*-*.md');
const packages = ['@sveltejs/adapter-begin','realworld.svelte.dev','sandbox','@sveltejs/vite-plugin-svelte','@sveltejs/snowpack-config'];
const deleted = [];
for (const file of changesets){
	let changeset = fs.readFileSync(file,'utf-8');
	for(const p of packages){
		changeset = changeset.replace(new RegExp(`'${p}': (patch|minor|major)\n`),'')
	}
	if(changeset.match(/^---(?:\s*\n)*---$/m)) {
		console.log('removing changeset without affected packages: '+file);
		fs.rmSync(file);
		deleted.push(file);
	} else  {
		fs.writeFileSync(file,changeset,'utf-8');
	}
}
const preFile = 'pre.json'
const pre = JSON.parse(fs.readFileSync(preFile,'utf-8'));
pre.initialVersions = Object.fromEntries(Object.entries(pre.initialVersions).filter(([name])=>!packages.includes(name)));
pre.changesets = pre.changesets.filter(c => !deleted.includes(c))
fs.writeFileSync(preFile,JSON.stringify(pre,null,2));
