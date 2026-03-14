const fs = require('fs/promises')
const path = require('path')
const {loadIgnore} = require('./ignore')
const {normalizeRelativePath} = require('./utils')
const {analyzeFile} = require('./analyzer')

async function collectProjectFiles(root) {
	const rootStat = await fs.stat(root).catch(() => null)

	if (!rootStat || !rootStat.isDirectory()) {
		throw new Error(`Path is not a directory: ${root}`)
	}

	const {ig, hasUserIgnore} = await loadIgnore(root)
	const collected = []

	await walkDirectory(root, root, ig, collected)

	collected.sort((a, b) => a.path.localeCompare(b.path))

	const analyzed = []

	for (const item of collected) {
		analyzed.push(await analyzeFile(item.absPath, item.path))
	}

	return {
		root,
		hasUserIgnore,
		files: analyzed
	}
}

async function walkDirectory(root, currentDir, ig, collected) {
	const entries = await fs.readdir(currentDir, {withFileTypes: true})

	entries.sort((a, b) => a.name.localeCompare(b.name))

	for (const entry of entries) {
		const absPath = path.join(currentDir, entry.name)
		const relPath = normalizeRelativePath(root, absPath)

		if (!relPath) {
			continue
		}

		const relPathForIgnore = entry.isDirectory() ? `${relPath}/` : relPath

		if (ig.ignores(relPathForIgnore)) {
			continue
		}

		if (entry.isSymbolicLink()) {
			collected.push({
				path: relPath,
				absPath
			})
			continue
		}

		if (entry.isDirectory()) {
			await walkDirectory(root, absPath, ig, collected)
			continue
		}

		if (entry.isFile()) {
			collected.push({
				path: relPath,
				absPath
			})
		}
	}
}

module.exports = {
	collectProjectFiles
}
