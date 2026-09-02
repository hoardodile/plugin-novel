import type { CSSProperties } from "react"

/**
 * Pure geometry for the novel reader's multi-column pagination. None of
 * this needs React or the DOM once the paragraph boxes have been
 * measured, so it lives here where it can be reasoned about — and
 * tested — on its own.
 */

/**
 * Top/bottom padding (px) inside each column. Zero — the real top/bottom
 * strips already hold the chapter/page/time corners, so the reading text
 * runs edge-to-edge vertically (no extra breathing room).
 */
const COLUMN_TOP_PADDING = 0
const COLUMN_BOTTOM_PADDING = 0
/**
 * Horizontal inset (px) reserved on each side of every page. Applied as
 * half-padding-inline / half-column-gap so one column occupies exactly
 * one viewport page wide (column pitch === page width) while the
 * visible text stays centred with consistent gutters.
 */
const COLUMN_SIDE_PADDING = 32

// Compact (below-md / phone): a bit more side margin for a comfortable
// reading measure, and no top/bottom (the strips separate the corners).
// Column-pitch math is padding-agnostic, so pagination stays correct.
const COLUMN_COMPACT_SIDE_PADDING = 24
const COLUMN_COMPACT_TOP_PADDING = 0
const COLUMN_COMPACT_BOTTOM_PADDING = 0

/** Where a paragraph landed in the measured column flow. */
export type ParagraphBox = {
	readonly left: number
	readonly width: number
}

export type ParagraphBoxes = ReadonlyMap<number, ParagraphBox>

/**
 * Reflow-invariant reading position: the paragraph at the page's left
 * edge, plus how far along that paragraph the edge falls. The fraction
 * is what survives a font-size or viewport change — the absolute
 * scroll offset does not.
 */
export type NovelScrollAnchor = {
	readonly paragraphIndex: number
	readonly fraction: number
}

export type ChunkLayout = {
	readonly pagesInChunk: number
	readonly paragraphBoxes: ParagraphBoxes
}

/**
 * Where the next measurement pass should land. `first` / `last` handle
 * chunk-boundary navigation, `anchor` a jump to a paragraph, `page` a
 * jump to a page within the chunk. Absent means "stay where the
 * persisted anchor points" — the pure resize path.
 */
export type PendingChunkTarget =
	| { readonly kind: "first" }
	| { readonly kind: "last" }
	| {
			readonly kind: "anchor"
			readonly paragraph: number
			readonly fraction: number
	  }
	| { readonly kind: "page"; readonly page: number }

/**
 * Column-pitch math: one viewport page must equal exactly one column
 * position. With `padding-inline = sidePad` and `column-gap = 2 *
 * sidePad`, column N is centred in page N at offset `(N-1) * pageWidth
 * + sidePad`, keeping `scrollLeft = N * pageWidth` on a clean page
 * boundary at any viewport width. (A `column-width = pageWidth,
 * column-gap = 0` combination drifts: each column's content area is
 * narrower than a page, so columns and pages fall out of step and page
 * lookups round to the wrong page.)
 */
export function columnFlowStyle(
	pageSize: { readonly width: number; readonly height: number },
	opts: { readonly compact?: boolean } = {},
): CSSProperties {
	const side = opts.compact ? COLUMN_COMPACT_SIDE_PADDING : COLUMN_SIDE_PADDING
	const top = opts.compact ? COLUMN_COMPACT_TOP_PADDING : COLUMN_TOP_PADDING
	const bottom = opts.compact
		? COLUMN_COMPACT_BOTTOM_PADDING
		: COLUMN_BOTTOM_PADDING
	if (pageSize.width <= 0) return { height: "100%" }
	return {
		height: `${pageSize.height}px`,
		columnWidth: `${Math.max(1, pageSize.width - 2 * side)}px`,
		columnGap: `${2 * side}px`,
		columnFill: "auto",
		paddingTop: `${top}px`,
		paddingBottom: `${bottom}px`,
		paddingLeft: `${side}px`,
		paddingRight: `${side}px`,
		boxSizing: "border-box",
	}
}

/** Number of viewport pages the measured column flow spans. */
export function countPages(scrollWidth: number, pageWidth: number): number {
	if (pageWidth <= 0) return 1
	return Math.max(1, Math.ceil(scrollWidth / pageWidth))
}

/**
 * Map `pageInChunk` (the leftmost visible column index) to a stable
 * anchor: the paragraph whose layout box contains the page's left edge,
 * plus where along that box the edge lies. Returns `undefined` when no
 * paragraphs were measured (e.g. an empty chunk).
 */
export function pageToAnchor(opts: {
	readonly pageInChunk: number
	readonly paragraphBoxes: ParagraphBoxes
	readonly pageWidth: number
}): NovelScrollAnchor | undefined {
	const { pageInChunk, paragraphBoxes, pageWidth } = opts
	if (paragraphBoxes.size === 0) return undefined
	const pageLeft = pageInChunk * pageWidth

	type Candidate = ParagraphBox & { readonly pidx: number }
	let containing: Candidate | undefined
	let firstAfter: Candidate | undefined
	let lastSeen: Candidate | undefined
	for (const [pidx, box] of paragraphBoxes) {
		lastSeen = { pidx, left: box.left, width: box.width }
		if (box.left <= pageLeft && pageLeft < box.left + box.width) {
			containing = lastSeen
			break
		}
		if (box.left > pageLeft && firstAfter === undefined) firstAfter = lastSeen
	}
	const picked = containing ?? firstAfter ?? lastSeen
	if (picked === undefined) return undefined
	const width = Math.max(1, picked.width)
	return {
		paragraphIndex: picked.pidx,
		fraction: clamp01((pageLeft - picked.left) / width),
	}
}

/**
 * Invert {@link pageToAnchor}: find the page in the freshly measured
 * layout containing `box.left + fraction * box.width`. Falls back to
 * page 0 when the paragraph is not in the current chunk.
 */
export function anchorToPage(opts: {
	readonly anchor: NovelScrollAnchor
	readonly paragraphBoxes: ParagraphBoxes
	readonly pageWidth: number
	readonly pagesInChunk: number
}): number {
	const { anchor, paragraphBoxes, pageWidth, pagesInChunk } = opts
	const box = paragraphBoxes.get(anchor.paragraphIndex)
	if (box === undefined || pageWidth <= 0) return 0
	const x = box.left + clamp01(anchor.fraction) * box.width
	return clampPage(Math.floor(x / pageWidth), pagesInChunk)
}

/**
 * Resolve where a freshly measured chunk should scroll to. Explicit
 * navigation wins; without a pending target the persisted anchor keeps
 * the reader on the same text across a reflow.
 */
export function resolveTargetPage(opts: {
	readonly pending: PendingChunkTarget | undefined
	readonly anchor: NovelScrollAnchor
	readonly layout: ChunkLayout
	readonly pageWidth: number
}): number {
	const { pending, anchor, layout, pageWidth } = opts
	const { pagesInChunk, paragraphBoxes } = layout
	if (pending === undefined) {
		return anchorToPage({ anchor, paragraphBoxes, pageWidth, pagesInChunk })
	}
	switch (pending.kind) {
		case "first":
			return 0
		case "last":
			return pagesInChunk - 1
		case "page":
			return clampPage(pending.page, pagesInChunk)
		case "anchor":
			return anchorToPage({
				anchor: {
					paragraphIndex: pending.paragraph,
					fraction: pending.fraction,
				},
				paragraphBoxes,
				pageWidth,
				pagesInChunk,
			})
	}
}

/**
 * Per-chunk page counts, with unmeasured chunks filled in from the
 * running average so the global page indicator stays monotonic and
 * converges as more chunks are visited.
 */
export type PageTally = {
	readonly currentPage: number
	readonly totalPages: number
}

export function tallyPages(opts: {
	readonly chunkCount: number
	readonly chunkIdx: number
	readonly pageInChunk: number
	readonly pagesByChunk: ReadonlyMap<number, number>
}): PageTally {
	const { chunkCount, chunkIdx, pageInChunk, pagesByChunk } = opts
	const estimate = estimatePagesPerChunk(pagesByChunk)
	let total = 0
	let before = 0
	for (let i = 0; i < chunkCount; i++) {
		const pages = pagesByChunk.get(i) ?? estimate
		total += pages
		if (i < chunkIdx) before += pages
	}
	return {
		currentPage: before + pageInChunk + 1,
		totalPages: Math.max(1, total),
	}
}

/** Locate a global (1-based) page: which chunk, and which page inside it. */
export function locateGlobalPage(opts: {
	readonly page: number
	readonly chunkCount: number
	readonly pagesByChunk: ReadonlyMap<number, number>
	readonly totalPages: number
}): { readonly chunkIdx: number; readonly pageInChunk: number } | undefined {
	const { page, chunkCount, pagesByChunk, totalPages } = opts
	const estimate = estimatePagesPerChunk(pagesByChunk)
	const target = Math.max(1, Math.min(totalPages, page)) - 1
	let acc = 0
	for (let i = 0; i < chunkCount; i++) {
		const pages = pagesByChunk.get(i) ?? estimate
		if (target < acc + pages) {
			return { chunkIdx: i, pageInChunk: clampPage(target - acc, pages) }
		}
		acc += pages
	}
	return undefined
}

function estimatePagesPerChunk(
	pagesByChunk: ReadonlyMap<number, number>,
): number {
	if (pagesByChunk.size === 0) return 1
	let sum = 0
	for (const pages of pagesByChunk.values()) sum += pages
	return Math.max(1, Math.round(sum / pagesByChunk.size))
}

function clampPage(page: number, pagesInChunk: number): number {
	return Math.max(0, Math.min(page, pagesInChunk - 1))
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value))
}
