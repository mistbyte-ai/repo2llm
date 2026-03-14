#!/usr/bin/env node
/* repo2llm by MistByteAi */

const path = require('path')
const {collectProjectFiles} = require('./lib/collector')
const { renderSnapshot, renderMap, renderDiff, renderLastDiff } = require('./lib/renderer')
const {createDefaultIgnore} = require('./lib/ignore')
const { loadState, saveState, buildFilesState, buildDiffEntries, buildSnapshotState, compareStateFiles, buildDiffState } = require('./lib/state')

function printHelp() {
	console.log('Usage: repo2llm <command> [path]')
	console.log('')
	console.log('Commands:')
	console.log('\tsnapshot [path]\t\tCreate full repository snapshot')
	console.log('\tdiff [path]\t\tShow incremental snapshot for changed files')
	console.log('\tlast-diff [path]\t\tRepeat the last saved diff output')
	console.log('\tmap [path]\t\t\tShow repository file map without full contents')
	console.log('\tinit-ignore [path]\tCreate default .repo2llm-ignore')
	console.log('\thelp\t\t\tShow this help')
	console.log('')
	console.log('Notes:')
	console.log('\t[path] is optional. Current directory is used by default.')
	console.log('\tdiff and last-diff require .repo2llm-ignore and an existing state file.')
}


async function main() {
	const command = process.argv[2]
	const root = process.argv[3] ? path.resolve(process.argv[3]) : process.cwd()

	if (!command || command === 'help' || command === '--help' || command === '-h') {
		printHelp()
		process.exit(0)
	}

	if ( command !== 'snapshot' && command !== 'map' && command !== 'init-ignore' && command !== 'diff' && command !== 'last-diff')
	{
		console.error(`Unknown command: ${command}`)
		printHelp()
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
			const diffEntries = buildDiffEntries(state.files, result.files, changes)

			renderDiff(root, diffEntries, result.hasUserIgnore)

			if (diffEntries.length) {
				await saveState(root, buildDiffState(state, currentFilesState, diffEntries))
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
