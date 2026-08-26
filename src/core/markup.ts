/**
 * Tolerant markup tokenizer shared by every marked-up format the novel
 * reader accepts (xhtml chapters, docx `document.xml`, fb2, OPF
 * metadata). It is deliberately not a validating parser: real-world
 * books carry unclosed tags, unquoted attributes and stray `>`s, and
 * the reader only needs the *text* — so the tokenizer walks a single
 * pass, decodes entities, and hands structured tokens to per-format
 * consumers.
 *
 * XML namespaces are ignored (names match on their local part, so
 * `w:t` and `t` are the same element) — every target format uses fixed
 * prefixes in practice.
 *
 * Raw-text elements (`script`, `style`, ...) are emitted as open/close
 * with no inner text: their content is not prose and may contain
 * anything, including `<` that would otherwise derail the scan.
 */

export type MarkupOpenToken = {
	readonly type: "open"
	readonly name: string
	readonly attrs: Readonly<Record<string, string>>
}

export type MarkupCloseToken = {
	readonly type: "close"
	readonly name: string
}

export type MarkupTextToken = {
	readonly type: "text"
	readonly text: string
}

export type MarkupToken = MarkupOpenToken | MarkupCloseToken | MarkupTextToken

/** Local (namespace-stripped) element names whose content is never prose. */
const RAW_TEXT_ELEMENTS = new Set([
	"script",
	"style",
	"noscript",
	"template",
	"binary",
])

const NAME_START = /[A-Za-z_]/i
const NAME_CHAR = /[A-Za-z0-9_.:-]/

export function* tokenizeMarkup(input: string): Generator<MarkupToken> {
	let i = 0
	for (;;) {
		const open = input.indexOf("<", i)
		if (open === -1) {
			const tail = input.slice(i)
			if (tail.length > 0) yield textToken(tail)
			return
		}
		if (open > i) yield textToken(input.slice(i, open))
		i = open
		const next = input[i + 1]
		if (next === "!") {
			if (input.startsWith("<!--", i)) {
				const end = input.indexOf("-->", i + 4)
				i = end === -1 ? input.length : end + 3
			} else if (input.startsWith("<![CDATA[", i)) {
				const end = input.indexOf("]]>", i + 9)
				if (end === -1) {
					yield textToken(input.slice(i + 9))
					return
				}
				yield textToken(input.slice(i + 9, end))
				i = end + 3
			} else {
				const end = input.indexOf(">", i + 1)
				i = end === -1 ? input.length : end + 1
			}
			continue
		}
		if (next === "?") {
			const end = input.indexOf("?>", i + 2)
			i = end === -1 ? input.length : end + 2
			continue
		}
		if (next === "/") {
			const name = readName(input, i + 2)
			if (name === undefined) {
				i += 1
				continue
			}
			const end = input.indexOf(">", i)
			if (end === -1) return
			yield { type: "close", name: localName(name.toLowerCase()) }
			i = end + 1
			continue
		}
		if (next === undefined) return
		const name = readName(input, i + 1)
		if (name === undefined) {
			// A lone ` < ` in prose, not markup — emit it as text.
			yield textToken("<")
			i += 1
			continue
		}
		const { end, attrs, selfClosing } = readTagTail(input, i + 1 + name.length)
		if (end === -1) return
		const lower = localName(name.toLowerCase())
		if (RAW_TEXT_ELEMENTS.has(lower)) {
			const close = findRawClose(input, end + 1, lower)
			if (close === -1) return
			yield { type: "open", name: lower, attrs }
			yield { type: "close", name: lower }
			// `</name>` — one for `<`, one for `/`, one for `>`.
			i = close + lower.length + 3
			continue
		}
		yield { type: "open", name: lower, attrs }
		if (selfClosing) yield { type: "close", name: lower }
		i = end + 1
	}
}

function readName(input: string, start: number): string | undefined {
	const first = input[start]
	if (first === undefined || !NAME_START.test(first)) return undefined
	let end = start + 1
	while (end < input.length && NAME_CHAR.test(input[end]!)) end += 1
	return input.slice(start, end)
}

/**
 * Namespace prefixes are producer-specific (`w:p` in one docx,
 * `ns0:p` in another), so consumers match on the local part only.
 */
function localName(name: string): string {
	const colon = name.lastIndexOf(":")
	return colon === -1 ? name : name.slice(colon + 1)
}

/**
 * Parse the tail of a tag — attributes, `>` or `/>` terminator.
 * Returns the index of the `>` (or -1 when unterminated), the attribute
 * table and whether the tag is self-closing.
 */
function readTagTail(
	input: string,
	start: number,
): {
	readonly end: number
	readonly attrs: Record<string, string>
	readonly selfClosing: boolean
} {
	const attrs: Record<string, string> = {}
	let i = start
	const selfClosing = false
	for (;;) {
		while (i < input.length && /\s/.test(input[i]!)) i += 1
		if (i >= input.length) return { end: -1, attrs, selfClosing }
		const c = input[i]!
		if (c === ">") return { end: i, attrs, selfClosing }
		if (c === "/") {
			// `/` only counts when it terminates the tag.
			let j = i + 1
			while (j < input.length && /\s/.test(input[j]!)) j += 1
			if (input[j] === ">") return { end: j, attrs, selfClosing: true }
			i += 1
			continue
		}
		const nameEnd = readName(input, i)
		if (nameEnd === undefined) {
			// Attribute-less garbage; skip one char and keep scanning.
			i += 1
			continue
		}
		const name = nameEnd.toLowerCase()
		i += nameEnd.length
		while (i < input.length && /\s/.test(input[i]!)) i += 1
		if (input[i] !== "=") {
			attrs[name] = ""
			continue
		}
		i += 1
		while (i < input.length && /\s/.test(input[i]!)) i += 1
		const quote = input[i]
		if (quote === '"' || quote === "'") {
			const end = input.indexOf(quote, i + 1)
			if (end === -1) return { end: -1, attrs, selfClosing }
			attrs[name] = decodeEntities(input.slice(i + 1, end))
			i = end + 1
		} else {
			const valueStart = i
			while (i < input.length && !/[\s>]/.test(input[i]!)) {
				i += 1
			}
			attrs[name] = decodeEntities(input.slice(valueStart, i))
		}
	}
}

/** Locate the closing tag of a raw-text element, or -1. */
function findRawClose(input: string, from: number, name: string): number {
	const needle = `</${name}`
	for (;;) {
		const hit = input.toLowerCase().indexOf(needle, from)
		if (hit === -1) return -1
		const after = input[hit + needle.length]
		if (after === ">" || /\s/.test(after ?? "")) return hit
		from = hit + needle.length
	}
}

function textToken(text: string): MarkupTextToken {
	return { type: "text", text: decodeEntities(text) }
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: "\u00A0",
	ensp: "\u2002",
	emsp: "\u2003",
	thinsp: "\u2009",
	shy: "\u00AD",
	mdash: "\u2014",
	ndash: "\u2013",
	hellip: "\u2026",
	lsquo: "\u2018",
	rsquo: "\u2019",
	ldquo: "\u201C",
	rdquo: "\u201D",
	laquo: "\u00AB",
	raquo: "\u00BB",
	copy: "\u00A9",
	reg: "\u00AE",
	trade: "\u2122",
	times: "\u00D7",
	divide: "\u00F7",
	middot: "\u00B7",
	bullet: "\u2022",
	plusmn: "\u00B1",
	sect: "\u00A7",
	para: "\u00B6",
	deg: "\u00B0",
	micro: "\u00B5",
	frac14: "\u00BC",
	frac12: "\u00BD",
	frac34: "\u00BE",
	sup2: "\u00B2",
	sup3: "\u00B3",
	sup1: "\u00B9",
	cent: "\u00A2",
	pound: "\u00A3",
	euro: "\u20AC",
	yen: "\u00A5",
	curren: "\u00A4",
	dagger: "\u2020",
	Dagger: "\u2021",
	permil: "\u2030",
	prime: "\u2032",
	Prime: "\u2033",
	infin: "\u221E",
	radic: "\u221A",
	le: "\u2264",
	ge: "\u2265",
	ne: "\u2260",
	equiv: "\u2261",
	asymp: "\u2248",
	part: "\u2202",
	sum: "\u2211",
	prod: "\u220F",
	int: "\u222B",
}

const MAX_ENTITY_NAME = 16

/** Decode numeric and the common named character references. */
export function decodeEntities(text: string): string {
	const amp = text.indexOf("&")
	if (amp === -1) return text
	let out = ""
	let i = 0
	for (;;) {
		const hit = text.indexOf("&", i)
		if (hit === -1) {
			out += text.slice(i)
			return out
		}
		out += text.slice(i, hit)
		const semi = text.indexOf(";", hit + 1)
		if (semi === -1 || semi - hit - 1 > MAX_ENTITY_NAME) {
			out += "&"
			i = hit + 1
			continue
		}
		const body = text.slice(hit + 1, semi)
		const decoded = decodeEntity(body)
		if (decoded === undefined) {
			out += "&"
			i = hit + 1
			continue
		}
		out += decoded
		i = semi + 1
	}
}

function decodeEntity(body: string): string | undefined {
	if (body.startsWith("#x") || body.startsWith("#X")) {
		return codePointToChar(parseInt(body.slice(2), 16))
	}
	if (body.startsWith("#")) {
		return codePointToChar(parseInt(body.slice(1), 10))
	}
	return NAMED_ENTITIES[body]
}

function codePointToChar(code: number): string | undefined {
	if (Number.isNaN(code) || code < 0 || code > 0x10ffff) return undefined
	return String.fromCodePoint(code)
}
