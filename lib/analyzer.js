const fs = require('fs/promises')
const path = require('path')
const {createHash} = require('crypto');
const {isBinaryFile} = require('isbinaryfile')
const {
	countLines,
	normalizeText,
	toIsoUtc
} = require('./utils')

const TEXT_ASSET_EXTENSIONS = new Set([
	'.svg'
])

async function analyzeFile(absPath, relPath) {
	let stat

	try {
		stat = await fs.lstat(absPath)
	}
	catch (err) {
		return {
			path: relPath,
			sha256: null,
			size: 0,
			mtimeMs: 0,
			lines: 0,
			modified: null,
			contentState: 'read-error',
			type: 'unknown',
			content: '',
			reason: err && err.message ? err.message : 'Failed to stat file'
		}
	}

	if (stat.isSymbolicLink()) {
		return {
			path: relPath,
			sha256: null,
			size: stat.size,
			mtimeMs: stat.mtimeMs,
			lines: 0,
			modified: toIsoUtc(stat.mtimeMs),
			contentState: 'symlink-skipped',
			type: 'symlink',
			content: '',
			reason: 'Symlink skipped'
		}
	}

	if (TEXT_ASSET_EXTENSIONS.has(path.extname(relPath).toLowerCase())) {
		const buffer = await fs.readFile(absPath).catch(() => null);
		const sha256 = buffer ? createHash('sha256').update(buffer).digest('hex') : null;
		return {
			path: relPath,
			sha256,
			size: stat.size,
			mtimeMs: stat.mtimeMs,
			lines: 0,
			modified: toIsoUtc(stat.mtimeMs),
			contentState: 'asset-skipped',
			type: 'asset',
			content: '',
			reason: 'Text asset skipped by extension'
		}
	}

	let buffer

	try {
		buffer = await fs.readFile(absPath)
	}
	catch (err) {
		return {
			path: relPath,
			sha256: null,
			size: stat.size,
			mtimeMs: stat.mtimeMs,
			lines: 0,
			modified: toIsoUtc(stat.mtimeMs),
			contentState: 'read-error',
			type: 'unknown',
			content: '',
			reason: err && err.message ? err.message : 'Failed to read file'
		}
	}

	const sha256 = createHash('sha256').update(buffer).digest('hex');
	const binary = await isBinaryFile(buffer, buffer.length)

	if (binary) {
		return {
			path: relPath,
			sha256,
			size: stat.size,
			mtimeMs: stat.mtimeMs,
			lines: 0,
			modified: toIsoUtc(stat.mtimeMs),
			contentState: 'binary-skipped',
			type: 'binary',
			content: '',
			reason: 'Binary file skipped'
		}
	}

	let text

	try {
		text = buffer.toString('utf8')
	}
	catch (err) {
		return {
			path: relPath,
			sha256,
			size: stat.size,
			mtimeMs: stat.mtimeMs,
			lines: 0,
			modified: toIsoUtc(stat.mtimeMs),
			contentState: 'decode-skipped',
			type: 'text',
			content: '',
			reason: err && err.message ? err.message : 'UTF-8 decode failed'
		}
	}

	const normalized = normalizeText(text)

	return {
		path: relPath,
		sha256,
		size: stat.size,
		mtimeMs: stat.mtimeMs,
		lines: countLines(normalized),
		modified: toIsoUtc(stat.mtimeMs),
		contentState: 'full',
		type: 'text',
		content: normalized,
		reason: ''
	}
}

module.exports = {
	analyzeFile
}
