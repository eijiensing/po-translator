import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { set, get } from 'idb-keyval'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export type PoEntry = {
	id: string
	value: string
	comments?: string[]
	references?: string[]
	flags?: string[]
}

export type PoFileStore = {
	isSource: boolean
	language: string
	headers: Record<string, string>
	entries: Record<string, PoEntry>
}

export function parsePo(content: string): PoFileStore {
	const lines = content.split('\n')
	const headersRaw: string[] = []
	let inHeader = false
	let headerDone = false
	const entries: PoFileStore['entries'] = {}
	let currentId = ''
	let currentStr = ''
	let currentComments: string[] = []
	let currentRefs: string[] = []
	let currentFlags: string[] = []
	let readingMsgStr = false
	let pendingComments: string[] = []
	let pendingRefs: string[] = []
	let pendingFlags: string[] = []
	let skippingObsolete = false

	function clearPending() {
		pendingComments = []
		pendingRefs = []
		pendingFlags = []
	}

	function flushEntry() {
		if (!currentId) return
		entries[currentId] = {
			id: currentId,
			value: currentStr,
			flags: currentFlags.length ? [...currentFlags] : undefined,
			references: currentRefs.length ? [...currentRefs] : undefined,
			comments: currentComments.length ? [...currentComments] : undefined,
		}
		currentId = ''
		currentStr = ''
		currentComments = []
		currentRefs = []
		currentFlags = []
	}

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i]
		const line = raw.trim()

		// ── Blank line: natural entry separator, always exit obsolete mode ──
		if (line === '') {
			skippingObsolete = false
			continue
		}

		// ── Obsolete lines (#~ ...) ──────────────────────────────────────────
		if (line.startsWith('#~')) {
			if (!skippingObsolete) {
				clearPending()
				skippingObsolete = true
			}
			continue
		}

		if (skippingObsolete) continue

		// ── Comments / metadata ──────────────────────────────────────────────
		if (line.startsWith('#.')) {
			pendingComments.push(line.slice(2).trim())
			continue
		}
		if (line.startsWith('#,')) {
			pendingFlags.push(line.slice(2).trim())
			continue
		}
		if (line.startsWith('#:')) {
			pendingRefs.push(line.slice(2).trim())
			continue
		}
		if (line.startsWith('#')) {
			pendingComments.push(line.slice(1).trim())
			continue
		}

		// ── Header block (first msgid "" only) ──────────────────────────────
		if (!headerDone && line === 'msgid ""') {
			inHeader = true
			continue
		}
		if (inHeader) {
			if (line.startsWith('"')) {
				headersRaw.push(line)
				continue
			}
			if (line === 'msgstr ""') continue
			inHeader = false
			headerDone = true
			// fall through to process this line normally
		}

		// ── Entry start ──────────────────────────────────────────────────────
		if (line.startsWith('msgid ')) {
			flushEntry()
			currentComments = [...pendingComments]
			currentRefs = [...pendingRefs]
			currentFlags = [...pendingFlags]
			clearPending()
			currentId = stripQuotes(line.slice(6))
			currentStr = ''
			readingMsgStr = false
			continue
		}
		if (line.startsWith('msgstr ')) {
			currentStr = stripQuotes(line.slice(7))
			readingMsgStr = true
			continue
		}

		// ── Multiline continuation ───────────────────────────────────────────
		if (line.startsWith('"')) {
			const val = stripQuotes(line)
			if (readingMsgStr) {
				currentStr += val
			} else if (currentId) {
				currentId += val
			}
		}
	}

	flushEntry()
	const headers = parseHeaders(headersRaw)
	return {
		isSource: false,
		language: headers.Language || 'unknown',
		headers,
		entries,
	}
}

function stripQuotes(str: string) {
	return str.replace(/^"/, '').replace(/"$/, '')
}

function parseHeaders(lines: string[]) {
	const result: Record<string, string> = {}

	const joined = lines.join('\n')

	const matches = joined.matchAll(/"([^:]+):\s*(.*?)\\n"/g)

	for (const m of matches) {
		result[m[1]] = m[2]
	}

	return result
}

const REGISTRY_KEY = 'po:registry'

export const getPoFile = (lang: string) =>
	get<PoFileStore>(`po:${lang}`)

export const savePoFile = async (store: PoFileStore) => {
	await set(`po:${store.language}`, store)

	const registry = (await get<string[]>(REGISTRY_KEY)) ?? []

	if (!registry.includes(store.language)) {
		registry.push(store.language)
		await set(REGISTRY_KEY, registry)
	}
}

export const deletePoFile = async (lang: string) => {
	const { del } = await import('idb-keyval')

	await del(`po:${lang}`)

	const registry = (await get<string[]>(REGISTRY_KEY)) ?? []
	await set(
		REGISTRY_KEY,
		registry.filter(l => l !== lang)
	)
}

export const loadAllPoFiles = async (): Promise<PoFileStore[]> => {
	const registry = (await get<string[]>(REGISTRY_KEY)) ?? []

	const files = await Promise.all(
		registry.map(lang => getPoFile(lang))
	)

	return files.filter(Boolean) as PoFileStore[]
}

export function getTranslationPercentage(
	source: PoFileStore,
	target: PoFileStore
): number {
	const sourceEntries = Object.values(source.entries)

	if (sourceEntries.length === 0) return 0

	let translated = 0

	for (const entry of sourceEntries) {
		const targetEntry = target.entries[entry.id]

		if (targetEntry && targetEntry.value !== '') {
			translated++
		}
	}

	return (translated / sourceEntries.length) * 100
}

export function getAllTranslationPercentages(files: PoFileStore[]) {
	const source = files.find(f => f.isSource)

	if (!source) {
		throw new Error('No source file defined')
	}

	return files.map(file => {
		if (file.language === source.language) {
			return {
				language: file.language,
				percentage: 100,
			}
		}

		return {
			language: file.language,
			percentage: getTranslationPercentage(source, file),
		}
	})
}

function formatEntry(e: PoEntry) {
	const parts: string[] = []

	if (e.comments?.length) {
		for (const c of e.comments) {
			parts.push(`#. ${c}`)
		}
	}

	if (e.flags?.length) {
		for (const f of e.flags) {
			parts.push(`#, ${f}`)
		}
	}

	if (e.references?.length) {
		for (const ref of e.references) {
			parts.push(`#: ${ref}`)
		}
	}

	parts.push(`msgid "${e.id}"`)
	parts.push(`msgstr "${e.value || ''}"`)
	return parts.join('\n')
}

export async function exportPoFile(language: string) {
	const store = await getPoFile(language)
	if (!store) return null

	const headers = store.headers ?? {}
	const headerBlock =
		Object.entries(headers)
			.map(([k, v]) => `"${k}: ${v}\\n"`)
			.join('\n') || ''

	const body = Object.values(store.entries || {})
		.map(formatEntry)
		.join('\n\n')

	return `msgid ""\nmsgstr ""\n${headerBlock}\n\n${body}\n`
}

export function downloadFile(filename: string, content: string) {
	const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
	const url = URL.createObjectURL(blob)

	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()

	URL.revokeObjectURL(url)
}
