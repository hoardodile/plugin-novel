// @vitest-environment node

import { describe, expect, it } from "vitest"
import {
	docxMetadata,
	docxToText,
	fb2Metadata,
	fb2ToUnits,
	stripHtmlToText,
} from "./text"

describe("stripHtmlToText", () => {
	it("extracts prose and reports the first heading", () => {
		const { text, firstHeading } = stripHtmlToText(
			"<html><head><title>ignored</title></head>" +
				"<body><h1>Chapter One</h1><p>First <em>para</em>.</p>" +
				"<p>Second.</p><script>var x = 1;</script><p>Third.</p></body></html>",
		)
		expect(firstHeading).toBe("Chapter One")
		expect(text).toBe("Chapter One\n\nFirst para.\n\nSecond.\n\nThird.")
	})

	it("turns block boundaries into paragraphs", () => {
		const { text } = stripHtmlToText(
			"<div><h2>Part</h2><br>line<br>line2<ul><li>one</li><li>two</li></ul></div>",
		)
		expect(text.split("\n\n")).toEqual(["Part", "line", "line2", "one", "two"])
	})

	it("collapses inline whitespace", () => {
		const { text } = stripHtmlToText("<p>a\n  b\tc</p><p> d </p>")
		expect(text).toBe("a b c\n\nd")
	})

	it("decodes entities and drops images", () => {
		const { text } = stripHtmlToText(
			"<p>a &amp; b &#8212; c</p><img src='x'><p>d</p>",
		)
		expect(text).toBe("a & b — c\n\nd")
	})

	it("captures headings that contain block-level children", () => {
		const { text, firstHeading } = stripHtmlToText(
			"<h1><i>PRIDE.</i><br> and <b>PREJUDICE.</b></h1><p>body</p>",
		)
		expect(firstHeading).toBe("PRIDE. and PREJUDICE.")
		expect(text.split("\n\n")[0]).toContain("PRIDE.")
	})

	it("reports no heading when there is none", () => {
		const { text, firstHeading } = stripHtmlToText("<p>plain</p>")
		expect(text).toBe("plain")
		expect(firstHeading).toBeUndefined()
	})
})

describe("fb2ToUnits", () => {
	const SAMPLE = [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">',
		"<description><title-info><book-title>Test Book</book-title>",
		"<author><first-name>Jane</first-name><last-name>Doe</last-name></author>",
		"</title-info></description>",
		"<body><section><title><p>第一章 起</p></title>",
		"<p>正文甲</p><p>正文乙</p>",
		"<section><title><p>第一节</p></title><p>嵌套正文</p></section>",
		"</section><section><title><p>第二章</p></title><p>更多</p></section>",
		"</body></FictionBook>",
	].join("")

	it("splits sections into titled units in document order", () => {
		const units = fb2ToUnits(SAMPLE)
		expect(units.map((u) => u.title)).toEqual(["第一章 起", "第一节", "第二章"])
		expect(units[0]!.text.split("\n\n")).toEqual([
			"第一章 起",
			"正文甲",
			"正文乙",
		])
		expect(units[1]!.text).toBe("第一节\n\n嵌套正文")
		expect(units[2]!.text).toBe("第二章\n\n更多")
	})

	it("keeps nested section titles inside parent prose", () => {
		const units = fb2ToUnits(SAMPLE)
		// Parent unit prose excludes the nested unit's text; the nested
		// unit follows it in the stream.
		expect(units[0]!.text).not.toContain("嵌套正文")
	})

	it("extracts metadata from title-info", () => {
		expect(fb2Metadata(SAMPLE)).toEqual({
			title: "Test Book",
			author: "Jane Doe",
		})
	})
})

describe("docxToText", () => {
	const SAMPLE = [
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
		'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
		'<w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p>',
		"<w:p><w:r><w:t>Second &amp; third</w:t></w:r></w:p>",
		"<w:sectPr/></w:body></w:document>",
	].join("")

	it("joins runs into paragraphs", () => {
		expect(docxToText(SAMPLE)).toBe("Hello world\n\nSecond & third")
	})

	it("extracts dc metadata from core.xml", () => {
		const core =
			'<cp:coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/">' +
			"<dc:title>My Book</dc:title><dc:creator>Author Name</dc:creator></cp:coreProperties>"
		expect(docxMetadata(core)).toEqual({
			title: "My Book",
			author: "Author Name",
		})
	})
})
