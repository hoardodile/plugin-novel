// @vitest-environment node

import { describe, expect, it } from "vitest"
import {
	epubContainerOpfPath,
	isStructuralEpubEntry,
	normalizeZipPath,
	parseEpubOpf,
	resolveEpubHref,
} from "./epub"

describe("epubContainerOpfPath", () => {
	it("reads the rootfile full-path", () => {
		const xml =
			'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
			'<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>' +
			"</rootfiles></container>"
		expect(epubContainerOpfPath(xml)).toBe("OEBPS/content.opf")
	})

	it("returns undefined without a rootfile", () => {
		expect(epubContainerOpfPath("<container/>")).toBeUndefined()
	})
})

describe("parseEpubOpf", () => {
	const OPF = [
		'<?xml version="1.0"?>',
		'<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId">',
		'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
		"<dc:title>Pride and Prejudice</dc:title><dc:creator>Jane Austen</dc:creator>",
		"</metadata>",
		'<manifest><item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>',
		'<item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/></manifest>',
		'<spine toc="ncx"><itemref idref="ch2"/><itemref idref="ch1"/></spine>',
		"</package>",
	].join("")

	it("resolves spine order against the manifest", () => {
		const { spineHrefs } = parseEpubOpf(OPF)
		expect(spineHrefs).toEqual(["text/ch2.xhtml", "text/ch1.xhtml"])
	})

	it("extracts dc metadata", () => {
		const { title, author } = parseEpubOpf(OPF)
		expect(title).toBe("Pride and Prejudice")
		expect(author).toBe("Jane Austen")
	})

	it("tolerates a manifest that follows the spine", () => {
		const reversed = [
			'<package xmlns="http://www.idpf.org/2007/opf">',
			'<spine><itemref idref="a"/></spine>',
			'<manifest><item id="a" href="a.xhtml"/></manifest>',
			"</package>",
		].join("")
		expect(parseEpubOpf(reversed).spineHrefs).toEqual(["a.xhtml"])
	})
})

describe("resolveEpubHref / normalizeZipPath", () => {
	it("joins relative to the opf directory", () => {
		expect(resolveEpubHref("OEBPS/text", "ch1.xhtml")).toBe(
			"OEBPS/text/ch1.xhtml",
		)
	})

	it("resolves parent segments", () => {
		expect(resolveEpubHref("OEBPS/text", "../Styles/style.css")).toBe(
			"OEBPS/Styles/style.css",
		)
		expect(resolveEpubHref("", "ch1.xhtml")).toBe("ch1.xhtml")
	})

	it("normalizes stray separators", () => {
		expect(normalizeZipPath("./a//b/./c")).toBe("a/b/c")
	})
})

describe("isStructuralEpubEntry", () => {
	it("flags covers, toc and title pages", () => {
		expect(isStructuralEpubEntry("cover.xhtml")).toBe(true)
		expect(isStructuralEpubEntry("COVER.HTML")).toBe(true)
		expect(isStructuralEpubEntry("toc.xhtml")).toBe(true)
		expect(isStructuralEpubEntry("nav.xhtml")).toBe(true)
		expect(isStructuralEpubEntry("titlepage.xhtml")).toBe(true)
		expect(isStructuralEpubEntry("cover-page.xhtml")).toBe(true)
		expect(isStructuralEpubEntry("wrap0000.html")).toBe(true)
		expect(isStructuralEpubEntry("wrap0007.html")).toBe(true)
	})

	it("keeps real chapters and non-html entries", () => {
		expect(isStructuralEpubEntry("ch1.xhtml")).toBe(false)
		expect(isStructuralEpubEntry("cover.jpg")).toBe(false)
		expect(isStructuralEpubEntry("chapter-cover.xhtml")).toBe(false)
	})
})
