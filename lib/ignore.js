const fs = require('fs/promises')
const path = require('path')
const ignore = require('ignore')

const IGNORE_FILENAME = '.repo2llm-ignore'

const DEFAULT_RULES = [
	'.git/',
	'node_modules/',
	'dist/',
	'build/',
	'coverage/',
	'.repo2llm-state.json',
	'.env',
	'.env.*',
	'*.log',
	'*.tmp',
	'*.cache',
	'*.zip',
	'*.tar',
	'*.gz'
]

async function loadIgnore(root) {
	const ig = ignore()
	const ignorePath = path.join(root, IGNORE_FILENAME)

	let hasUserIgnore = false

	try {
		const raw = await fs.readFile(ignorePath, 'utf8')
		ig.add(raw)
		hasUserIgnore = true
	}
	catch (err) {
		if (!err || err.code !== 'ENOENT') {
			throw err
		}
	}

	ig.add(DEFAULT_RULES)

	return {
		ig,
		hasUserIgnore,
		ignorePath
	}
}

module.exports = {
	IGNORE_FILENAME,
	DEFAULT_RULES,
	loadIgnore
}
