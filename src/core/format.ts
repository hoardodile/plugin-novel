import type { FileType } from "@hoardodile/sdk-server"

/**
 * Source-shape classification: a novel resource is either one file in a
 * known format or a folder of plain-text chapters. Everything
 * downstream (detect, sourceMeta, listFiles) branches once on this
 * shape.
 *
 * Sniffing decides for signature-carrying formats (epub/docx/html);
 * extension decides for signature-less text and legacy formats (txt,
 * md, fb2 — the host sniffer itself answers those by extension).
 */

export type NovelFormat = "text" | "html" | "docx" | "epub" | "fb2" | "fb2z"

export type NovelSourceShape =
	| {
			readonly kind: "single"
			readonly format: NovelFormat
			readonly filename: string
	  }
	| { readonly kind: "folder" }

const TEXT_EXTS = new Set([".txt", ".md"])
const FOLDER_EXTS = new Set([".txt", ".md", ".html", ".htm"])

const MIME_FORMATS: Readonly<Record<string, NovelFormat>> = {
	"application/epub+zip": "epub",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		"docx",
	"text/html": "html",
	"text/plain": "text",
	"text/markdown": "text",
}

/**
 * Name a file's format from its sniffed type plus its name. Returns
 * `undefined` when neither can tell — the resource is not a novel file.
 */
export function formatOf(
	type: FileType | undefined,
	filename: string,
): NovelFormat | undefined {
	const mime = type?.mime
	if (mime !== undefined) {
		const byMime = MIME_FORMATS[mime.toLowerCase()]
		if (byMime !== undefined) return byMime
	}
	const lower = filename.toLowerCase()
	if (lower.endsWith(".fb2.zip") || lower.endsWith(".fb2z")) return "fb2z"
	const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase()
	if (TEXT_EXTS.has(ext)) return "text"
	if (ext === ".fb2") return "fb2"
	if (ext === ".html" || ext === ".htm") return "html"
	if (ext === ".epub") return "epub"
	if (ext === ".docx") return "docx"
	return undefined
}

/**
 * Classify the resource's file list. A single known file wins outright;
 * otherwise the resource is a chapter folder when every file is a
 * plain-text document (txt/md/html).
 */
export async function classifySource(
	files: readonly string[],
	typeOf: (
		filename: string,
	) => FileType | undefined | Promise<FileType | undefined>,
): Promise<NovelSourceShape | undefined> {
	if (files.length === 1) {
		const only = files[0]!
		const format = formatOf(await typeOf(only), only)
		if (format !== undefined) {
			return { kind: "single", format, filename: only }
		}
		return undefined
	}
	if (files.length < 2) return undefined
	for (const filename of files) {
		const type = await typeOf(filename)
		const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase()
		if (!FOLDER_EXTS.has(ext)) {
			// Content may still vouch for a folder member the name hides
			// (an extension-less `.txt`); otherwise the folder is not a
			// chapter folder.
			const format = formatOf(type, filename)
			if (format !== "text" && format !== "html") return undefined
		}
	}
	return { kind: "folder" }
}
