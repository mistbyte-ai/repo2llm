#!/usr/bin/env node
/* repo2llm by MistByteAi */

const path = require('path')
const {collectProjectFiles} = require('./lib/collector')
const { renderSnapshot, renderMap, renderDiff, renderLastDiff } = require('./lib/renderer')
const {createDefaultIgnore} = require('./lib/ignore')
const { loadState, saveState, buildFilesState, buildDiffEntries, buildSnapshotState, compareStateFiles, buildDiffState } = require('./lib/state')

function formatStatusTime(value) {
	if (!value) {
		return '-'
	}

	const date = new Date(value)

	if (Number.isNaN(date.getTime())) {
		return '-'
	}

	const utc = date.toISOString().replace(/\.\d{3}Z$/, 'Z')
	const local = date.toLocaleString('sv-SE', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	}).replace(' ', 'T')

	return `${local} local | ${utc} UTC`
}

function printHelp() {
	console.log('Usage: repo2llm <command> [path]')
	console.log('')
	console.log('Commands:')
	console.log('\tsnapshot [path]\t\tCreate full repository snapshot')
	console.log('\tdiff [path]\t\tShow incremental snapshot for changed files')
	console.log('\tlast-diff [path]\t\tRepeat the last saved diff output')
	console.log('\tmap [path]\t\t\tShow repository file map without full contents')
	console.log('\tstatus [path]\t\tShow repo2llm state and working tree status')
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

	if ( command !== 'snapshot' && command !== 'map' && command !== 'init-ignore' && command !== 'diff' && command !== 'last-diff' && command !== 'status')
	{
		console.error(`Unknown command: ${command}`)
		printHelp()
		process.exit(2)
	}

	try {

		if (command === 'status') {
			const result = await collectProjectFiles(root)
			const state = await loadState(root)

			console.log('===== REPO2LLM STATUS =====')
			console.log(`root: ${root}`)
			console.log(`ignoreFilePresent: ${result.hasUserIgnore ? 'yes' : 'no'}`)
			console.log(`stateFilePresent: ${state ? 'yes' : 'no'}`)

			if (!result.hasUserIgnore) {
				console.log('stateMatches: -')
				return
			}

			if (!state || !state.files) {
				console.log('stateMatches: -')
				return
			}

			const currentFilesState = buildFilesState(result.files)
			const changes = compareStateFiles(state.files, currentFilesState)

			const workingTree = changes.length ? 'changed' : 'clean'

			let stateMatches = 'no'

			if (!changes.length) {
				const updatedAtSec = state.updatedAt
					? Math.floor(new Date(state.updatedAt).getTime() / 1000)
					: 0
				const lastDiffAtSec = state.lastDiff && state.lastDiff.generatedAt
					? Math.floor(new Date(state.lastDiff.generatedAt).getTime() / 1000)
					: 0

				if (!lastDiffAtSec) {
					stateMatches = 'snapshot'
				}
				else if (updatedAtSec === lastDiffAtSec) {
					stateMatches = 'diff'
				}
				else if (updatedAtSec > lastDiffAtSec) {
					stateMatches = 'snapshot'
				}
				else {
					stateMatches = 'no'
				}
			}

			console.log(`trackedFiles: ${Object.keys(state.files).length}`)
			console.log(`stateUpdatedAt: ${formatStatusTime(state.updatedAt)}`)
			console.log(`lastDiffEntries: ${state.lastDiff && state.lastDiff.entries ? Object.keys(state.lastDiff.entries).length : 0}`)
			console.log(`workingTree: ${workingTree}`)
			console.log(`stateMatches: ${stateMatches}`)

			if (changes.length) {
				console.log(`changedFiles: ${changes.length}`)
			}

			return
		}

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
