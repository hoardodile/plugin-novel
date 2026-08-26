// @vitest-environment node

import { describe, expect, it } from "vitest"
import { decodeEntities, tokenizeMarkup } from "./markup"

function tokensOf(input: string): string[] {
	return [...tokenizeMarkup(input)].map((token) =>
		token.type === "text"
			? `text(${token.text})`
			: `${token.type}(${token.name})`,
	)
}

describe("tokenizeMarkup", () => {
	it("emits text and open/close pairs", () => {
		expect(tokensOf("<p>Hello <b>world</b>!</p>")).toEqual([
			"open(p)",
			"text(Hello )",
			"open(b)",
			"text(world)",
			"close(b)",
			"text(!)",
			"close(p)",
		])
	})

	it("handles attributes including quoted values with brackets", () => {
		const tokens = [...tokenizeMarkup(`<a href="x>y" title='z'>t</a>`)]
		expect(tokens[0]).toEqual({
			type: "open",
			name: "a",
			attrs: { href: "x>y", title: "z" },
		})
	})

	it("handles unquoted attributes and explicit self-closing", () => {
		const tokens = [...tokenizeMarkup("<br/><img src=pic.png>")]
		expect(tokens).toEqual([
			{ type: "open", name: "br", attrs: {} },
			{ type: "close", name: "br" },
			{ type: "open", name: "img", attrs: { src: "pic.png" } },
		])
	})

	it("skips comments, doctype and processing instructions", () => {
		expect(tokensOf("<!-- hi -->a<?php echo 'x' ?>b<!DOCTYPE html>c")).toEqual([
			"text(a)",
			"text(b)",
			"text(c)",
		])
	})

	it("emits CDATA as text", () => {
		expect(tokensOf("<![CDATA[raw <b> & text]]>")).toEqual([
			"text(raw <b> & text)",
		])
	})

	it("swallows raw-text element content", () => {
		expect(tokensOf("<script>if (a < b) { x = 1; }</script>body")).toEqual([
			"open(script)",
			"close(script)",
			"text(body)",
		])
	})

	it("normalises element names to lower case", () => {
		expect(tokensOf("<DIV>x</Div>")).toEqual([
			"open(div)",
			"text(x)",
			"close(div)",
		])
	})

	it("treats a lone stray < as text", () => {
		expect(tokensOf("a < b")).toEqual(["text(a )", "text(<)", "text( b)"])
	})

	it("decodes entities in text and attributes", () => {
		const tokens = [...tokenizeMarkup(`<p>a&amp;b &#65; &#x43; &mdash;</p>`)]
		expect(tokens[1]).toEqual({ type: "text", text: "a&b A C —" })
	})

	it("tolerates unclosed markup", () => {
		expect(tokensOf("<p>unclosed")).toEqual(["open(p)", "text(unclosed)"])
		expect(tokensOf("<p attr=value")).toEqual([])
	})
})

describe("decodeEntities", () => {
	it("decodes numeric references in decimal and hex", () => {
		expect(decodeEntities("&#72;&#105;&#x21;")).toBe("Hi!")
	})

	it("decodes common named references", () => {
		expect(decodeEntities("&lt;b&gt; &amp; &nbsp;")).toBe("<b> & \u00A0")
	})

	it("leaves unknown references untouched", () => {
		expect(decodeEntities("&nosuch; & #65")).toBe("&nosuch; & #65")
	})

	it("ignores oversized entity bodies", () => {
		expect(decodeEntities("&abcdefghijklmnopqrstuv;")).toBe(
			"&abcdefghijklmnopqrstuv;",
		)
	})
})
