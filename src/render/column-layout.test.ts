// @vitest-environment node

import { describe, expect, it } from "vitest"
import {
	anchorToPage,
	columnFlowStyle,
	countPages,
	locateGlobalPage,
	type ParagraphBoxes,
	pageToAnchor,
	resolveTargetPage,
	tallyPages,
} from "./column-layout"

const PAGE_WIDTH = 400

/** Three paragraphs laid out across four pages of 400px. */
function boxes(): ParagraphBoxes {
	return new Map([
		[0, { left: 0, width: 500 }],
		[1, { left: 500, width: 300 }],
		[2, { left: 800, width: 700 }],
	])
}

describe("countPages", () => {
	it("rounds a partial trailing page up", () => {
		expect(countPages(1500, PAGE_WIDTH)).toBe(4)
		expect(countPages(1600, PAGE_WIDTH)).toBe(4)
		expect(countPages(1601, PAGE_WIDTH)).toBe(5)
	})

	it("never reports fewer than one page", () => {
		expect(countPages(0, PAGE_WIDTH)).toBe(1)
		expect(countPages(1500, 0)).toBe(1)
	})
})

describe("pageToAnchor", () => {
	it("anchors to the paragraph containing the page's left edge", () => {
		expect(
			pageToAnchor({
				pageInChunk: 0,
				paragraphBoxes: boxes(),
				pageWidth: PAGE_WIDTH,
			}),
		).toEqual({
			paragraphIndex: 0,
			fraction: 0,
		})
		// Page 1 starts at 400px, 400/500 into paragraph 0.
		expect(
			pageToAnchor({
				pageInChunk: 1,
				paragraphBoxes: boxes(),
				pageWidth: PAGE_WIDTH,
			}),
		).toEqual({
			paragraphIndex: 0,
			fraction: 0.8,
		})
		// Page 2 starts at 800px, exactly at paragraph 2's left edge.
		expect(
			pageToAnchor({
				pageInChunk: 2,
				paragraphBoxes: boxes(),
				pageWidth: PAGE_WIDTH,
			}),
		).toEqual({
			paragraphIndex: 2,
			fraction: 0,
		})
	})

	it("returns undefined for an unmeasured chunk", () => {
		expect(
			pageToAnchor({
				pageInChunk: 0,
				paragraphBoxes: new Map(),
				pageWidth: PAGE_WIDTH,
			}),
		).toBeUndefined()
	})

	it("clamps past the last measured paragraph", () => {
		const anchor = pageToAnchor({
			pageInChunk: 99,
			paragraphBoxes: boxes(),
			pageWidth: PAGE_WIDTH,
		})
		expect(anchor).toEqual({ paragraphIndex: 2, fraction: 1 })
	})
})

describe("anchorToPage", () => {
	it("inverts pageToAnchor", () => {
		for (const page of [0, 1, 2, 3]) {
			const anchor = pageToAnchor({
				pageInChunk: page,
				paragraphBoxes: boxes(),
				pageWidth: PAGE_WIDTH,
			})
			expect(anchor).toBeDefined()
			if (anchor === undefined) continue
			expect(
				anchorToPage({
					anchor,
					paragraphBoxes: boxes(),
					pageWidth: PAGE_WIDTH,
					pagesInChunk: 4,
				}),
			).toBe(page)
		}
	})

	it("falls back to page 0 for a paragraph outside the chunk", () => {
		expect(
			anchorToPage({
				anchor: { paragraphIndex: 99, fraction: 0.5 },
				paragraphBoxes: boxes(),
				pageWidth: PAGE_WIDTH,
				pagesInChunk: 4,
			}),
		).toBe(0)
	})

	it("clamps to the last page", () => {
		expect(
			anchorToPage({
				anchor: { paragraphIndex: 2, fraction: 1 },
				paragraphBoxes: boxes(),
				pageWidth: PAGE_WIDTH,
				pagesInChunk: 2,
			}),
		).toBe(1)
	})
})

describe("resolveTargetPage", () => {
	const layout = { pagesInChunk: 4, paragraphBoxes: boxes() }
	const anchor = { paragraphIndex: 1, fraction: 0 }

	it("keeps the persisted anchor when no navigation is pending", () => {
		expect(
			resolveTargetPage({
				pending: undefined,
				anchor,
				layout,
				pageWidth: PAGE_WIDTH,
			}),
		).toBe(1)
	})

	it("honours chunk-boundary navigation", () => {
		expect(
			resolveTargetPage({
				pending: { kind: "first" },
				anchor,
				layout,
				pageWidth: PAGE_WIDTH,
			}),
		).toBe(0)
		expect(
			resolveTargetPage({
				pending: { kind: "last" },
				anchor,
				layout,
				pageWidth: PAGE_WIDTH,
			}),
		).toBe(3)
	})

	it("clamps an out-of-range page request", () => {
		expect(
			resolveTargetPage({
				pending: { kind: "page", page: 99 },
				anchor,
				layout,
				pageWidth: PAGE_WIDTH,
			}),
		).toBe(3)
	})

	it("resolves a paragraph jump against the fresh layout", () => {
		expect(
			resolveTargetPage({
				pending: { kind: "anchor", paragraph: 2, fraction: 0 },
				anchor,
				layout,
				pageWidth: PAGE_WIDTH,
			}),
		).toBe(2)
	})
})

describe("tallyPages", () => {
	it("counts measured chunks exactly", () => {
		expect(
			tallyPages({
				chunkCount: 3,
				chunkIdx: 1,
				pageInChunk: 2,
				pagesByChunk: new Map([
					[0, 5],
					[1, 4],
					[2, 6],
				]),
			}),
		).toEqual({ currentPage: 8, totalPages: 15 })
	})

	it("fills unmeasured chunks from the running average", () => {
		expect(
			tallyPages({
				chunkCount: 3,
				chunkIdx: 0,
				pageInChunk: 0,
				pagesByChunk: new Map([[0, 4]]),
			}),
		).toEqual({ currentPage: 1, totalPages: 12 })
	})

	it("reports at least one page for an empty document", () => {
		expect(
			tallyPages({
				chunkCount: 0,
				chunkIdx: 0,
				pageInChunk: 0,
				pagesByChunk: new Map(),
			}),
		).toEqual({ currentPage: 1, totalPages: 1 })
	})
})

describe("locateGlobalPage", () => {
	const pagesByChunk = new Map([
		[0, 5],
		[1, 4],
		[2, 6],
	])

	it("maps a global page onto its chunk", () => {
		expect(
			locateGlobalPage({
				page: 1,
				chunkCount: 3,
				pagesByChunk,
				totalPages: 15,
			}),
		).toEqual({ chunkIdx: 0, pageInChunk: 0 })
		expect(
			locateGlobalPage({
				page: 6,
				chunkCount: 3,
				pagesByChunk,
				totalPages: 15,
			}),
		).toEqual({ chunkIdx: 1, pageInChunk: 0 })
		expect(
			locateGlobalPage({
				page: 15,
				chunkCount: 3,
				pagesByChunk,
				totalPages: 15,
			}),
		).toEqual({ chunkIdx: 2, pageInChunk: 5 })
	})

	it("clamps out-of-range requests into the document", () => {
		expect(
			locateGlobalPage({
				page: 0,
				chunkCount: 3,
				pagesByChunk,
				totalPages: 15,
			}),
		).toEqual({ chunkIdx: 0, pageInChunk: 0 })
		expect(
			locateGlobalPage({
				page: 999,
				chunkCount: 3,
				pagesByChunk,
				totalPages: 15,
			}),
		).toEqual({ chunkIdx: 2, pageInChunk: 5 })
	})

	it("returns undefined when there are no chunks", () => {
		expect(
			locateGlobalPage({
				page: 1,
				chunkCount: 0,
				pagesByChunk: new Map(),
				totalPages: 1,
			}),
		).toBeUndefined()
	})
})

describe("columnFlowStyle", () => {
	it("keeps the column pitch equal to one page width", () => {
		const style = columnFlowStyle({ width: 400, height: 800 })
		// column-width + column-gap must equal the page width.
		expect(style.columnWidth).toBe("336px")
		expect(style.columnGap).toBe("64px")
		expect(style.height).toBe("800px")
	})

	it("collapses to a plain full-height box before the first layout", () => {
		expect(columnFlowStyle({ width: 0, height: 0 })).toEqual({ height: "100%" })
	})

	it("spans the full page span so the last page is not clamped short", () => {
		const style = columnFlowStyle(
			{ width: 400, height: 800 },
			{ flowWidth: 1600 },
		)
		// The element is explicitly sized to the whole `pagesInChunk · pageWidth`
		// span so `scrollWidth` is exactly that, letting the last page scroll to
		// its symmetric inset. Column pitch geometry is unchanged.
		expect(style.width).toBe("1600px")
		expect(style.columnWidth).toBe("336px")
		expect(style.columnGap).toBe("64px")
		expect(style.paddingLeft).toBe("32px")
		expect(style.paddingRight).toBe("32px")
		expect(style.height).toBe("800px")
	})

	it("leaves width unset (auto) when flowWidth is omitted", () => {
		const style = columnFlowStyle({ width: 400, height: 800 })
		expect(style.width).toBeUndefined()
		expect(style.columnWidth).toBe("336px")
	})

	it("ignores a non-positive flowWidth", () => {
		expect(
			columnFlowStyle({ width: 400, height: 800 }, { flowWidth: 0 }).width,
		).toBeUndefined()
	})
})
