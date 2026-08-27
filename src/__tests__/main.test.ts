// @vitest-environment node

import type { FileType } from "@hoardodile/sdk-server"
import { createResourceAPIFixture } from "@hoardodile/sdk-server"
import { SEARCH_META_VERSION } from "@hoardodile/sdk-types/resource"
import { describe, expect, it } from "vitest"
import plugin from "../main.ts"
import type { NovelSchema } from "../shared"

const DOCX_TYPE: FileType = {
	mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	ext: ".docx",
	kind: "other",
	source: "magic",
}

const CONTAINER_XML =
	'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
	'<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>' +
	"</rootfiles></container>"

const OPF_XML = [
	'<?xml version="1.0"?>',
	'<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/">',
	"<metadata><dc:title>Wanted</dc:title><dc:creator>Anon</dc:creator></metadata>",
	'<manifest><item id="c1" href="text/ch1.xhtml"/><item id="c2" href="text/ch2.xhtml"/></manifest>',
	'<spine><itemref idref="c1"/><itemref idref="c2"/></spine>',
	"</package>",
].join("")

function epubFixture() {
	return createResourceAPIFixture<NovelSchema>({
		files: ["book.epub"],
		containerListings: {
			"book.epub": {
				entries: [
					{ path: "META-INF/container.xml", sizeBytes: 120, kind: "other" },
					{ path: "OEBPS/content.opf", sizeBytes: 200, kind: "other" },
					{ path: "OEBPS/text/ch1.xhtml", sizeBytes: 100, kind: "other" },
					{ path: "OEBPS/text/ch2.xhtml", sizeBytes: 100, kind: "other" },
					{ path: "OEBPS/cover.xhtml", sizeBytes: 100, kind: "other" },
					{ path: "OEBPS/style.css", sizeBytes: 40, kind: "other" },
				],
			},
		},
		contents: {
			"book.epub!META-INF/container.xml": CONTAINER_XML,
			"book.epub!OEBPS/content.opf": OPF_XML,
		},
	})
}

describe("novel detect", () => {
	it("returns ok for a directory with epub file", async () => {
		const result = await plugin.detect(epubFixture().api)
		expect(result).toEqual({ ok: true })
	})

	it("returns ok for txt / md / html files", async () => {
		for (const name of ["novel.txt", "notes.md", "chapter.html"]) {
			const fixture = createResourceAPIFixture<NovelSchema>({ files: [name] })
			expect(await plugin.detect(fixture.api)).toEqual({ ok: true })
		}
	})

	it("returns ok for docx by content", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["book.docx"],
			types: { "book.docx": DOCX_TYPE },
		})
		expect(await plugin.detect(fixture.api)).toEqual({ ok: true })
	})

	it("returns ok for fb2 and fb2.zip containers", async () => {
		const plain = createResourceAPIFixture<NovelSchema>({ files: ["book.fb2"] })
		expect(await plugin.detect(plain.api)).toEqual({ ok: true })

		const zipped = createResourceAPIFixture<NovelSchema>({
			files: ["book.fb2.zip"],
			containerListings: {
				"book.fb2.zip": {
					entries: [{ path: "book.fb2", sizeBytes: 10, kind: "other" }],
				},
			},
		})
		expect(await plugin.detect(zipped.api)).toEqual({ ok: true })
	})

	it("rejects an fb2.zip that holds no fb2", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["book.fb2.zip"],
			containerListings: {
				"book.fb2.zip": {
					entries: [{ path: "readme.txt", sizeBytes: 10, kind: "other" }],
				},
			},
		})
		expect(await plugin.detect(fixture.api)).toEqual({
			ok: false,
			reasons: ["text-file"],
		})
	})

	it("returns ok for a folder of plain-text chapters", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["卷一.txt", "卷二.txt", "ch3.html"],
		})
		expect(await plugin.detect(fixture.api)).toEqual({ ok: true })
	})

	it("returns fail for empty directory", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>()
		fixture.setConfig({ files: [] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: false, reasons: ["text-file"] })
	})

	it("returns fail for directory with only images", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>()
		fixture.setConfig({ files: ["photo.jpg", "image.png"] })
		const result = await plugin.detect(fixture.api)
		expect(result).toEqual({ ok: false, reasons: ["text-file"] })
	})
})

describe("novel listFiles", () => {
	it("lists epub spine entries as virtual rows, skipping structural ones", async () => {
		const files = await plugin.listFiles?.(epubFixture().api)
		expect(files).toEqual([
			{ path: "book.epub!OEBPS/text/ch1.xhtml", kind: "epub" },
			{ path: "book.epub!OEBPS/text/ch2.xhtml", kind: "epub" },
		])
	})

	it("falls back to a scan when the container is broken", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["book.epub"],
			containerListings: {
				"book.epub": {
					entries: [
						{ path: "ch2.xhtml", sizeBytes: 1, kind: "other" },
						{ path: "ch1.xhtml", sizeBytes: 1, kind: "other" },
						{ path: "toc.xhtml", sizeBytes: 1, kind: "other" },
					],
				},
			},
		})
		const files = await plugin.listFiles?.(fixture.api)
		expect(files).toEqual([
			{ path: "book.epub!ch1.xhtml", kind: "epub" },
			{ path: "book.epub!ch2.xhtml", kind: "epub" },
		])
	})

	it("lists folder chapters in natural order with per-file kinds", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["卷一.txt", "ch10.html", "ch2.txt"],
		})
		const files = await plugin.listFiles?.(fixture.api)
		expect(files).toEqual([
			{ path: "ch2.txt", kind: "text" },
			{ path: "ch10.html", kind: "html" },
			{ path: "卷一.txt", kind: "text" },
		])
	})

	it("points docx rows at word/document.xml", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["book.docx"],
			types: { "book.docx": DOCX_TYPE },
			containerListings: {
				"book.docx": {
					entries: [
						{ path: "word/document.xml", sizeBytes: 10, kind: "other" },
						{ path: "word/styles.xml", sizeBytes: 10, kind: "other" },
					],
				},
			},
		})
		const files = await plugin.listFiles?.(fixture.api)
		expect(files).toEqual([
			{ path: "book.docx!word/document.xml", kind: "docx" },
		])
	})

	it("returns empty rows for unreadable resources", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["photo.jpg"],
		})
		expect(await plugin.listFiles?.(fixture.api)).toEqual([])
	})
})

describe("novel sourceMeta", () => {
	it("extracts epub title, author and chapter count", async () => {
		const meta = await plugin.sourceMeta?.(epubFixture().api)
		expect(meta).toEqual({ title: "Wanted", author: "Anon", chapterCount: 2 })
	})

	it("extracts fb2 metadata and section count", async () => {
		const fb2 = [
			"<FictionBook><description><title-info>",
			"<book-title>石头记</book-title>",
			"<author><first-name>曹</first-name><last-name>雪芹</last-name></author>",
			"</title-info></description>",
			"<body><section><title><p>第一章</p></title><p>x</p></section>",
			"<section><title><p>第二章</p></title><p>y</p></section></body>",
			"</FictionBook>",
		].join("")
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["book.fb2"],
			contents: { "book.fb2": fb2 },
		})
		const meta = await plugin.sourceMeta?.(fixture.api)
		expect(meta).toEqual({
			title: "石头记",
			author: "曹 雪芹",
			chapterCount: 2,
		})
	})

	it("extracts docx core metadata", async () => {
		const core =
			'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
			"<dc:title>Doc Book</dc:title><dc:creator>Doc Author</dc:creator></cp:coreProperties>"
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["book.docx"],
			types: { "book.docx": DOCX_TYPE },
			containerListings: {
				"book.docx": {
					entries: [
						{ path: "word/document.xml", sizeBytes: 10, kind: "other" },
						{ path: "docProps/core.xml", sizeBytes: 10, kind: "other" },
					],
				},
			},
			contents: { "book.docx!docProps/core.xml": core },
		})
		const meta = await plugin.sourceMeta?.(fixture.api)
		expect(meta).toEqual({ title: "Doc Book", author: "Doc Author" })
	})

	it("returns undefined for plain text resources", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["novel.txt"],
		})
		expect(await plugin.sourceMeta?.(fixture.api)).toBeUndefined()
	})
})

describe("novel searchMeta", () => {
	it("marks an epub resource with the epub facet", async () => {
		const meta = await plugin.searchMeta?.(epubFixture().api)
		expect(meta).toEqual({
			v: SEARCH_META_VERSION,
			facets: { epub: true, fb2: false, docx: false, plain: false },
		})
	})

	it("marks fb2 and fb2.zip containers with the fb2 facet", async () => {
		const plain = createResourceAPIFixture<NovelSchema>({ files: ["book.fb2"] })
		expect(await plugin.searchMeta?.(plain.api)).toEqual({
			v: SEARCH_META_VERSION,
			facets: { epub: false, fb2: true, docx: false, plain: false },
		})

		const zipped = createResourceAPIFixture<NovelSchema>({
			files: ["book.fb2.zip"],
			containerListings: {
				"book.fb2.zip": {
					entries: [{ path: "book.fb2", sizeBytes: 10, kind: "other" }],
				},
			},
		})
		expect(await plugin.searchMeta?.(zipped.api)).toEqual({
			v: SEARCH_META_VERSION,
			facets: { epub: false, fb2: true, docx: false, plain: false },
		})
	})

	it("marks text, html and chapter folders with the plain facet", async () => {
		for (const name of ["novel.txt", "notes.md", "chapter.html"]) {
			const fixture = createResourceAPIFixture<NovelSchema>({ files: [name] })
			expect(await plugin.searchMeta?.(fixture.api)).toEqual({
				v: SEARCH_META_VERSION,
				facets: { epub: false, fb2: false, docx: false, plain: true },
			})
		}
		const folder = createResourceAPIFixture<NovelSchema>({
			files: ["卷一.txt", "卷二.txt", "ch3.html"],
		})
		expect(await plugin.searchMeta?.(folder.api)).toEqual({
			v: SEARCH_META_VERSION,
			facets: { epub: false, fb2: false, docx: false, plain: true },
		})
	})

	it("marks a docx resource with the docx facet", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["book.docx"],
			types: { "book.docx": DOCX_TYPE },
		})
		expect(await plugin.searchMeta?.(fixture.api)).toEqual({
			v: SEARCH_META_VERSION,
			facets: { epub: false, fb2: false, docx: true, plain: false },
		})
	})

	it("returns undefined for unclassifiable resources", async () => {
		const fixture = createResourceAPIFixture<NovelSchema>({
			files: ["photo.jpg"],
		})
		expect(await plugin.searchMeta?.(fixture.api)).toBeUndefined()
	})
})
