import {
	type Detection,
	definePlugin,
	type ResourceAPI,
} from "@hoardodile/sdk-server"
import { naturalSort } from "@hoardodile/sdk-server/helpers"
import { SEARCH_META_VERSION } from "@hoardodile/sdk-types/resource"
import { decodeText } from "./core/charset"
import {
	epubContainerOpfPath,
	isStructuralEpubEntry,
	parseEpubOpf,
	resolveEpubHref,
} from "./core/epub"
import { classifySource, type NovelSourceShape } from "./core/format"
import { docxMetadata, fb2Metadata, fb2ToUnits } from "./core/text"
import type {
	NovelFile,
	NovelSchema,
	NovelSearchMeta,
	NovelSourceMeta,
} from "./shared"

export default definePlugin<NovelSchema>({
	detect,
	sourceMeta,
	searchMeta,
	listFiles,
})

/**
 * Classify the resource once per hook call. A single file of a known
 * format (txt/md/html/epub/docx/fb2, plus `.fb2.zip` containers), or a
 * folder of plain-text chapters.
 */
async function shapeOf(
	api: ResourceAPI,
): Promise<NovelSourceShape | undefined> {
	return classifySource(await api.listFileNames(), (name) => api.sniff(name))
}

async function detect(api: ResourceAPI): Promise<Detection> {
	const shape = await shapeOf(api)
	if (shape === undefined) {
		return { ok: false, reasons: ["text-file"] }
	}
	if (shape.kind === "single" && shape.format === "fb2z") {
		// A `.zip` named like an fb2 container must actually hold one.
		const listing = await api.listContainer(shape.filename)
		const hasFb2 = listing.entries.some((entry) =>
			entry.path.toLowerCase().endsWith(".fb2"),
		)
		if (!hasFb2) return { ok: false, reasons: ["text-file"] }
	}
	return { ok: true }
}

/**
 * The readable text units. Folder resources list every plain-text
 * chapter file; archives list virtual container entries the client
 * reads through container addressing (`book.epub!OEBPS/text/ch1.xhtml`).
 */
async function listFiles(api: ResourceAPI): Promise<readonly NovelFile[]> {
	const shape = await shapeOf(api)
	if (shape === undefined) return []
	if (shape.kind === "folder") {
		return naturalSort(await api.listFileNames()).map(folderRowOf)
	}
	switch (shape.format) {
		case "text":
			return [{ path: shape.filename, kind: "text" }]
		case "html":
			return [{ path: shape.filename, kind: "html" }]
		case "docx":
			return docxRows(api, shape.filename)
		case "fb2":
			return [{ path: shape.filename, kind: "fb2" }]
		case "fb2z":
			return fb2zRows(api, shape.filename)
		case "epub":
			return epubRows(api, shape.filename)
	}
}

function folderRowOf(filename: string): NovelFile {
	const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase()
	return {
		path: filename,
		kind: ext === ".html" || ext === ".htm" ? "html" : "text",
	}
}

async function docxRows(
	api: ResourceAPI,
	filename: string,
): Promise<readonly NovelFile[]> {
	const listing = await api.listContainer(filename)
	const entry = listing.entries.find((e) =>
		e.path.toLowerCase().endsWith("word/document.xml"),
	)
	if (entry === undefined) return []
	return [{ path: `${filename}!${entry.path}`, kind: "docx" }]
}

async function fb2zRows(
	api: ResourceAPI,
	filename: string,
): Promise<readonly NovelFile[]> {
	const listing = await api.listContainer(filename)
	const entry = listing.entries.find((e) =>
		e.path.toLowerCase().endsWith(".fb2"),
	)
	if (entry === undefined) return []
	return [{ path: `${filename}!${entry.path}`, kind: "fb2" }]
}

/**
 * Resolve the spine of an epub: `container.xml` → OPF → spine hrefs,
 * remapped onto the archive's actual entry paths (some producers write
 * hrefs whose case differs from the stored paths). Falls back to a
 * natural-ordered scan of the xhtml entries when any step fails, so a
 * broken container still opens.
 */
async function epubRows(
	api: ResourceAPI,
	filename: string,
): Promise<readonly NovelFile[]> {
	const listing = await api.listContainer(filename)
	const entries = listing.entries.map((e) => e.path)
	const lower = new Map(entries.map((p) => [p.toLowerCase(), p]))
	const opfXml = await readEpubOpf(api, filename, lower)
	if (opfXml !== undefined) {
		const { spineHrefs } = parseEpubOpf(opfXml)
		const opfEntry = [...lower.values()].find((p) =>
			p.toLowerCase().endsWith(".opf"),
		)
		const opfDir = opfEntry === undefined ? "" : dirOf(opfEntry)
		const rows: NovelFile[] = []
		for (const href of spineHrefs) {
			const resolved = resolveEpubHref(opfDir, href)
			const entry = lower.get(resolved.toLowerCase())
			if (entry === undefined) continue
			if (isStructuralEpubEntry(baseOf(entry))) continue
			rows.push({ path: `${filename}!${entry}`, kind: "epub" })
		}
		if (rows.length > 0) return rows
	}
	return xhtmlFallbackRows(filename, entries)
}

async function readEpubOpf(
	api: ResourceAPI,
	filename: string,
	lower: ReadonlyMap<string, string>,
): Promise<string | undefined> {
	const containerEntry = lower.get("meta-inf/container.xml")
	if (containerEntry === undefined) return undefined
	const containerXml = await readText(api, `${filename}!${containerEntry}`)
	if (containerXml === undefined) return undefined
	const opfPath = epubContainerOpfPath(containerXml)
	if (opfPath === undefined) return undefined
	const opfEntry = lower.get(opfPath.toLowerCase())
	if (opfEntry === undefined) return undefined
	return readText(api, `${filename}!${opfEntry}`)
}

function xhtmlFallbackRows(
	filename: string,
	entries: readonly string[],
): readonly NovelFile[] {
	return naturalSort(
		entries.filter(
			(entry) =>
				/\.(?:x?html?)$/i.test(entry) && !isStructuralEpubEntry(baseOf(entry)),
		),
	).map((entry) => ({ path: `${filename}!${entry}`, kind: "epub" as const }))
}

async function sourceMeta(
	api: ResourceAPI,
): Promise<NovelSourceMeta | undefined> {
	const shape = await shapeOf(api)
	if (shape === undefined || shape.kind === "folder") return undefined
	switch (shape.format) {
		case "epub":
			return epubSourceMeta(api, shape.filename)
		case "fb2":
			return fb2SourceMeta(api, shape.filename)
		case "fb2z":
			return fb2zSourceMeta(api, shape.filename)
		case "docx":
			return docxSourceMeta(api, shape.filename)
		default:
			return undefined
	}
}

async function epubSourceMeta(
	api: ResourceAPI,
	filename: string,
): Promise<NovelSourceMeta | undefined> {
	const listing = await api.listContainer(filename)
	const entries = listing.entries.map((e) => e.path)
	const lower = new Map(entries.map((p) => [p.toLowerCase(), p]))
	const opfXml = await readEpubOpf(api, filename, lower)
	if (opfXml === undefined) return undefined
	const { title, author, spineHrefs } = parseEpubOpf(opfXml)
	const rows = await epubRows(api, filename)
	return { title, author, chapterCount: rows.length || spineHrefs.length }
}

async function fb2SourceMeta(
	api: ResourceAPI,
	filename: string,
): Promise<NovelSourceMeta | undefined> {
	const raw = await readText(api, filename)
	if (raw === undefined) return undefined
	const { title, author } = fb2Metadata(raw)
	const chapterCount = fb2ToUnits(raw).filter(
		(unit) => unit.title !== undefined,
	).length
	if (title === undefined && author === undefined) return undefined
	return { title, author, chapterCount }
}

async function fb2zSourceMeta(
	api: ResourceAPI,
	filename: string,
): Promise<NovelSourceMeta | undefined> {
	const rows = await fb2zRows(api, filename)
	const first = rows[0]
	if (first === undefined) return undefined
	const raw = await readText(api, first.path)
	if (raw === undefined) return undefined
	const { title, author } = fb2Metadata(raw)
	const chapterCount = fb2ToUnits(raw).filter(
		(unit) => unit.title !== undefined,
	).length
	if (title === undefined && author === undefined) return undefined
	return { title, author, chapterCount }
}

async function docxSourceMeta(
	api: ResourceAPI,
	filename: string,
): Promise<NovelSourceMeta | undefined> {
	const listing = await api.listContainer(filename)
	const core = listing.entries.find((e) =>
		e.path.toLowerCase().endsWith("docprops/core.xml"),
	)
	if (core === undefined) return undefined
	const raw = await readText(api, `${filename}!${core.path}`)
	if (raw === undefined) return undefined
	const { title, author } = docxMetadata(raw)
	if (title === undefined && author === undefined) return undefined
	return { title, author }
}

/**
 * Format facets computed once at import time from the source shape —
 * the categories the manifest's `ui.search.kinds` partition on. All
 * four keys are always present so the facet bag is stable; `plain`
 * covers every single-file text/html source and chapter folders.
 */
async function searchMeta(
	api: ResourceAPI,
): Promise<NovelSearchMeta | undefined> {
	const shape = await shapeOf(api)
	if (shape === undefined) return undefined
	const facets =
		shape.kind === "folder"
			? { epub: false, fb2: false, docx: false, plain: true }
			: {
					epub: shape.format === "epub",
					fb2: shape.format === "fb2" || shape.format === "fb2z",
					docx: shape.format === "docx",
					plain: shape.format === "text" || shape.format === "html",
				}
	return { v: SEARCH_META_VERSION, facets }
}

/** Read a whole entry as UTF-8 text; `undefined` on read failure. */
async function readText(
	api: ResourceAPI,
	path: string,
): Promise<string | undefined> {
	try {
		const bytes = await api.readFile(path)
		if (bytes.byteLength === 0) return undefined
		return decodeText(bytes)
	} catch {
		return undefined
	}
}

function dirOf(path: string): string {
	const slash = path.lastIndexOf("/")
	return slash === -1 ? "" : path.slice(0, slash)
}

function baseOf(path: string): string {
	const slash = path.lastIndexOf("/")
	return slash === -1 ? path : path.slice(slash + 1)
}
