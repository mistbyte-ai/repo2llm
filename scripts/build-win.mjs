import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isBuiltin, createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const requiredNode = 'v24.22.0';
const fuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
let step = 'validate environment';

async function main() {
	if (process.platform !== 'win32' || process.arch !== 'x64' || process.version !== requiredNode) {
		throw new Error(`Requires Windows x64 and Node.js ${requiredNode}; found ${process.platform}/${process.arch} ${process.version}`);
	}

	step = 'load build dependencies (run npm ci first)';
	const require = createRequire(import.meta.url);
	const {build, version} = await import('esbuild');
	const {inject} = require('postject');
	if (version !== '0.27.3' || require('postject/package.json').version !== '1.0.0-alpha.6') {
		throw new Error('Requires esbuild 0.27.3 and postject 1.0.0-alpha.6');
	}

	step = 'validate Node executable';
	const runtime = await fs.readFile(process.execPath);
	if (runtime.subarray(0, 2).toString() !== 'MZ' || !runtime.includes(Buffer.from(`${fuse}:0`))) {
		throw new Error('Requires an unmodified Windows Node executable with SEA support; use the official Node.js distribution');
	}

	const buildDir = path.join(root, 'build');
	const distDir = path.join(root, 'dist');
	const bundlePath = path.join(buildDir, 'repo2llm.cjs');
	const blobPath = path.join(buildDir, 'sea-prep.blob');
	const configPath = path.join(buildDir, 'sea-config.json');
	const candidate = path.join(buildDir, 'repo2llm-win-x64.exe');
	const output = path.join(distDir, 'repo2llm-win-x64.exe');
	step = 'prepare output directories';
	await fs.mkdir(buildDir, {recursive: true});
	await fs.mkdir(distDir, {recursive: true});
	// A failed rebuild must not leave a previous executable looking successful.
	await fs.rm(output, {force: true});
	await fs.rm(blobPath, {force: true});

	step = 'bundle application';
	const result = await build({
		absWorkingDir: root,
		entryPoints: ['repo2llm.js'],
		outfile: bundlePath,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node24',
		metafile: true
	});
	for (const name of ['ignore', 'isbinaryfile']) {
		if (!Object.keys(result.metafile.inputs).some(input => input.replaceAll('\\', '/').includes(`node_modules/${name}/`))) {
			throw new Error(`Runtime dependency was not bundled: ${name}`);
		}
	}
	for (const artifact of Object.values(result.metafile.outputs)) {
		for (const dependency of artifact.imports) {
			if (!dependency.external || !isBuiltin(dependency.path)) {
				throw new Error(`Unexpected external dependency: ${dependency.path}`);
			}
		}
	}
	await fs.writeFile(path.join(buildDir, 'bundle-meta.json'), `${JSON.stringify(result.metafile, null, '\t')}\n`);

	step = 'generate SEA preparation blob';
	await fs.writeFile(configPath, `${JSON.stringify({
		main: bundlePath,
		output: blobPath,
		disableExperimentalSEAWarning: true,
		useSnapshot: false,
		useCodeCache: false
	}, null, '\t')}\n`);
	execFileSync(process.execPath, ['--experimental-sea-config', configPath], {
		cwd: root, stdio: 'inherit', timeout: 120000, windowsHide: true
	});

	step = 'inject SEA blob into Node executable';
	await fs.copyFile(process.execPath, candidate);
	await inject(candidate, 'NODE_SEA_BLOB', await fs.readFile(blobPath), {sentinelFuse: fuse});
	step = 'publish completed executable to dist';
	await fs.copyFile(candidate, output);
	console.log(`Built ${output} (${(await fs.stat(output)).size} bytes) using Node.js ${process.version}`);
}

main().catch(err => {
	console.error(`Windows build failed (${step}): ${err.message}`);
	process.exitCode = 1;
});
