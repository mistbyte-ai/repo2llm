import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const stateName = '.repo2llm-state.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function field(output, key) {
	const line = output.split(/\r?\n/).find(item => item.startsWith(`${key}: `));
	assert.ok(line, `Missing metadata field: ${key}`);
	return line.slice(key.length + 2);
}

function entry(output, name) {
	const text = output.split(`===== FILE: ${name} =====`)[1];
	assert.ok(text, `Missing file entry: ${name}`);
	return text.split('===== FILE: ')[0];
}

function checkHash(output, name, bytes) {
	const hash = sha256(bytes);
	assert.equal(field(entry(output, name), 'sha256'), hash);
	const manifest = output.split('===== FILE HASHES (SHA-256) =====')[1]?.split(/\r?\n\r?\n/)[0];
	assert.ok(manifest?.split(/\r?\n/).includes(`${name}: ${hash}`), `Missing manifest hash: ${name}`);
}

async function main() {
	if (process.platform !== 'win32' || process.arch !== 'x64') {
		throw new Error('Windows x64 is required to test the native executable');
	}
	const executable = path.resolve(process.argv[2] || path.join(repoRoot, 'dist/repo2llm-win-x64.exe'));
	const header = await fs.open(executable, 'r');
	try {
		const magic = Buffer.alloc(2);
		await header.read(magic, 0, 2, 0);
		assert.equal(magic.toString(), 'MZ', 'Expected a Windows executable');
	}
	finally {
		await header.close();
	}

	const tempBase = await fs.realpath(os.tmpdir());
	const relative = path.relative(await fs.realpath(repoRoot), tempBase);
	assert.ok(relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative),
		'TEMP/TMP must point outside the repository');
	const temp = await fs.mkdtemp(path.join(tempBase, 'repo2llm-win-smoke-'));
	try {
		const gitConfig = path.join(temp, 'empty-git-config');
		await fs.writeFile(gitConfig, '');
		const bin = path.join(temp, 'standalone Ю');
		const cwd = path.join(temp, 'unrelated working directory');
		await fs.mkdir(bin);
		await fs.mkdir(cwd);
		const exe = path.join(bin, 'repo2llm-win-x64.exe');
		await fs.copyFile(executable, exe);
		assert.deepEqual(await fs.readdir(bin), ['repo2llm-win-x64.exe']);

		const env = {...process.env};
		for (const key of Object.keys(env)) {
			if (/^GIT_/i.test(key) || /^NODE_(OPTIONS|PATH)$/i.test(key)) {
				delete env[key];
			}
		}
		env.GIT_CONFIG_NOSYSTEM = '1';
		env.GIT_CONFIG_GLOBAL = gitConfig;

		const isolatedEnv = {...env};
		for (const key of Object.keys(isolatedEnv)) {
			if (/^path$/i.test(key)) {
				delete isolatedEnv[key];
			}
		}
		const systemRoot = process.env.SystemRoot;
		assert.ok(systemRoot && path.isAbsolute(systemRoot), 'SystemRoot must be available');
		// Retain Windows system tools, excluding developer installations and Git.
		isolatedEnv.PATH = [
			path.join(systemRoot, 'System32'), systemRoot,
			path.join(systemRoot, 'System32', 'Wbem'),
			path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0')
		].join(path.delimiter);
		const options = {cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true};
		const isolatedOptions = {...options, env: isolatedEnv};
		for (const command of ['node.exe', 'npm.cmd', 'npm.exe', 'npx.cmd', 'git.exe']) {
			const located = spawnSync(path.join(systemRoot, 'System32', 'where.exe'), [command], isolatedOptions);
			assert.ifError(located.error);
			assert.equal(located.status, 1, `${command} must be absent from the controlled search path: ${located.stdout}`);
		}
		const missingGit = spawnSync('git', ['--version'], isolatedOptions);
		assert.equal(missingGit.error?.code, 'ENOENT', 'Git must genuinely be unavailable');
		const run = (args, overrides = {}) => execFileSync(exe, args, {...options, ...overrides});
		const runIsolated = args => run(args, {env: isolatedEnv});
		assert.match(runIsolated(['help']), /Usage: repo2llm/);

		const plain = path.join(temp, 'plain project Ю');
		await fs.mkdir(plain);
		await fs.writeFile(path.join(plain, 'source file Ю.txt'), 'plain\r\n');
		await fs.writeFile(path.join(plain, '.env.example'), 'example');
		const plainSnapshot = runIsolated(['snapshot', plain]);
		assert.equal(field(plainSnapshot, 'gitAvailable'), 'no');
		assert.equal(field(plainSnapshot, 'ignoreFilePresent'), 'no');
		assert.doesNotMatch(plainSnapshot, /===== FILE: \.env\.example =====/);
		checkHash(plainSnapshot, 'source file Ю.txt', Buffer.from('plain\r\n'));
		await assert.rejects(fs.access(path.join(plain, stateName)), {code: 'ENOENT'});
		assert.match(runIsolated(['init-ignore', plain]), /created:/);
		const generated = await fs.readFile(path.join(plain, '.repo2llm-ignore'), 'utf8');
		assert.ok(generated.split('\n').includes('__pycache__/'));
		assert.match(runIsolated(['init-ignore', plain]), /already exists:/);
		assert.equal(await fs.readFile(path.join(plain, '.repo2llm-ignore'), 'utf8'), generated);

		const project = path.join(temp, 'Git project Ю');
		await fs.mkdir(project);
		await fs.writeFile(path.join(project, '.repo2llm-ignore'), '.git/\n.env\nbuild/\ndist/\n');
		await fs.writeFile(path.join(project, '.gitignore'), `${stateName}\nignored*\n`);
		const source = 'source file Ю.txt';
		const raw = Buffer.from('first\r\nsecond\r\n');
		await fs.writeFile(path.join(project, source), raw);
		await fs.writeFile(path.join(project, 'deleted.txt'), 'to delete');
		await fs.writeFile(path.join(project, 'image.bin'), Buffer.from([0, 255, 1, 0]));
		await fs.writeFile(path.join(project, 'drawing.svg'), '<svg>private-asset-content</svg>');
		await fs.writeFile(path.join(project, 'untracked space.txt'), 'original');
		await fs.writeFile(path.join(project, 'ignored space.txt'), 'ignored by Git');
		await fs.writeFile(path.join(project, '.env'), 'synthetic secret');
		await fs.writeFile(path.join(project, '.env.example'), 'example');
		const git = args => execFileSync('git', ['-C', project, ...args], options).trim();
		const commit = message => git(['-c', 'user.name=repo2llm smoke', '-c', 'user.email=smoke@example.invalid',
			'-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message]);
		git(['init', '--quiet']);
		git(['add', '--', '.repo2llm-ignore', '.gitignore', source, 'deleted.txt']);
		commit('Initial fixture');

		const snapshot = run(['snapshot', project]);
		checkHash(snapshot, source, raw);
		assert.notEqual(sha256(raw), sha256(raw.toString().replaceAll('\r\n', '\n')));
		assert.equal(field(entry(snapshot, source), 'gitStatus'), 'tracked');
		assert.equal(field(entry(snapshot, 'untracked space.txt'), 'gitStatus'), 'untracked');
		assert.equal(field(entry(snapshot, 'ignored space.txt'), 'gitStatus'), 'ignored');
		assert.doesNotMatch(snapshot, /===== FILE: \.env =====|===== FILE: \.repo2llm-state\.json =====/);
		assert.ok(entry(snapshot, '.env.example'));
		for (const [name, bytes, kind] of [
			['image.bin', Buffer.from([0, 255, 1, 0]), 'binary-skipped'],
			['drawing.svg', Buffer.from('<svg>private-asset-content</svg>'), 'asset-skipped']
		]) {
			checkHash(snapshot, name, bytes);
			assert.equal(field(entry(snapshot, name), 'contentState'), kind);
		}
		assert.doesNotMatch(snapshot, /private-asset-content/);

		git(['add', '--all']);
		commit('Track fixture files');
		const cleanSnapshot = run(['snapshot'], {cwd: project});
		assert.equal(field(cleanSnapshot, 'gitWorkingTree'), 'clean');
		assert.equal(field(cleanSnapshot, 'gitSnapshotFilesIgnored'), '1');
		const saved = JSON.parse(await fs.readFile(path.join(project, stateName), 'utf8'));
		const oldHead = git(['rev-parse', 'HEAD']);
		const newTime = saved.files[source].mtimeMs / 1000 + 10;
		await fs.utimes(path.join(project, source), newTime, newTime);
		await fs.writeFile(path.join(project, 'untracked space.txt'), 'changed contents with a different size');
		await fs.writeFile(path.join(project, 'new file Ю.txt'), 'new content');
		await fs.unlink(path.join(project, 'deleted.txt'));
		const relativeProject = path.relative(cwd, project);
		assert.ok(!path.isAbsolute(relativeProject));
		const diff = run(['diff', relativeProject]);
		assert.equal(field(entry(diff, source), 'changeType'), 'modified');
		checkHash(diff, source, raw);
		checkHash(diff, 'untracked space.txt', Buffer.from('changed contents with a different size'));
		assert.equal(field(entry(diff, 'new file Ю.txt'), 'changeType'), 'new');
		assert.equal(field(entry(diff, 'new file Ю.txt'), 'gitStatus'), 'untracked');
		const deleted = entry(diff, 'deleted.txt');
		assert.equal(field(deleted, 'contentState'), 'deleted');
		assert.equal(field(deleted, 'gitStatus'), 'unavailable');
		assert.doesNotMatch(deleted, /^sha256:/m);
		assert.match(deleted, /<EOF deleted.txt — deleted>/);
		const afterDiff = JSON.parse(await fs.readFile(path.join(project, stateName), 'utf8'));
		const counters = ['Tracked', 'Untracked', 'Ignored'].map(kind => Number(field(diff, `gitSnapshotFiles${kind}`)));
		assert.deepEqual(counters, [7, 1, 1]);
		assert.equal(counters.reduce((sum, count) => sum + count, 0), Object.keys(afterDiff.files).length);
		assert.equal(field(diff, 'gitHead'), oldHead);
		assert.equal(run(['diff', project]), 'No changes detected.\n');
		assert.match(run(['status', relativeProject]), /workingTree: clean/);
		const map = run(['map', relativeProject]);
		assert.ok(map.split(/\r?\n/).includes(source));
		assert.doesNotMatch(map, /FILE HASHES|GIT METADATA|sha256:|gitStatus:/);
		git(['add', '--all']);
		commit('Change Git HEAD after saved diff');
		assert.notEqual(git(['rev-parse', 'HEAD']), oldHead);
		await fs.writeFile(path.join(project, source), 'today differs from the saved diff');
		assert.equal(run(['last-diff', project]), diff);
		assert.equal(runIsolated(['last-diff', project]), diff);

		// Old saved diffs must not acquire fabricated historical metadata.
		delete afterDiff.lastDiff.git;
		for (const file of Object.values(afterDiff.lastDiff.entries)) {
			delete file.sha256;
			delete file.gitStatus;
		}
		await fs.writeFile(path.join(project, stateName), JSON.stringify(afterDiff));
		const legacy = runIsolated(['last-diff', project]);
		assert.doesNotMatch(legacy, /FILE HASHES|GIT METADATA|sha256:|gitStatus:/);
		assert.equal(field(legacy, 'generatedAt'), afterDiff.lastDiff.generatedAt);

		const noGitSnapshot = runIsolated(['snapshot', project]);
		assert.equal(field(noGitSnapshot, 'gitAvailable'), 'no');
		assert.equal(field(entry(noGitSnapshot, source), 'gitStatus'), 'unavailable');
		await fs.writeFile(path.join(project, source), 'changed without Git');
		const noGitDiff = runIsolated(['diff', project]);
		assert.equal(field(noGitDiff, 'gitAvailable'), 'no');
		checkHash(noGitDiff, source, Buffer.from('changed without Git'));
		assert.equal(runIsolated(['last-diff', project]), noGitDiff);

		const nested = path.join(project, 'nested Ю');
		await fs.mkdir(nested);
		await fs.writeFile(path.join(nested, '.repo2llm-ignore'), '');
		await fs.writeFile(path.join(nested, 'nested file.txt'), 'nested');
		git(['add', '--', 'nested Ю']);
		commit('Track nested fixture');
		const nestedSnapshot = run(['snapshot', nested]);
		assert.equal(field(entry(nestedSnapshot, 'nested file.txt'), 'gitStatus'), 'tracked');
		assert.equal(field(nestedSnapshot, 'gitHead'), git(['rev-parse', 'HEAD']));
		assert.deepEqual(await fs.readdir(bin), ['repo2llm-win-x64.exe']);
		console.log('Windows EXE smoke tests passed: all CLI commands, standalone runtime, hashes, Git and historical replay');
	}
	finally {
		await fs.rm(temp, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
	}
}

main().catch(err => {
	console.error(`Windows EXE smoke tests failed: ${err.stack || err.message}`);
	process.exitCode = 1;
});
