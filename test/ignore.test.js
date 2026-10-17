const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const {test} = require('node:test');
const {collectProjectFiles} = require('../lib/collector');
const {DEFAULT_RULES} = require('../lib/ignore');

const cliPath = path.resolve(__dirname, '../repo2llm.js');
const stateName = '.repo2llm-state.json';
const pythonPatterns = [
	'__pycache__/', '*.pyc', '*.pyo', '*.pyd', '.pytest_cache/',
	'.mypy_cache/', '.ruff_cache/', '.coverage', 'htmlcov/',
	'*.egg-info/', '.venv/', 'venv/', 'env/'
];
const generatedFiles = [
	'__pycache__/module.pyc', 'module.pyc', 'module.pyo', 'module.pyd',
	'.pytest_cache/data', '.mypy_cache/data', '.ruff_cache/data', '.coverage',
	'htmlcov/index.html', 'package.egg-info/PKG-INFO', '.venv/bin/python',
	'venv/bin/python', 'env/bin/python'
];

async function write(root, name, content = 'fixture\n') {
	const target = path.join(root, name);
	await fs.mkdir(path.dirname(target), {recursive: true});
	await fs.writeFile(target, content);
}

async function fixture(t, files = {}) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo2llm-test-'));
	t.after(() => fs.rm(root, {recursive: true, force: true}));
	for (const [name, content] of Object.entries(files)) {
		await write(root, name, content);
	}
	return root;
}

function cli(command, root) {
	return execFileSync(process.execPath, [cliPath, command, root], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
}

async function paths(root) {
	return (await collectProjectFiles(root)).files.map(file => file.path).sort();
}

async function state(root) {
	return JSON.parse(await fs.readFile(path.join(root, stateName), 'utf8'));
}

function outputPaths(output) {
	return [...output.matchAll(/^===== FILE: (.+) =====$/gm)].map(match => match[1]).sort();
}

test('without user rules, all defaults apply and snapshot creates no state', async t => {
	const root = await fixture(t, {'main.py': 'print("hello")\n'});
	for (const name of ['.env', '.env.example', 'node_modules/pkg/index.js', ...generatedFiles]) {
		await write(root, name);
	}
	assert.equal((await collectProjectFiles(root)).hasUserIgnore, false);
	assert.deepEqual(await paths(root), ['main.py']);
	assert.deepEqual(outputPaths(cli('snapshot', root)), ['main.py']);
	await assert.rejects(fs.access(path.join(root, stateName)), {code: 'ENOENT'});
	assert.match(cli('map', root), /^main\.py$/m);
	assert.match(cli('status', root), /stateFilePresent: no/);
	for (const command of ['diff', 'last-diff']) {
		const result = spawnSync(process.execPath, [cliPath, command, root], {encoding: 'utf8'});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /Diff is unavailable without \.repo2llm-ignore/);
	}
});

test('user rules replace defaults, including Python and dependency rules', async t => {
	const root = await fixture(t, {
		'.repo2llm-ignore': '.env\n.env.local\n',
		'.env': 'secret', '.env.local': 'secret', '.env.example': 'example',
		'.env.production.local': 'example', '.hidden': 'dotfile',
		'node_modules/pkg/index.js': 'source', '.llm/context.md': 'context'
	});
	for (const name of generatedFiles) {
		await write(root, name);
	}
	const expected = ['.repo2llm-ignore', '.env.example', '.env.production.local', '.hidden',
		'node_modules/pkg/index.js', '.llm/context.md', ...generatedFiles].sort();
	assert.equal((await collectProjectFiles(root)).hasUserIgnore, true);
	assert.deepEqual(await paths(root), expected);
	assert.deepEqual(outputPaths(cli('snapshot', root)), expected);
	await write(root, '.repo2llm-ignore', '.env\n*.pyc\n.venv/\n');
	const selected = await paths(root);
	assert.ok(!selected.includes('module.pyc'));
	assert.ok(!selected.includes('.venv/bin/python'));
	assert.ok(selected.includes('venv/bin/python'));
});

test('empty ignore file disables all ordinary defaults', async t => {
	const root = await fixture(t, {
		'.repo2llm-ignore': '', '.env': 'secret', '.env.example': 'example',
		'.git/config': 'config', 'node_modules/pkg/index.js': 'source',
		'dist/app.js': 'build', '.llm/context.md': 'context'
	});
	for (const name of generatedFiles) {
		await write(root, name);
	}
	assert.equal((await collectProjectFiles(root)).hasUserIgnore, true);
	assert.deepEqual(await paths(root), ['.repo2llm-ignore', '.env', '.env.example', '.git/config',
		'node_modules/pkg/index.js', 'dist/app.js', '.llm/context.md', ...generatedFiles].sort());
});

test('gitignore negation, nested paths, anchoring, and directory semantics', async t => {
	const root = await fixture(t, {
		'.repo2llm-ignore': '*.log\n!keep.log\n/nested/private.txt\nblocked/\n!blocked/keep.txt\nselective/*\n!selective/keep.txt\n!selective/sub/\nselective/sub/*\n!selective/sub/keep.txt\n',
		'drop.log': '', 'keep.log': '', 'nested/drop.log': '', 'nested/keep.log': '',
		'nested/private.txt': '', 'other/nested/private.txt': '',
		'blocked/drop.txt': '', 'blocked/keep.txt': '',
		'selective/drop.txt': '', 'selective/keep.txt': '',
		'selective/sub/drop.txt': '', 'selective/sub/keep.txt': ''
	});
	assert.deepEqual(await paths(root), ['.repo2llm-ignore', 'keep.log', 'nested/keep.log',
		'other/nested/private.txt', 'selective/keep.txt', 'selective/sub/keep.txt'].sort());
});

test('state exclusion is independent of user negation; ignore file can be excluded', async t => {
	const root = await fixture(t, {
		'.repo2llm-ignore': '!**/.repo2llm-state.json\n!.repo2llm-state.json\n',
		[stateName]: '{}', 'nested/.repo2llm-state.json': '{}', 'main.py': 'pass\n'
	});
	assert.deepEqual(await paths(root), ['.repo2llm-ignore', 'main.py']);
	assert.deepEqual(outputPaths(cli('snapshot', root)), ['.repo2llm-ignore', 'main.py']);
	const map = cli('map', root);
	assert.match(map, /^\.repo2llm-ignore$/m);
	assert.doesNotMatch(map, /^.*\.repo2llm-state\.json$/m);
	await write(root, '.repo2llm-ignore', '.repo2llm-ignore\n!.repo2llm-state.json\n');
	assert.deepEqual(await paths(root), ['main.py']);
	assert.deepEqual(outputPaths(cli('snapshot', root)), ['main.py']);
	assert.doesNotMatch(cli('map', root), /^\.repo2llm-ignore$/m);
});

test('init-ignore generates defaults and never overwrites an existing file', async t => {
	const root = await fixture(t);
	assert.match(cli('init-ignore', root), /created:/);
	const generated = await fs.readFile(path.join(root, '.repo2llm-ignore'), 'utf8');
	assert.equal(generated, `${DEFAULT_RULES.join('\n')}\n`);
	for (const pattern of ['.git/', 'node_modules/', 'dist/', 'build/', 'coverage/', stateName,
		'.env', '.env.*', '*.log', '*.tmp', '*.cache', '*.zip', '*.tar', '*.gz', '# Python', ...pythonPatterns]) {
		assert.ok(generated.split('\n').includes(pattern), pattern);
	}
	for (const original of [generated, '.env\n', '']) {
		await write(root, '.repo2llm-ignore', original);
		assert.match(cli('init-ignore', root), /already exists:/);
		assert.equal(await fs.readFile(path.join(root, '.repo2llm-ignore'), 'utf8'), original);
	}
});

test('snapshot, diff, last-diff, map, status and state schema remain compatible', async t => {
	const root = await fixture(t, {
		'.repo2llm-ignore': '!.repo2llm-state.json\n',
		'changed.py': 'old\n', 'deleted.py': 'remove\n',
		'image.bin': Buffer.from([0, 1, 2, 0, 255]), 'icon.svg': '<svg>asset</svg>'
	});
	const snapshot = cli('snapshot', root);
	assert.deepEqual(outputPaths(snapshot), ['.repo2llm-ignore', 'changed.py', 'deleted.py', 'icon.svg', 'image.bin']);
	const files = (await collectProjectFiles(root)).files;
	assert.equal(files.find(file => file.path === 'image.bin').contentState, 'binary-skipped');
	assert.equal(files.find(file => file.path === 'icon.svg').contentState, 'asset-skipped');
	assert.equal(files.find(file => file.path === 'icon.svg').content, '');
	assert.match(snapshot, /contentState: binary-skipped/);
	assert.match(snapshot, /contentState: asset-skipped/);
	assert.doesNotMatch(snapshot, /<svg>asset<\/svg>/);
	const baseline = await state(root);
	assert.deepEqual(Object.keys(baseline).sort(), ['files', 'lastDiff', 'updatedAt', 'version']);
	assert.equal(baseline.version, 1);
	assert.equal(baseline.lastDiff, null);
	assert.ok(!Object.hasOwn(baseline.files, stateName));
	assert.deepEqual(Object.keys(baseline.files['changed.py']).sort(), ['mtimeMs', 'size', 'type']);
	assert.match(cli('status', root), /workingTree: clean[\s\S]*stateMatches: snapshot/);
	await fs.appendFile(path.join(root, stateName), '\n  \n');
	assert.equal(cli('diff', root), 'No changes detected.\n');
	await write(root, 'changed.py', 'updated and longer\n');
	await write(root, 'new.py', 'new\n');
	await fs.unlink(path.join(root, 'deleted.py'));
	assert.match(cli('status', root), /workingTree: changed[\s\S]*changedFiles: 3/);
	const diff = cli('diff', root);
	assert.deepEqual(outputPaths(diff), ['changed.py', 'deleted.py', 'new.py']);
	for (const kind of ['modified', 'deleted', 'new']) {
		assert.match(diff, new RegExp(`changeType: ${kind}`));
	}
	const saved = await state(root);
	assert.equal(saved.version, 1);
	assert.deepEqual(Object.keys(saved.lastDiff.entries).sort(), ['changed.py', 'deleted.py', 'new.py']);
	assert.deepEqual(Object.keys(saved.lastDiff.entries['changed.py']).sort(),
		['changeType', 'content', 'contentState', 'gitStatus', 'lines', 'modified', 'mtimeMs', 'reason', 'sha256', 'size', 'type']);
	assert.match(cli('status', root), /workingTree: clean[\s\S]*stateMatches: diff/);
	assert.equal(cli('diff', root), 'No changes detected.\n');
	const replay = cli('last-diff', root);
	assert.equal(replay.replace(/^generatedAt: .*$/m, ''), diff.replace(/^generatedAt: .*$/m, ''));
	await fs.appendFile(path.join(root, stateName), '\n');
	assert.equal(cli('diff', root), 'No changes detected.\n');
	assert.equal(cli('last-diff', root), replay);
	assert.doesNotMatch(cli('map', root), /^\.repo2llm-state\.json$/m);
});
