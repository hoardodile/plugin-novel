// @vitest-environment node

import type { FileType } from "@hoardodile/sdk-server"
import { describe, expect, it } from "vitest"
import { classifySource, formatOf } from "./format"

function typeOf(ext: string): FileType | undefined {
	return (
		{
			".txt": {
				mime: "text/plain",
				ext: ".txt",
				kind: "other",
				source: "magic",
			},
			".md": {
				mime: "text/markdown",
				ext: ".md",
				kind: "other",
				source: "magic",
			},
			".html": {
				mime: "text/html",
				ext: ".html",
				kind: "other",
				source: "magic",
			},
			".epub": {
				mime: "application/epub+zip",
				ext: ".epub",
				kind: "other",
				source: "magic",
			},
			".docx": {
				mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				ext: ".docx",
				kind: "other",
				source: "magic",
			},
		} as Record<string, FileType>
	)[ext]
}

function byName(filename: string): FileType | undefined {
	return typeOf(filename.slice(filename.lastIndexOf(".")))
}

describe("formatOf", () => {
	it("names formats by content type", () => {
		expect(formatOf(typeOf(".epub"), "book.epub")).toBe("epub")
		expect(formatOf(typeOf(".docx"), "book.docx")).toBe("docx")
		expect(formatOf(typeOf(".html"), "page.html")).toBe("html")
	})

	it("names signature-less formats by extension", () => {
		expect(formatOf(undefined, "novel.txt")).toBe("text")
		expect(formatOf(undefined, "notes.md")).toBe("text")
		expect(formatOf(undefined, "book.fb2")).toBe("fb2")
		expect(formatOf(undefined, "book.fb2.zip")).toBe("fb2z")
		expect(formatOf(undefined, "book.fb2z")).toBe("fb2z")
	})

	it("refuses unknown formats", () => {
		expect(formatOf(undefined, "photo.jpg")).toBeUndefined()
		expect(formatOf(undefined, "movie.mp4")).toBeUndefined()
	})
})

describe("classifySource", () => {
	it("classifies a single known file", async () => {
		expect(await classifySource(["book.epub"], byName)).toEqual({
			kind: "single",
			format: "epub",
			filename: "book.epub",
		})
		expect(await classifySource(["novel.txt"], byName)).toEqual({
			kind: "single",
			format: "text",
			filename: "novel.txt",
		})
	})

	it("classifies a folder of plain-text chapters", async () => {
		expect(
			await classifySource(["卷一.txt", "卷二.txt", "ch3.html"], byName),
		).toEqual({ kind: "folder" })
	})

	it("rejects folders with non-text files", async () => {
		expect(
			await classifySource(["novel.txt", "photo.jpg"], byName),
		).toBeUndefined()
		expect(
			await classifySource(["book.epub", "notes.txt"], byName),
		).toBeUndefined()
	})

	it("rejects empty resources and unknown singles", async () => {
		expect(await classifySource([], byName)).toBeUndefined()
		expect(await classifySource(["photo.jpg"], byName)).toBeUndefined()
	})

	it("classifies by content when the extension lies", async () => {
		// A `.docx` named `.bin` is still a docx by content.
		expect(await classifySource(["book.bin"], () => typeOf(".docx"))).toEqual({
			kind: "single",
			format: "docx",
			filename: "book.bin",
		})
	})
})
