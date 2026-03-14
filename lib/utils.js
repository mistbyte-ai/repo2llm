const path = require('path')

function normalizeRelativePath(root, targetPath) {
	const rel = path.relative(root, targetPath)
	return rel.split(path.sep).join('/')
}

function toIsoUtc(value) {
	return new Date(value).toISOString()
}

function countLines(text) {
	if (text.length === 0) {
		return 0
	}

	let count = 1

	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {
			count++
		}
	}

	return count
}

function estimateTokens(chars) {
	return {
		normal: Math.ceil(chars / 3.5),
		conservative: Math.ceil(chars / 3)
	}
}

function formatSize(size) {
	return String(size)
}

function normalizeText(text) {
	return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

module.exports = {
	normalizeRelativePath,
	toIsoUtc,
	countLines,
	estimateTokens,
	formatSize,
	normalizeText
}
