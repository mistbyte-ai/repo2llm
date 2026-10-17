const {execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs/promises');
const path = require('path');

const run = promisify(execFile);

async function collectGitMetadata(root, files) {
	const metadata = {
		gitAvailable: 'unavailable',
		gitRepository: 'unavailable',
		gitHead: '-',
		gitWorkingTree: 'unavailable',
		gitSnapshotFilesTracked: '-',
		gitSnapshotFilesUntracked: '-',
		gitSnapshotFilesIgnored: '-'
	};
	for (const file of files) {
		file.gitStatus = 'unavailable';
	}

	async function git(args) {
		const {stdout} = await run('git', ['--no-optional-locks', '-C', root, ...args], {
			encoding: 'utf8',
			timeout: 5000,
			maxBuffer: 32 * 1024 * 1024,
			env: {...process.env, LC_ALL: 'C'}
		});
		return stdout;
	}

	try {
		await git(['--version']);
		metadata.gitAvailable = 'yes';
	}
	catch {
		metadata.gitAvailable = 'no';
		return metadata;
	}

	let gitRoot;
	try {
		gitRoot = (await git(['rev-parse', '--show-toplevel'])).replace(/\n$/, '');
		metadata.gitRepository = 'yes';
	}
	catch (err) {
		if (/not a git repository/i.test(err.stderr || '')) {
			metadata.gitRepository = 'no';
		}
		return metadata;
	}

	try {
		metadata.gitHead = (await git(['rev-parse', '--verify', 'HEAD'])).trim();
	}
	catch {
		// An unborn branch has no HEAD commit yet.
	}

	try {
		const status = await git(['status', '--porcelain=v1', '-z', '--untracked-files=normal']);
		metadata.gitWorkingTree = status ? 'dirty' : 'clean';
	}
	catch {
		// Keep Git status unavailable if the command fails.
	}

	try {
		const realRoot = await fs.realpath(root);
		const prefix = path.relative(gitRoot, realRoot).split(path.sep).join('/');
		const [trackedOutput, ignoredOutput] = await Promise.all([
			git(['ls-files', '--cached', '--full-name', '-z']),
			git(['ls-files', '--others', '--ignored', '--exclude-standard', '--full-name', '-z'])
		]);
		const tracked = new Set(trackedOutput.split('\0'));
		const ignored = new Set(ignoredOutput.split('\0'));
		metadata.gitSnapshotFilesTracked = 0;
		metadata.gitSnapshotFilesUntracked = 0;
		metadata.gitSnapshotFilesIgnored = 0;
		for (const file of files) {
			const name = prefix ? `${prefix}/${file.path}` : file.path;
			if (tracked.has(name)) {
				file.gitStatus = 'tracked';
				metadata.gitSnapshotFilesTracked++;
			}
			else if (ignored.has(name)) {
				file.gitStatus = 'ignored';
				metadata.gitSnapshotFilesIgnored++;
			}
			else {
				file.gitStatus = 'untracked';
				metadata.gitSnapshotFilesUntracked++;
			}
		}
	}
	catch {
		// Classification is optional; leave all counters and files unavailable.
	}

	return metadata;
}

module.exports = {collectGitMetadata};
