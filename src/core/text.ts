/**
 * Marked-up format → prose, one entry per format. Every function here
 * is pure: bytes in (already decoded to a string), text units out.
 * The render layer never touches markup itself.
 */

import { tokenizeMarkup } from "./markup.ts"

/** One text unit: a named chunk of prose (a file, an epub chapter, an fb2 section). */
export type NovelUnit = {
	readonly title?: string
	readonly text: string
}

/**
 * Block-level elements that force a paragraph break around them. The
 * list is deliberately generous — a spurious break collapses in the
 * paragraph splitter, a missing one merges two paragraphs forever.
 */
const BLOCK_ELEMENTS = new Set([
	"p",
	"div",
	"section",
	"article",
	"aside",
	"header",
	"footer",
	"main",
	"nav",
	"figure",
	"figcaption",
	"blockquote",
	"pre",
	"ul",
	"ol",
	"li",
	"dl",
	"dt",
	"dd",
	"table",
	"tr",
	"td",
	"th",
	"tbody",
	"thead",
	"tfoot",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"br",
	"hr",
	"address",
	"center",
	"form",
	"fieldset",
	"details",
	"summary",
])

const HEADING_ELEMENTS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])

/** Elements whose entire subtree is non-prose (metadata, chrome). */
const SKIP_ELEMENTS = new Set([
	"head",
	"script",
	"style",
	"noscript",
	"template",
])

export type StripHtmlResult = {
	readonly text: string
	/** Text of the first heading element, when the document has one. */
	readonly firstHeading: string | undefined
}

/**
 * Strip an (x)html chapter down to prose. Paragraph boundaries become
 * `\n\n`, inline whitespace collapses, and the first heading's text is
 * reported separately so callers can name the chapter without
 * re-parsing.
 */
export function stripHtmlToText(raw: string): StripHtmlResult {
	let out = ""
	let firstHeading: string | undefined
	let skipDepth = 0
	let inHeading = false
	let headingText = ""

	for (const token of tokenizeMarkup(raw)) {
		switch (token.type) {
			case "open": {
				const { name } = token
				if (skipDepth > 0) {
					if (SKIP_ELEMENTS.has(name)) skipDepth += 1
					continue
				}
				if (SKIP_ELEMENTS.has(name)) {
					skipDepth = 1
					continue
				}
				if (BLOCK_ELEMENTS.has(name)) {
					out += "\n\n"
				}
				if (HEADING_ELEMENTS.has(name)) {
					inHeading = true
					headingText = ""
				}
				break
			}
			case "close": {
				const { name } = token
				if (skipDepth > 0) {
					if (SKIP_ELEMENTS.has(name)) skipDepth -= 1
					continue
				}
				if (HEADING_ELEMENTS.has(name)) {
					if (firstHeading === undefined) {
						firstHeading = headingText.trim()
					}
					inHeading = false
				}
				if (BLOCK_ELEMENTS.has(name)) out += "\n\n"
				break
			}
			case "text": {
				if (skipDepth > 0) continue
				const text = collapseInlineWhitespace(token.text)
				if (inHeading) {
					headingText += text
				}
				out += text
			}
		}
	}
	if (firstHeading === undefined && inHeading) {
		firstHeading = headingText.trim()
	}
	return {
		text: collapseWhitespace(out),
		firstHeading: cleanTitle(firstHeading),
	}
}

/**
 * HTML collapses whitespace between inline content; the block breaks
 * the stripper emits (`\n\n`) are the only preserved structure.
 */
function collapseInlineWhitespace(text: string): string {
	return text.replace(/\s+/g, " ")
}

/**
 * Collapse the stripper's paragraph breaks into clean segments.
 */
function collapseWhitespace(text: string): string {
	const segments = text
		.split(/\n+/)
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0)
	return segments.join("\n\n")
}

/** Title cleanup: single line, whitespace collapsed. */
function cleanTitle(title: string | undefined): string | undefined {
	if (title === undefined) return undefined
	const cleaned = title.replace(/\s+/g, " ").trim()
	return cleaned.length === 0 ? undefined : cleaned
}

/**
 * Split an fb2 document into section units. Every `<section>` becomes a
 * unit named by its `<title>` (when present), in document order; a
 * section's own paragraphs come before its nested sections' text, so a
 * flat render reads exactly like the book.
 */
export function fb2ToUnits(raw: string): readonly NovelUnit[] {
	const root = new Fb2Section()
	const stack: Fb2Section[] = [root]
	let inTitle = false
	let inParagraph = false
	let paragraphText = ""

	function finalizeParagraph(): void {
		if (!inParagraph) return
		inParagraph = false
		const current = stack[stack.length - 1]
		if (current === undefined) return
		const text = paragraphText.replace(/\s+/g, " ").trim()
		paragraphText = ""
		if (text.length > 0) current.paragraphs.push(text)
	}

	for (const token of tokenizeMarkup(raw)) {
		switch (token.type) {
			case "open": {
				const { name } = token
				if (name === "section") {
					finalizeParagraph()
					const section = new Fb2Section()
					const parent = stack[stack.length - 1]
					if (parent !== undefined) parent.children.push(section)
					stack.push(section)
				} else if (name === "title") {
					finalizeParagraph()
					inTitle = true
				} else if (name === "p" || name === "v" || name === "subtitle") {
					if (inTitle) break
					finalizeParagraph()
					inParagraph = true
				} else if (
					name === "poem" ||
					name === "stanza" ||
					name === "empty-line"
				) {
					if (!inTitle) finalizeParagraph()
				} else if (name === "image") {
					// Inline illustration — no prose.
					if (!inTitle) finalizeParagraph()
				}
				break
			}
			case "close": {
				const { name } = token
				if (name === "section") {
					finalizeParagraph()
					stack.pop()
				} else if (name === "title") {
					inTitle = false
				} else if (name === "p" || name === "v" || name === "subtitle") {
					if (!inTitle) finalizeParagraph()
				} else if (name === "poem" || name === "stanza") {
					if (!inTitle) finalizeParagraph()
				} else if (name === "empty-line") {
					if (!inTitle) finalizeParagraph()
				}
				break
			}
			case "text": {
				const current = stack[stack.length - 1]
				if (current === undefined) continue
				if (inTitle) {
					current.title += token.text
				} else if (inParagraph) {
					paragraphText += token.text
				}
			}
		}
	}
	finalizeParagraph()
	return flattenSections(root)
}

class Fb2Section {
	title = ""
	paragraphs: string[] = []
	children: Fb2Section[] = []

	/** Prose of this section: its title (inline in the flow), then its paragraphs. */
	ownText(): string {
		const parts = [...this.paragraphs]
		if (this.title !== "") parts.unshift(this.title.trim())
		return parts.join("\n\n")
	}
}

/**
 * Flatten the section tree into units in document order. Every section
 * becomes a unit — a nested `<section>` is a sub-chapter, and novels
 * are typically laid out volume > chapter, so both levels belong in the
 * table of contents. The root carries body-level prose only.
 */
function flattenSections(root: Fb2Section): readonly NovelUnit[] {
	const units: NovelUnit[] = []
	const rootText = root.ownText()
	if (rootText !== "") units.push({ text: rootText })
	function walk(section: Fb2Section): void {
		for (const child of section.children) {
			units.push({
				title: cleanTitle(child.title.trim() === "" ? undefined : child.title),
				text: child.ownText(),
			})
			walk(child)
		}
	}
	walk(root)
	return units
}

/**
 * Extract the prose of a docx `word/document.xml`: text of every `w:t`,
 * paragraph break at every `w:p` boundary.
 */
export function docxToText(raw: string): string {
	const out: string[] = []
	let paragraph: string[] = []
	let inText = false

	function finalizeParagraph(): void {
		const text = paragraph.join("").replace(/\s+/g, " ").trim()
		paragraph = []
		if (text.length > 0) out.push(text)
	}

	for (const token of tokenizeMarkup(raw)) {
		switch (token.type) {
			case "open": {
				const { name } = token
				if (name === "t") inText = true
				else if (name === "tab") paragraph.push("\t")
				else if (name === "br") finalizeParagraph()
				break
			}
			case "close": {
				const { name } = token
				if (name === "t") inText = false
				else if (name === "p") finalizeParagraph()
				break
			}
			case "text": {
				if (inText) paragraph.push(token.text)
			}
		}
	}
	finalizeParagraph()
	return out.join("\n\n")
}

/** Extract the book title/author from a docx `docProps/core.xml`. */
export function docxMetadata(raw: string): {
	readonly title?: string
	readonly author?: string
} {
	return dcMetadata(raw)
}

/** Extract dc:title / dc:creator from OPF or core.xml metadata. */
export function dcMetadata(raw: string): {
	readonly title?: string
	readonly author?: string
} {
	let title: string | undefined
	let author: string | undefined
	let inTitle = false
	let inCreator = false
	let text = ""
	let depth = 0

	function settle(): void {
		const cleaned = text.replace(/\s+/g, " ").trim()
		if (inTitle && title === undefined && cleaned !== "") title = cleaned
		if (inCreator && author === undefined && cleaned !== "") author = cleaned
		inTitle = false
		inCreator = false
		text = ""
	}

	for (const token of tokenizeMarkup(raw)) {
		switch (token.type) {
			case "open": {
				const { name } = token
				if (name === "title") inTitle = true
				else if (name === "creator") inCreator = true
				if (inTitle || inCreator) depth += 1
				break
			}
			case "close": {
				const { name } = token
				if (inTitle || inCreator) {
					depth -= 1
					if (depth <= 0) settle()
				} else if (name === "title" || name === "creator") {
					settle()
				}
				break
			}
			case "text":
				if (inTitle || inCreator) text += token.text
		}
	}
	settle()
	return { title, author }
}

/**
 * Extract the book metadata of an fb2 file (`<title-info>`): book title
 * and author name.
 */
export function fb2Metadata(raw: string): {
	readonly title?: string
	readonly author?: string
} {
	let title: string | undefined
	let author: string | undefined
	let inTitleInfo = false
	let inBookTitle = false
	let inFirstName = false
	let inLastName = false
	let text = ""
	let firstName = ""
	let lastName = ""

	function settleTitle(): void {
		const cleaned = text.replace(/\s+/g, " ").trim()
		if (inBookTitle && title === undefined && cleaned !== "") title = cleaned
		text = ""
	}

	function settleName(): void {
		const cleaned = text.replace(/\s+/g, " ").trim()
		if (inFirstName) firstName = cleaned
		else if (inLastName) lastName = cleaned
		text = ""
	}

	function finishAuthor(): void {
		if (author === undefined && (firstName !== "" || lastName !== "")) {
			author = [firstName, lastName].filter((part) => part !== "").join(" ")
		}
		firstName = ""
		lastName = ""
	}

	for (const token of tokenizeMarkup(raw)) {
		switch (token.type) {
			case "open": {
				const { name } = token
				if (!inTitleInfo) {
					if (name === "title-info") inTitleInfo = true
					continue
				}
				if (name === "book-title") inBookTitle = true
				else if (name === "first-name") inFirstName = true
				else if (name === "last-name") inLastName = true
				break
			}
			case "close": {
				const { name } = token
				if (!inTitleInfo) continue
				if (name === "book-title") {
					settleTitle()
					inBookTitle = false
				} else if (name === "first-name") {
					settleName()
					inFirstName = false
				} else if (name === "last-name") {
					settleName()
					inLastName = false
				} else if (name === "author") {
					finishAuthor()
				} else if (name === "title-info") {
					finishAuthor()
					inTitleInfo = false
				}
				break
			}
			case "text":
				if (inTitleInfo && (inBookTitle || inFirstName || inLastName)) {
					text += token.text
				}
		}
	}
	return { title, author }
}
