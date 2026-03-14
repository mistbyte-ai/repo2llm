const {estimateTokens} = require('./utils')

function renderMap(root, result) {
	const files = result.files

	let totalLines = 0
	let totalChars = 0

	console.log('===== REPOSITORY MAP =====')
	console.log(`root: ${root}`)
	console.log(`files: ${files.length}`)
	console.log(`ignoreFilePresent: ${result.hasUserIgnore ? 'yes' : 'no'}`)
	console.log('')

	for (const file of files) {
		totalLines += file.lines || 0
		totalChars += file.content ? file.content.length : 0

		console.log(`${file.path}`)
		console.log(`\tsize: ${file.size}`)
		console.log(`\tlines: ${file.lines}`)
		console.log(`\tmodified: ${file.modified || '-'}`)
		console.log(`\tcontentState: ${file.contentState}`)

		if (file.reason) {
			console.log(`\treason: ${file.reason}`)
		}

		console.log('')
	}

	const tokens = estimateTokens(totalChars)

	console.log('===== SUMMARY =====')
	console.log(`Total files: ${files.length}`)
	console.log(`Total chars: ${totalChars}`)
	console.log(`Total lines: ${totalLines}`)
	console.log(`Estimated tokens: ~${tokens.normal} - ${tokens.conservative}`)
}

function renderSnapshot(root, result) {
	const files = result.files

	let totalLines = 0
	let totalChars = 0
	let textFiles = 0
	let binaryFiles = 0
	let skippedFiles = 0

	console.log('===== REPOSITORY SNAPSHOT =====')
	console.log(`root: ${root}`)
	console.log(`files: ${files.length}`)
	console.log(`ignoreFilePresent: ${result.hasUserIgnore ? 'yes' : 'no'}`)
	console.log('')

	for (const file of files) {
		totalLines += file.lines || 0
		totalChars += file.content ? file.content.length : 0

		if (file.contentState === 'full') {
			textFiles++
		}
		else if (file.contentState === 'binary-skipped') {
			binaryFiles++
		}
		else {
			skippedFiles++
		}
	}

	const tokens = estimateTokens(totalChars)

	console.log('===== REPOSITORY SUMMARY =====')
	console.log(`Total files: ${files.length}`)
	console.log(`Text files: ${textFiles}`)
	console.log(`Binary files: ${binaryFiles}`)
	console.log(`Other skipped files: ${skippedFiles}`)
	console.log(`Total chars: ${totalChars}`)
	console.log(`Total lines: ${totalLines}`)
	console.log(`Estimated tokens: ~${tokens.normal} - ${tokens.conservative}`)
	console.log('')

	for (const file of files) {
		console.log(`===== FILE: ${file.path} =====`)
		console.log(`modified: ${file.modified || '-'}`)
		console.log(`size: ${file.size}`)
		console.log(`lines: ${file.lines}`)
		console.log(`contentState: ${file.contentState}`)

		if (file.reason) {
			console.log(`reason: ${file.reason}`)
		}

		console.log('')

		if (file.contentState === 'full' && file.content) {
			process.stdout.write(file.content)

			if (!file.content.endsWith('\n')) {
				process.stdout.write('\n')
			}
		}

		console.log(`<EOF ${file.path} — ${file.lines} lines>`)
		console.log('')
	}
}

function renderDiff(root, changes, hasUserIgnore) {
	if (!changes.length) {
		console.log('No changes detected.')
		return
	}

	console.log('===== REPOSITORY DIFF =====')
	console.log(`root: ${root}`)
	console.log(`ignoreFilePresent: ${hasUserIgnore ? 'yes' : 'no'}`)
	console.log('')

	for (const change of changes) {
		console.log(`===== CHANGE: ${change.changeType.toUpperCase()} ${change.path} =====`)
		console.log(`changeType: ${change.changeType}`)
		console.log(`size: ${change.size}`)
		console.log(`type: ${change.type}`)
		console.log(`mtimeMs: ${change.mtimeMs}`)
		console.log('')
	}

	console.log(`Total changes: ${changes.length}`)
}

function renderLastDiff(root, lastDiff, hasUserIgnore) {
	if (!lastDiff || !lastDiff.entries) {
		console.log('No last diff recorded.')
		return
	}

	const entries = Object.entries(lastDiff.entries)
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([entryPath, entry]) => ({
			path: entryPath,
			changeType: entry.changeType,
			mtimeMs: entry.mtimeMs,
			size: entry.size,
			type: entry.type
		}))

	if (!entries.length) {
		console.log('No last diff recorded.')
		return
	}

	console.log(`Generated at: ${lastDiff.generatedAt || '-'}`)
	console.log('')
	renderDiff(root, entries, hasUserIgnore)
}

module.exports = {
	renderMap,
	renderSnapshot,
	renderDiff,
	renderLastDiff
}
