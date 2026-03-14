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

function renderDiff(root, entries, hasUserIgnore, generatedAt) {
	if (!entries.length) {
		console.log('No changes detected.')
		return
	}

	let totalLines = 0
	let totalChars = 0
	let newFiles = 0
	let modifiedFiles = 0
	let deletedFiles = 0

	for (const entry of entries) {
		totalLines += entry.lines || 0
		totalChars += entry.content ? entry.content.length : 0

		if (entry.changeType === 'new') {
			newFiles++
		}
		else if (entry.changeType === 'modified') {
			modifiedFiles++
		}
		else if (entry.changeType === 'deleted') {
			deletedFiles++
		}
	}

	const tokens = estimateTokens(totalChars)

	console.log('===== REPOSITORY DIFF =====')
	console.log(`root: ${root}`)
	console.log(`ignoreFilePresent: ${hasUserIgnore ? 'yes' : 'no'}`)
	console.log(`generatedAt: ${generatedAt || new Date().toISOString()}`)
	console.log('')

	console.log('===== DIFF SUMMARY =====')
	console.log(`Total changed files: ${entries.length}`)
	console.log(`New files: ${newFiles}`)
	console.log(`Modified files: ${modifiedFiles}`)
	console.log(`Deleted files: ${deletedFiles}`)
	console.log(`Total chars: ${totalChars}`)
	console.log(`Total lines: ${totalLines}`)
	console.log(`Estimated tokens: ~${tokens.normal} - ${tokens.conservative}`)
	console.log('')

	for (const entry of entries) {
		console.log(`===== FILE: ${entry.path} =====`)
		console.log(`changeType: ${entry.changeType}`)
		console.log(`modified: ${entry.modified || '-'}`)
		console.log(`size: ${entry.size}`)
		console.log(`lines: ${entry.lines}`)
		console.log(`contentState: ${entry.contentState}`)

		if (entry.reason) {
			console.log(`reason: ${entry.reason}`)
		}

		console.log('')

		if (entry.contentState === 'full' && entry.content) {
			process.stdout.write(entry.content)

			if (!entry.content.endsWith('\n')) {
				process.stdout.write('\n')
			}
		}

		if (entry.changeType === 'deleted') {
			console.log(`<EOF ${entry.path} — deleted>`)
		}
		else {
			console.log(`<EOF ${entry.path} — ${entry.lines} lines>`)
		}

		console.log('')
	}
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
			modified: entry.modified,
			changeType: entry.changeType,
			mtimeMs: entry.mtimeMs,
			size: entry.size,
			lines: entry.lines,
			type: entry.type,
			contentState: entry.contentState,
			reason: entry.reason,
			content: entry.content || ''
		}))

	if (!entries.length) {
		console.log('No last diff recorded.')
		return
	}

	renderDiff(root, entries, hasUserIgnore, lastDiff.generatedAt)
}

module.exports = {
	renderMap,
	renderSnapshot,
	renderDiff,
	renderLastDiff
}
