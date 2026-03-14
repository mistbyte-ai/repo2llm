const fs = require('fs/promises')
const fsSync = require('fs')
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
		ignorePath,
		defaultIgnoreText: `${DEFAULT_RULES.join('\n')}\n`
	}
}

async function createDefaultIgnore(root) {
	const ignorePath = path.join(root, IGNORE_FILENAME)

	if (fsSync.existsSync(ignorePath)) {
		return {
			created: false,
			path: ignorePath,
			message: `${IGNORE_FILENAME} already exists: ${ignorePath}`
		}
	}

	const content = `${DEFAULT_RULES.join('\n')}\n`

	await fs.writeFile(ignorePath, content, 'utf8')

	return {
		created: true,
		path: ignorePath,
		message: `${IGNORE_FILENAME} created: ${ignorePath}`
	}
}


module.exports = {
	IGNORE_FILENAME,
	DEFAULT_RULES,
	loadIgnore,
	createDefaultIgnore
}
