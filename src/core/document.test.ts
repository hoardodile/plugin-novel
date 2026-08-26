// @vitest-environment node

import { describe, expect, it } from "vitest"
import {
	buildNovelDocument,
	DEFAULT_CHAPTER_REGEX_FLAGS,
	DEFAULT_CHAPTER_REGEX_SOURCE,
	normalizeNovelText,
	parseNovel,
	splitNovelParagraphs,
} from "./document"

describe("normalizeNovelText", () => {
	it("strips a leading BOM", () => {
		expect(normalizeNovelText("\uFEFFhello")).toBe("hello")
	})

	it("normalises CRLF and CR to LF", () => {
		expect(normalizeNovelText("a\r\nb\rc\nd")).toBe("a\nb\nc\nd")
	})
})

describe("splitNovelParagraphs", () => {
	it("collapses multiple blank lines and trims paragraphs", () => {
		expect(splitNovelParagraphs("a\n\n\n  b  \n\n c")).toEqual(["a", "b", "c"])
	})

	it("drops empty paragraphs", () => {
		expect(splitNovelParagraphs("\n\n\n")).toEqual([])
	})
})

describe("parseNovel", () => {
	it("detects Chinese chapter headings via the default regex", () => {
		const doc = parseNovel("第一章 起始\n正文段落\n第二卷 续\n更多")
		expect(doc.paragraphs).toHaveLength(4)
		expect(doc.chapters.map((c) => c.title)).toEqual([
			"第一章 起始",
			"第二卷 续",
		])
	})

	it("detects English chapter headings (Chapter, Prologue, Epilogue)", () => {
		const doc = parseNovel("Prologue\nintro\nChapter 1\nbody\nEpilogue\nend")
		expect(doc.chapters.map((c) => c.title)).toEqual([
			"Prologue",
			"Chapter 1",
			"Epilogue",
		])
	})

	it("detects Roman-numeral chapters (classic Gutenberg books)", () => {
		const doc = parseNovel(
			"CHAPTER I.\nbody\nCHAPTER XXIV.\nmore\nChapter xii.\nend",
		)
		expect(doc.chapters.map((c) => c.title)).toEqual([
			"CHAPTER I.",
			"CHAPTER XXIV.",
			"Chapter xii.",
		])
	})

	it("falls back to the default regex when the supplied source is invalid", () => {
		const doc = parseNovel("第一章 t\nbody", { chapterRegexSource: "(" })
		// Default regex still matches the Chinese heading.
		expect(doc.chapters).toHaveLength(1)
	})

	it("honours a user-supplied chapter regex when valid", () => {
		const doc = parseNovel("Section A\nbody\nSection B\nmore", {
			chapterRegexSource: "^Section\\s+[A-Z]",
			chapterRegexFlags: "",
		})
		expect(doc.chapters.map((c) => c.title)).toEqual(["Section A", "Section B"])
	})

	it("exports the default regex constants for reuse", () => {
		expect(typeof DEFAULT_CHAPTER_REGEX_SOURCE).toBe("string")
		expect(DEFAULT_CHAPTER_REGEX_FLAGS).toBe("i")
	})
})

describe("buildNovelDocument", () => {
	it("injects a heading for a titled unit whose prose lacks one", () => {
		const doc = buildNovelDocument([{ title: "卷一", text: "正文一\n正文二" }])
		expect(doc.paragraphs.map((p) => p.text)).toEqual([
			"卷一",
			"正文一",
			"正文二",
		])
		expect(doc.paragraphs[0]!.isChapterHeading).toBe(true)
		expect(doc.chapters).toEqual([{ paragraphIndex: 0, title: "卷一" }])
	})

	it("keeps a unit's own leading title as the boundary paragraph", () => {
		const doc = buildNovelDocument([
			{ title: "Chapter 5", text: "Chapter 5\nbody" },
		])
		expect(doc.paragraphs).toHaveLength(2)
		expect(doc.paragraphs[0]!.isChapterHeading).toBe(true)
		expect(doc.chapters).toEqual([{ paragraphIndex: 0, title: "Chapter 5" }])
	})

	it("in structured mode never consults the regex", () => {
		const doc = buildNovelDocument(
			[
				{ title: "第一章", text: "第一章\n正文" },
				{ title: "第二章", text: "第二章\n第一章 又来?\n更多" },
			],
			{ structured: true },
		)
		// Only the two unit boundaries are chapters — the stray heading
		// inside unit two is prose.
		expect(doc.chapters.map((c) => c.title)).toEqual(["第一章", "第二章"])
		expect(doc.paragraphs.map((p) => p.isChapterHeading)).toEqual([
			true,
			false,
			true,
			false,
			false,
		])
	})

	it("in plain mode a titled unit still detects inner headings once", () => {
		const doc = buildNovelDocument(
			[{ title: "Chapter 1.txt", text: "Chapter 1.txt\nChapter 2\nbody" }],
			{ structured: false },
		)
		// The boundary heading is not double-recorded; the inner heading is.
		expect(doc.chapters.map((c) => c.title)).toEqual([
			"Chapter 1.txt",
			"Chapter 2",
		])
	})

	it("drops empty units", () => {
		const doc = buildNovelDocument([
			{ title: "Empty", text: "  " },
			{ title: "Real", text: "text" },
		])
		expect(doc.paragraphs.map((p) => p.text)).toEqual(["Real", "text"])
		expect(doc.chapters).toEqual([{ paragraphIndex: 0, title: "Real" }])
	})

	it("keeps global paragraph indices stable across units", () => {
		const doc = buildNovelDocument(
			[
				{ title: "A", text: "a1\na2" },
				{ title: "B", text: "b1" },
			],
			{ structured: true },
		)
		expect(doc.paragraphs.map((p) => p.index)).toEqual([0, 1, 2, 3, 4])
	})
})
