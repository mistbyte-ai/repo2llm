#!/usr/bin/env node
/* repo2llm by MistByteAi */

const path = require('path')
const {collectProjectFiles} = require('./lib/collector')
const { renderSnapshot, renderMap, renderDiff, renderLastDiff } = require('./lib/renderer')
const {createDefaultIgnore} = require('./lib/ignore')
const { loadState, saveState, buildFilesState, buildSnapshotState, compareStateFiles, buildDiffState } = require('./lib/state')

async function main() {
	const command = process.argv[2]
	const root = process.argv[3] ? path.resolve(process.argv[3]) : process.cwd()

	if (!command) {
		console.error('Usage: repo2llm <command> [path]')
		process.exit(2)
	}

	if ( command !== 'snapshot' && command !== 'map' && command !== 'init-ignore' && command !== 'diff' && command !== 'last-diff')
	{
		console.error(`Unknown command: ${command}`)
		process.exit(2)
	}

	try {
		if (command === 'init-ignore') {
			const result = await createDefaultIgnore(root)
			console.log(result.message)
			return
		}

		if (command === 'last-diff') {
			const result = await collectProjectFiles(root)

			if (!result.hasUserIgnore) {
				console.error('Diff is unavailable without .repo2llm-ignore')
				process.exit(1)
			}

			const state = await loadState(root)

			if (!state || !state.lastDiff || !state.lastDiff.entries || !Object.keys(state.lastDiff.entries).length) {
				console.error('No saved last diff. Run snapshot and then diff first.')
				process.exit(1)
			}

			renderLastDiff(root, state.lastDiff, result.hasUserIgnore)
			return
		}

		if (command === 'diff') {
			const result = await collectProjectFiles(root)

			if (!result.hasUserIgnore) {
				console.error('Diff is unavailable without .repo2llm-ignore')
				process.exit(1)
			}

			const state = await loadState(root)

			if (!state || !state.files) {
				console.error('State file is missing. Run snapshot first.')
				process.exit(1)
			}

			const currentFilesState = buildFilesState(result.files)
			const changes = compareStateFiles(state.files, currentFilesState)

			renderDiff(root, changes, result.hasUserIgnore)

			if (changes.length) {
				await saveState(root, buildDiffState(state, currentFilesState, changes))
			}

			return
		}

		const result = await collectProjectFiles(root)

		if (command === 'map') {
			renderMap(root, result)
			return
		}

		if (!result.hasUserIgnore) {
			console.error('Warning: .repo2llm-ignore not found. Built-in ignore rules are used. State file will not be created.')
		}

		renderSnapshot(root, result)

		if (result.hasUserIgnore) {
			const previousState = await loadState(root)
			const nextState = buildSnapshotState(result.files, previousState)
			await saveState(root, nextState)
		}
	}
	catch (err) {
		console.error(err && err.message ? err.message : 'Unknown error')
		process.exit(1)
	}
}

main()
