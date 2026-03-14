const fs = require('fs/promises')
const path = require('path')

const STATE_FILENAME = '.repo2llm-state.json'

async function loadState(root) {
	const statePath = path.join(root, STATE_FILENAME)

	try {
		const raw = await fs.readFile(statePath, 'utf8')
		return JSON.parse(raw)
	}
	catch (err) {
		if (err && err.code === 'ENOENT') {
			return null
		}

		throw err
	}
}

async function saveState(root, state) {
	const statePath = path.join(root, STATE_FILENAME)
	await fs.writeFile(statePath, `${JSON.stringify(state, null, '\t')}\n`, 'utf8')
}

function buildFilesState(files) {
	const result = {}

	for (const file of files) {
		result[file.path] = {
			mtimeMs: file.mtimeMs,
			size: file.size,
			type: file.type
		}
	}

	return result
}

function buildSnapshotState(files, previousState) {
	return {
		version: 1,
		updatedAt: new Date().toISOString(),
		files: buildFilesState(files),
		lastDiff: previousState && previousState.lastDiff ? previousState.lastDiff : null
	}
}

function compareStateFiles(previousFiles, currentFiles) {
	const changes = []
	const previous = previousFiles || {}
	const current = currentFiles || {}
	const currentPaths = Object.keys(current).sort((a, b) => a.localeCompare(b))
	const previousPaths = Object.keys(previous).sort((a, b) => a.localeCompare(b))

	for (const filePath of currentPaths) {
		const currentEntry = current[filePath]
		const previousEntry = previous[filePath]

		if (!previousEntry) {
			changes.push({
				path: filePath,
				changeType: 'new',
				mtimeMs: currentEntry.mtimeMs,
				size: currentEntry.size,
				type: currentEntry.type
			})
			continue
		}

		if (
			previousEntry.mtimeMs !== currentEntry.mtimeMs ||
			previousEntry.size !== currentEntry.size ||
			previousEntry.type !== currentEntry.type
		) {
			changes.push({
				path: filePath,
				changeType: 'modified',
				mtimeMs: currentEntry.mtimeMs,
				size: currentEntry.size,
				type: currentEntry.type
			})
		}
	}

	for (const filePath of previousPaths) {
		if (current[filePath]) {
			continue
		}

		const previousEntry = previous[filePath]

		changes.push({
			path: filePath,
			changeType: 'deleted',
			mtimeMs: previousEntry.mtimeMs,
			size: previousEntry.size,
			type: previousEntry.type
		})
	}

	return changes.sort((a, b) => a.path.localeCompare(b.path))
}

function buildLastDiff(changes) {
	const entries = {}

	for (const change of changes) {
		entries[change.path] = {
			changeType: change.changeType,
			mtimeMs: change.mtimeMs,
			size: change.size,
			type: change.type
		}
	}

	return {
		generatedAt: new Date().toISOString(),
		entries
	}
}

function buildDiffState(previousState, currentFilesState, changes) {
	if (!changes.length) {
		return previousState
	}

	return {
		version: 1,
		updatedAt: new Date().toISOString(),
		files: currentFilesState,
		lastDiff: buildLastDiff(changes)
	}
}

function hasAnyDiffEntries(lastDiff) {
	if (!lastDiff || !lastDiff.entries) {
		return false
	}

	return Object.keys(lastDiff.entries).length > 0
}

module.exports = {
	STATE_FILENAME,
	loadState,
	saveState,
	buildFilesState,
	buildSnapshotState,
	compareStateFiles,
	buildLastDiff,
	buildDiffState,
	hasAnyDiffEntries
}
