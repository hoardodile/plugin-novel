import { describe, expect, it } from "vitest"
import type { VerticalBoxes } from "./scroll-layout"
import {
	anchorToScrollTop,
	boxAtScrollTop,
	chapterForParagraph,
	scrollProgress,
} from "./scroll-layout"

const boxes: VerticalBoxes = new Map([
	[0, { top: 0, height: 100 }],
	[1, { top: 100, height: 200 }],
	[2, { top: 300, height: 150 }],
])

describe("boxAtScrollTop", () => {
	it("finds the paragraph under the scroll top", () => {
		expect(boxAtScrollTop(0, boxes)).toEqual({ paragraphIndex: 0, fraction: 0 })
		expect(boxAtScrollTop(250, boxes)).toEqual({
			paragraphIndex: 1,
			fraction: 0.75,
		})
		expect(boxAtScrollTop(340, boxes)).toEqual({
			paragraphIndex: 2,
			fraction: (340 - 300) / 150,
		})
	})

	it("clamps to the nearest paragraph on the edges", () => {
		expect(boxAtScrollTop(-10, boxes)).toEqual({
			paragraphIndex: 0,
			fraction: 0,
		})
		expect(boxAtScrollTop(1000, boxes)).toEqual({
			paragraphIndex: 2,
			fraction: 1,
		})
	})

	it("returns undefined for an empty index", () => {
		expect(boxAtScrollTop(0, new Map())).toBeUndefined()
	})
})

describe("anchorToScrollTop", () => {
	it("maps an anchor back to a scroll offset", () => {
		expect(anchorToScrollTop({ paragraphIndex: 1, fraction: 0 }, boxes)).toBe(
			100,
		)
		expect(anchorToScrollTop({ paragraphIndex: 1, fraction: 0.5 }, boxes)).toBe(
			200,
		)
	})

	it("returns 0 for an unknown paragraph", () => {
		expect(anchorToScrollTop({ paragraphIndex: 99, fraction: 0 }, boxes)).toBe(
			0,
		)
	})
})

describe("scrollProgress", () => {
	it("reports the fraction of the scrollable range", () => {
		expect(scrollProgress(0, 1000, 200)).toBe(0)
		expect(scrollProgress(400, 1000, 200)).toBe(0.5)
		expect(scrollProgress(800, 1000, 200)).toBe(1)
	})

	it("reads 1 when the content is not scrollable", () => {
		expect(scrollProgress(0, 200, 200)).toBe(1)
	})
})

describe("chapterForParagraph", () => {
	const chapters = [
		{ paragraphIndex: 0, title: "Prologue" },
		{ paragraphIndex: 10, title: "Chapter 1" },
		{ paragraphIndex: 30, title: "Chapter 2" },
	]

	it("returns the chapter at or above the paragraph", () => {
		expect(chapterForParagraph(chapters, 0)?.title).toBe("Prologue")
		expect(chapterForParagraph(chapters, 15)?.title).toBe("Chapter 1")
		expect(chapterForParagraph(chapters, 45)?.title).toBe("Chapter 2")
	})

	it("returns undefined when there are no chapters", () => {
		expect(chapterForParagraph([], 5)).toBeUndefined()
	})
})
