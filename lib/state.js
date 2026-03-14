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

function buildDiffEntries(previousFiles, currentFiles, changes) {
	const previous = previousFiles || {}
	const currentMap = new Map()
	const entries = []

	for (const file of currentFiles) {
		currentMap.set(file.path, file)
	}

	for (const change of changes) {
		if (change.changeType === 'new' || change.changeType === 'modified') {
			const currentFile = currentMap.get(change.path)

			if (!currentFile) {
				continue
			}

			entries.push({
				path: currentFile.path,
				changeType: change.changeType,
				mtimeMs: currentFile.mtimeMs,
				modified: currentFile.modified,
				size: currentFile.size,
				lines: currentFile.lines,
				type: currentFile.type,
				contentState: currentFile.contentState,
				reason: currentFile.reason,
				content: currentFile.content || ''
			})

			continue
		}

		const previousEntry = previous[change.path] || {}

		entries.push({
			path: change.path,
			changeType: 'deleted',
			mtimeMs: previousEntry.mtimeMs || 0,
			modified: previousEntry.mtimeMs ? new Date(previousEntry.mtimeMs).toISOString() : null,
			size: previousEntry.size || 0,
			lines: 0,
			type: previousEntry.type || 'unknown',
			contentState: 'deleted',
			reason: 'File deleted since previous snapshot',
			content: ''
		})
	}

	return entries.sort((a, b) => a.path.localeCompare(b.path))
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

function buildLastDiff(entries) {
	const result = {}

	for (const entry of entries) {
		result[entry.path] = {
			changeType: entry.changeType,
			mtimeMs: entry.mtimeMs,
			modified: entry.modified,
			size: entry.size,
			lines: entry.lines,
			type: entry.type,
			contentState: entry.contentState,
			reason: entry.reason,
			content: entry.content || ''
		}
	}

	return {
		generatedAt: new Date().toISOString(),
		entries: result
	}
}

function buildDiffState(previousState, currentFilesState, diffEntries) {
	if (!diffEntries.length) {
		return previousState
	}

	return {
		version: 1,
		updatedAt: new Date().toISOString(),
		files: currentFilesState,
		lastDiff: buildLastDiff(diffEntries)
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
	buildDiffEntries,
	compareStateFiles,
	buildLastDiff,
	buildDiffState,
	hasAnyDiffEntries
}
