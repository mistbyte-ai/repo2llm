#!/usr/bin/env node

const path = require('path')
const {collectProjectFiles} = require('./lib/collector')
const {renderSnapshot, renderMap} = require('./lib/renderer')
const {createDefaultIgnore} = require('./lib/ignore')

async function main() {
	const command = process.argv[2]
	const root = process.argv[3] ? path.resolve(process.argv[3]) : process.cwd()

	if (!command) {
		console.error('Usage: repo2llm <command> [path]')
		process.exit(2)
	}

	if (command !== 'snapshot' && command !== 'map' && command !== 'init-ignore') {
		console.error(`Unknown command: ${command}`)
		process.exit(2)
	}

	try {
		if (command === 'init-ignore') {
			const result = await createDefaultIgnore(root)
			console.log(result.message)
			return
		}

		const result = await collectProjectFiles(root)

		if (command === 'map') {
			renderMap(root, result)
			return
		}

		renderSnapshot(root, result)
	}
	catch (err) {
		console.error(err && err.message ? err.message : 'Unknown error')
		process.exit(1)
	}
}

main()
