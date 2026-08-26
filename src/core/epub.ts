/**
 * EPUB structure, parsed from the two small XML files that describe a
 * book: `META-INF/container.xml` (points at the OPF) and the OPF itself
 * (spine order, manifest hrefs, metadata). Everything here is pure —
 * the hook layer only feeds bytes in and reads rows out.
 */

import { tokenizeMarkup } from "./markup.ts"
import { dcMetadata } from "./text.ts"

export type EpubMeta = {
	readonly title?: string
	readonly author?: string
	/** Spine entries after navigation/cover filtering. */
	readonly chapterCount: number
}

/**
 * Extract the OPF path from a `container.xml`. Returns the raw
 * `full-path` of the first `<rootfile>` — a path relative to the
 * archive root.
 */
export function epubContainerOpfPath(containerXml: string): string | undefined {
	for (const token of tokenizeMarkup(containerXml)) {
		if (token.type !== "open" || token.name !== "rootfile") continue
		const path = token.attrs["full-path"]?.trim()
		if (path !== undefined && path !== "") return path
	}
	return undefined
}

/**
 * Parse an OPF document into spine order (manifest hrefs in spine
 * sequence), plus the book metadata.
 */
export function parseEpubOpf(opfXml: string): {
	readonly spineHrefs: readonly string[]
	readonly title?: string
	readonly author?: string
} {
	const manifest = new Map<string, string>()
	const spine: string[] = []
	let inSpine = false

	for (const token of tokenizeMarkup(opfXml)) {
		switch (token.type) {
			case "open": {
				const { name, attrs } = token
				if (name === "spine") inSpine = true
				else if (
					name === "item" &&
					attrs.id !== undefined &&
					attrs.href !== undefined
				) {
					manifest.set(attrs.id, attrs.href)
				} else if (name === "itemref" && inSpine && attrs.idref !== undefined) {
					// Resolution happens after the walk: some producers
					// order the manifest after the spine.
					spine.push(attrs.idref)
				}
				break
			}
			case "close":
				if (token.name === "spine") inSpine = false
				break
			case "text":
				break
		}
	}
	const hrefs = spine
		.map((idref) => manifest.get(idref))
		.filter((href): href is string => href !== undefined)
	const metadata = dcMetadata(opfXml)
	return { spineHrefs: hrefs, ...metadata }
}

/**
 * Entry basenames (case-insensitive) that are structural, not prose:
 * covers, tables of contents, title pages. Real books virtually always
 * lead their spine with these; skipping them means the reader opens on
 * the first chapter.
 */
export function isStructuralEpubEntry(basename: string): boolean {
	const lower = basename.toLowerCase()
	if (!/\.(?:x?html?)$/.test(lower)) return false
	const stem = lower.replace(/\.(?:x?html?)$/, "")
	return (
		stem === "cover" ||
		stem === "toc" ||
		stem === "nav" ||
		stem === "titlepage" ||
		stem.startsWith("cover-") ||
		stem.startsWith("titlepage-") ||
		// Gutenberg's epub3 generator names the front-matter wraps
		// `wrap0000.html`, `wrap0001.html`, … — never prose.
		/^wrap\d+$/.test(stem)
	)
}

/**
 * Resolve an OPF-relative href to an archive path. Returns the href
 * itself when resolution fails (the caller falls back to a scan).
 */
export function resolveEpubHref(opfDir: string, href: string): string {
	const combined = opfDir === "" ? href : `${opfDir}/${href}`
	return normalizeZipPath(combined)
}

/** Normalise `/`-separated zip paths: collapses `.` and `..` segments. */
export function normalizeZipPath(path: string): string {
	const parts = path.split("/")
	const out: string[] = []
	for (const part of parts) {
		if (part === "" || part === ".") continue
		if (part === "..") {
			out.pop()
			continue
		}
		out.push(part)
	}
	return out.join("/")
}
