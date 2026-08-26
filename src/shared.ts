import type { PluginSchema } from "@hoardodile/sdk-types"
import { isRecord } from "@hoardodile/sdk-web"

/**
 * Novel plugin schema. One row per readable text unit: a bare source
 * file, or a virtual container entry (`book.epub!OEBPS/text/ch1.xhtml`)
 * the client reads through the host's container addressing.
 */
export type NovelKind = "text" | "html" | "epub" | "docx" | "fb2"

export type NovelFile = {
	readonly path: string
	readonly kind: NovelKind
}

export interface NovelSourceMeta {
	readonly title?: string
	readonly author?: string
	readonly chapterCount?: number
}

export interface NovelSearchMeta {
	readonly v: number
	readonly facets?: Readonly<Record<string, boolean>>
}

export interface NovelSchema extends PluginSchema {
	file: NovelFile
	sourceMeta: NovelSourceMeta
	searchMeta: NovelSearchMeta
	anchor: NovelParagraphAnchor
}

/** Comment anchor pinning a message to one paragraph of a text unit. */
export type NovelParagraphAnchor = {
	readonly paragraphIndex: number
	readonly filename: string
}

/** Validate incoming anchor data against {@link NovelParagraphAnchor}. */
export function decodeNovelParagraphAnchor(
	data: unknown,
): NovelParagraphAnchor | undefined {
	if (!isRecord(data)) return undefined
	const { paragraphIndex, filename } = data
	if (typeof paragraphIndex !== "number" || typeof filename !== "string") {
		return undefined
	}
	return { paragraphIndex, filename }
}
