const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {test} = require('node:test');
const {analyzeFile} = require('../lib/analyzer');
const {collectProjectFiles} = require('../lib/collector');
const {collectGitMetadata} = require('../lib/git');
const {buildFilesState, compareStateFiles} = require('../lib/state');

const cliPath = path.resolve(__dirname, '../repo2llm.js');
const hash = data => createHash('sha256').update(data).digest('hex');
const stateName = '.repo2llm-state.json';
const gitEnv = {...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull,
	GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
	GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid'};

async function write(root, name, data) {
	const target = path.join(root, name);
	await fs.mkdir(path.dirname(target), {recursive: true});
	await fs.writeFile(target, data);
}

async function fixture(t, repository = false) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo2llm-metadata-'));
	t.after(() => fs.rm(root, {recursive: true, force: true}));
	await write(root, '.repo2llm-ignore', '.git/\n.repo2llm-ignore\n.gitignore\n');
	await write(root, '.gitignore', `${stateName}\nignored*\n`);
	if (repository) {
		git(root, 'init', '--quiet');
	}
	return root;
}

function git(root, ...args) {
	return execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', env: gitEnv});
}

function cli(command, root, env = gitEnv) {
	return execFileSync(process.execPath, [cliPath, command, root], {
		encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe']
	});
}

function field(output, key) {
	return output.split('\n').find(line => line.startsWith(`${key}: `))?.slice(key.length + 2);
}

function fileEntry(output, name) {
	return output.split(`===== FILE: ${name} =====\n`)[1]?.split('\n===== FILE: ')[0];
}

function manifest(output) {
	return output.split('===== FILE HASHES (SHA-256) =====\n')[1]?.split('\n=====')[0].split('\n\n')[0].trimEnd();
}

async function state(root) {
	return JSON.parse(await fs.readFile(path.join(root, stateName), 'utf8'));
}

test('raw bytes hash before normalization; paths, times, binary and SVG do not change hashing', async t => {
	const root = await fixture(t);
	const raw = Buffer.from('first\r\nsecond\rlast\n');
	const binary = Buffer.from([0, 255, 1, 0, 4]);
	const svg = Buffer.from('<svg>private asset</svg>\r\n');
	await write(root, 'one.txt', raw);
	await write(root, 'other.txt', raw);
	await fs.utimes(path.join(root, 'other.txt'), 1000000000, 1000000000);
	await write(root, 'binary.dat', binary);
	await write(root, 'asset.svg', svg);
	await write(root, 'empty.txt', '');
	const files = (await collectProjectFiles(root)).files;
	assert.equal(files.find(file => file.path === 'one.txt').sha256, hash(raw));
	assert.equal(files.find(file => file.path === 'other.txt').sha256, hash(raw));
	assert.equal(files.find(file => file.path === 'one.txt').content, 'first\nsecond\nlast\n');
	assert.notEqual(hash(raw), hash('first\nsecond\nlast\n'));
	for (const [name, bytes, kind] of [['binary.dat', binary, 'binary-skipped'], ['asset.svg', svg, 'asset-skipped']]) {
		const file = files.find(item => item.path === name);
		assert.equal(file.sha256, hash(bytes));
		assert.equal(file.contentState, kind);
		assert.equal(file.content, '');
	}
	const output = cli('snapshot', root);
	assert.ok(manifest(output).includes(`empty.txt: ${hash('')}`));
	assert.ok(manifest(output).includes(`asset.svg: ${hash(svg)}`));
	assert.equal(field(fileEntry(output, 'binary.dat'), 'sha256'), hash(binary));
	assert.doesNotMatch(output, /private asset/);
	await write(root, 'one.txt', 'changed');
	assert.notEqual((await analyzeFile(path.join(root, 'one.txt'), 'one.txt')).sha256, hash(raw));
});

test('symlinks, missing files and read failures explicitly have unavailable hashes', async t => {
	const root = await fixture(t);
	await fs.symlink('missing-target', path.join(root, 'link'));
	const link = await analyzeFile(path.join(root, 'link'), 'link');
	assert.equal(link.sha256, null);
	assert.equal(link.contentState, 'symlink-skipped');
	assert.equal((await analyzeFile(path.join(root, 'missing'), 'missing')).sha256, null);
	// Reading a directory fails even when tests run as root.
	await fs.mkdir(path.join(root, 'directory'));
	const unreadable = await analyzeFile(path.join(root, 'directory'), 'directory');
	assert.equal(unreadable.sha256, null);
	assert.equal(unreadable.contentState, 'read-error');
	await fs.mkdir(path.join(root, 'directory.svg'));
	const asset = await analyzeFile(path.join(root, 'directory.svg'), 'directory.svg');
	assert.equal(asset.sha256, null);
	assert.equal(asset.contentState, 'asset-skipped');
	const output = cli('snapshot', root);
	assert.ok(manifest(output).includes('link: unavailable'));
	assert.equal(field(fileEntry(output, 'link'), 'sha256'), 'unavailable');
});

test('mtime-only change stays modified, hashes never enter the baseline, deletion stays a stub', async t => {
	const root = await fixture(t);
	await write(root, 'same.txt', 'same');
	await write(root, 'deleted.txt', 'gone');
	await write(root, 'unchanged.txt', 'keep');
	cli('snapshot', root);
	const baseline = await state(root);
	assert.deepEqual(Object.keys(baseline.files['same.txt']).sort(), ['mtimeMs', 'size', 'type']);
	const nextTime = baseline.files['same.txt'].mtimeMs / 1000 + 10;
	await fs.utimes(path.join(root, 'same.txt'), nextTime, nextTime);
	await fs.unlink(path.join(root, 'deleted.txt'));
	const output = cli('diff', root);
	assert.match(fileEntry(output, 'same.txt'), /changeType: modified/);
	assert.equal(field(fileEntry(output, 'same.txt'), 'sha256'), hash('same'));
	assert.equal(manifest(output), `same.txt: ${hash('same')}`);
	const deleted = fileEntry(output, 'deleted.txt');
	assert.match(deleted, /contentState: deleted/);
	assert.match(deleted, /<EOF deleted.txt — deleted>/);
	assert.equal(field(deleted, 'sha256'), undefined);
	assert.equal(field(deleted, 'gitStatus'), 'unavailable');
	assert.equal(cli('diff', root), 'No changes detected.\n');
	const before = await fs.readFile(path.join(root, stateName), 'utf8');
	cli('diff', root);
	assert.equal(await fs.readFile(path.join(root, stateName), 'utf8'), before);
	// Different bytes with identical comparison metadata must not become a diff.
	await write(root, 'same.txt', 'xxxx');
	const files = (await collectProjectFiles(root)).files;
	const saved = await state(root);
	const same = files.find(file => file.path === 'same.txt');
	same.mtimeMs = saved.files['same.txt'].mtimeMs;
	assert.deepEqual(compareStateFiles(saved.files, buildFilesState(files)), []);
});

test('hash changes alone do not detect changes when all baseline metadata is identical', async t => {
	const root = await fixture(t);
	const target = path.join(root, 'same.txt');
	await write(root, 'same.txt', 'aaaa');
	await fs.utimes(target, 1700000000, 1700000000);
	const snapshot = cli('snapshot', root);
	assert.equal(field(fileEntry(snapshot, 'same.txt'), 'sha256'), hash('aaaa'));
	await write(root, 'same.txt', 'bbbb');
	await fs.utimes(target, 1700000000, 1700000000);
	assert.equal((await analyzeFile(target, 'same.txt')).sha256, hash('bbbb'));
	assert.equal(cli('diff', root), 'No changes detected.\n');
});

test('empty snapshot and deletion-only diff have empty manifests and valid counters', async t => {
	const root = await fixture(t, true);
	const empty = cli('snapshot', root);
	assert.equal(manifest(empty), '');
	assert.equal(field(empty, 'gitSnapshotFilesTracked'), '0');
	assert.equal(field(empty, 'gitSnapshotFilesUntracked'), '0');
	assert.equal(field(empty, 'gitSnapshotFilesIgnored'), '0');
	await write(root, 'deleted.txt', 'gone');
	cli('snapshot', root);
	await fs.unlink(path.join(root, 'deleted.txt'));
	const diff = cli('diff', root);
	assert.equal(manifest(diff), '');
	assert.equal(field(fileEntry(diff, 'deleted.txt'), 'sha256'), undefined);
	assert.equal(cli('last-diff', root), diff);
});

test('Git classifications, unusual filenames and counters cover the entire current file set', async t => {
	const root = await fixture(t, true);
	const trackedName = 'tracked space\t"ю\n.txt';
	await write(root, trackedName, 'tracked');
	await write(root, 'ignored tracked.txt', 'forced');
	git(root, 'add', '--', trackedName);
	git(root, 'add', '-f', '--', 'ignored tracked.txt');
	git(root, 'commit', '--quiet', '-m', 'fixture');
	await write(root, 'untracked space.txt', 'untracked');
	await write(root, 'ignored space.txt', 'ignored');
	const result = await collectProjectFiles(root);
	const metadata = await collectGitMetadata(root, result.files);
	assert.equal(metadata.gitHead, git(root, 'rev-parse', 'HEAD').trim());
	assert.equal(metadata.gitWorkingTree, 'dirty');
	assert.equal(metadata.gitSnapshotFilesTracked, 2);
	assert.equal(metadata.gitSnapshotFilesUntracked, 1);
	assert.equal(metadata.gitSnapshotFilesIgnored, 1);
	assert.equal(metadata.gitSnapshotFilesTracked + metadata.gitSnapshotFilesUntracked + metadata.gitSnapshotFilesIgnored, result.files.length);
	assert.equal(result.files.find(file => file.path === trackedName).gitStatus, 'tracked');
	assert.equal(result.files.find(file => file.path === 'ignored tracked.txt').gitStatus, 'tracked');
	assert.equal(result.files.find(file => file.path === 'untracked space.txt').gitStatus, 'untracked');
	assert.equal(result.files.find(file => file.path === 'ignored space.txt').gitStatus, 'ignored');
	const indexBefore = await fs.readFile(path.join(root, '.git/index'));
	const output = cli('snapshot', root);
	assert.equal(field(fileEntry(output, trackedName), 'gitStatus'), 'tracked');
	assert.deepEqual(await fs.readFile(path.join(root, '.git/index')), indexBefore);
	await write(root, 'untracked space.txt', 'new contents');
	const diff = cli('diff', root);
	assert.equal(field(diff, 'gitSnapshotFilesTracked'), '2');
	assert.equal(field(diff, 'gitSnapshotFilesUntracked'), '1');
	assert.equal(field(diff, 'gitSnapshotFilesIgnored'), '1');
	assert.ok(manifest(diff).includes(`untracked space.txt: ${hash('new contents')}`));
	assert.equal(field(fileEntry(diff, 'untracked space.txt'), 'gitStatus'), 'untracked');
});

test('clean Git repository may include ignored snapshot files absent from HEAD', async t => {
	const root = await fixture(t, true);
	await write(root, 'tracked.txt', 'tracked');
	git(root, 'add', '--', '.gitignore', '.repo2llm-ignore', 'tracked.txt');
	git(root, 'commit', '--quiet', '-m', 'fixture');
	await write(root, 'ignored.txt', 'outside HEAD');
	const output = cli('snapshot', root);
	assert.equal(field(output, 'gitWorkingTree'), 'clean');
	assert.equal(field(output, 'gitSnapshotFilesTracked'), '1');
	assert.equal(field(output, 'gitSnapshotFilesIgnored'), '1');
	assert.equal(field(fileEntry(output, 'ignored.txt'), 'gitStatus'), 'ignored');
	await write(root, 'ignored.txt', 'changed ignored bytes');
	const diff = cli('diff', root);
	assert.equal(field(diff, 'gitWorkingTree'), 'clean');
	assert.equal(field(diff, 'gitSnapshotFilesTracked'), '1');
	assert.equal(field(diff, 'gitSnapshotFilesIgnored'), '1');
});

test('last-diff preserves original HEAD, statuses, hashes, counters and timestamp after commit', async t => {
	const root = await fixture(t, true);
	await write(root, 'tracked.txt', 'before');
	git(root, 'add', '--', '.gitignore', '.repo2llm-ignore', 'tracked.txt');
	git(root, 'commit', '--quiet', '-m', 'before');
	cli('snapshot', root);
	const oldHead = git(root, 'rev-parse', 'HEAD').trim();
	await write(root, 'tracked.txt', 'after');
	await write(root, 'new file.txt', 'new file');
	const diff = cli('diff', root);
	git(root, 'add', '--', 'tracked.txt', 'new file.txt');
	git(root, 'commit', '--quiet', '-m', 'after');
	assert.notEqual(git(root, 'rev-parse', 'HEAD').trim(), oldHead);
	await write(root, 'new file.txt', 'today');
	assert.equal(cli('last-diff', root), diff);
	assert.equal(cli('last-diff', root, {...gitEnv, PATH: ''}), diff);
	cli('snapshot', root);
	assert.equal(cli('last-diff', root), diff);
	const saved = await state(root);
	assert.equal(saved.lastDiff.git.gitHead, oldHead);
	assert.equal(saved.lastDiff.entries['new file.txt'].gitStatus, 'untracked');
	assert.equal(saved.lastDiff.entries['new file.txt'].sha256, hash('new file'));
});

test('no Git installation and non-repository directories retain functional snapshot and diff', async t => {
	const root = await fixture(t);
	await write(root, 'source.txt', 'old');
	const missingGitEnv = {...gitEnv, PATH: ''};
	const output = cli('snapshot', root, missingGitEnv);
	assert.equal(field(output, 'gitAvailable'), 'no');
	assert.equal(field(output, 'gitWorkingTree'), 'unavailable');
	assert.equal(field(fileEntry(output, 'source.txt'), 'gitStatus'), 'unavailable');
	await write(root, 'source.txt', 'new content');
	const diff = cli('diff', root, missingGitEnv);
	assert.equal(field(diff, 'gitAvailable'), 'no');
	assert.equal(field(fileEntry(diff, 'source.txt'), 'sha256'), hash('new content'));
	const nonRepo = cli('snapshot', root);
	assert.equal(field(nonRepo, 'gitAvailable'), 'yes');
	assert.equal(field(nonRepo, 'gitRepository'), 'no');
	assert.equal(field(nonRepo, 'gitHead'), '-');
	assert.equal(field(nonRepo, 'gitWorkingTree'), 'unavailable');
	assert.equal(field(nonRepo, 'gitSnapshotFilesTracked'), '-');
});

test('unborn Git repository reports no HEAD and classifies staged and unstaged files', async t => {
	const root = await fixture(t, true);
	await write(root, 'staged.txt', 'staged');
	await write(root, 'unstaged.txt', 'unstaged');
	git(root, 'add', '--', 'staged.txt');
	const output = cli('snapshot', root);
	assert.equal(field(output, 'gitRepository'), 'yes');
	assert.equal(field(output, 'gitHead'), '-');
	assert.equal(field(fileEntry(output, 'staged.txt'), 'gitStatus'), 'tracked');
	assert.equal(field(fileEntry(output, 'unstaged.txt'), 'gitStatus'), 'untracked');
});

test('snapshot inside larger Git repository uses Git root and whole working-tree status', async t => {
	const root = await fixture(t, true);
	const sub = path.join(root, 'nested space');
	await write(root, 'nested space/.repo2llm-ignore', '.repo2llm-ignore\n');
	await write(root, 'nested space/source space.txt', 'tracked');
	await write(root, 'outside.txt', 'original');
	git(root, 'add', '--', '.gitignore', '.repo2llm-ignore', 'outside.txt', 'nested space');
	git(root, 'commit', '--quiet', '-m', 'fixture');
	await write(root, 'nested space/ignored space.txt', 'ignored');
	await write(root, 'nested space/untracked space.txt', 'untracked');
	const output = cli('snapshot', sub);
	assert.equal(field(output, 'gitHead'), git(root, 'rev-parse', 'HEAD').trim());
	assert.equal(field(fileEntry(output, 'source space.txt'), 'gitStatus'), 'tracked');
	assert.equal(field(fileEntry(output, 'ignored space.txt'), 'gitStatus'), 'ignored');
	assert.equal(field(fileEntry(output, 'untracked space.txt'), 'gitStatus'), 'untracked');
	await fs.unlink(path.join(sub, 'untracked space.txt'));
	await write(root, 'outside.txt', 'modified outside snapshot');
	assert.equal(field(cli('snapshot', sub), 'gitWorkingTree'), 'dirty');
});

test('older lastDiff without hashes or Git metadata replays without fabricated values', async t => {
	const root = await fixture(t);
	await write(root, 'file.txt', 'old');
	cli('snapshot', root);
	await write(root, 'file.txt', 'updated');
	cli('diff', root);
	const saved = await state(root);
	delete saved.lastDiff.git;
	for (const entry of Object.values(saved.lastDiff.entries)) {
		delete entry.sha256;
		delete entry.gitStatus;
	}
	await write(root, stateName, JSON.stringify(saved));
	const before = await fs.readFile(path.join(root, stateName), 'utf8');
	const output = cli('last-diff', root);
	assert.doesNotMatch(output, /GIT METADATA|FILE HASHES|sha256:|gitStatus:/);
	assert.equal(field(output, 'generatedAt'), saved.lastDiff.generatedAt);
	assert.match(fileEntry(output, 'file.txt'), /updated/);
	assert.equal(await fs.readFile(path.join(root, stateName), 'utf8'), before);
	assert.equal(cli('diff', root), 'No changes detected.\n');
	cli('snapshot', root);
	assert.equal(cli('last-diff', root), output);
});

test('Git command failures are optional and never fabricate a clean classification', async t => {
	const root = await fixture(t, true);
	await write(root, 'file.txt', 'text');
	const bin = await fs.mkdtemp(path.join(os.tmpdir(), 'repo2llm-fake-git-'));
	t.after(() => fs.rm(bin, {recursive: true, force: true}));
	await write(bin, 'git', `#!${process.execPath}\nconst args = process.argv.slice(2);\nif (args.includes('--version')) console.log('git version test');\nelse if (args.includes('--show-toplevel')) console.log(${JSON.stringify(root)});\nelse process.exit(1);\n`);
	await fs.chmod(path.join(bin, 'git'), 0o755);
	const output = cli('snapshot', root, {...gitEnv, PATH: bin});
	assert.equal(field(output, 'gitAvailable'), 'yes');
	assert.equal(field(output, 'gitRepository'), 'yes');
	assert.equal(field(output, 'gitWorkingTree'), 'unavailable');
	assert.equal(field(output, 'gitSnapshotFilesTracked'), '-');
	assert.equal(field(fileEntry(output, 'file.txt'), 'gitStatus'), 'unavailable');
});

test('map and status output remain free of new metadata', async t => {
	const root = await fixture(t);
	await write(root, 'file.txt', 'text');
	cli('snapshot', root);
	for (const command of ['map', 'status']) {
		assert.doesNotMatch(cli(command, root), /GIT METADATA|FILE HASHES|sha256:|gitStatus:/);
	}
});
