/**
 * Byte → text decoding for the formats the novel reader accepts.
 * Plain-text books ship in many legacy encodings — GB18030/GBK for
 * Chinese web novels, Shift_JIS for Japanese scans, UTF-16LE for
 * Windows Notepad exports — so decoding is a first-class step, not an
 * afterthought.
 *
 * Strategy (mirrors mainstream readers like ReadEra / 静读天下):
 * a BOM wins outright, otherwise strict UTF-8 is tried first (the
 * modern default), then the CJK encodings in order of likelihood.
 * GB18030 is a full superset mapping over every byte pair, so it never
 * fails and reads any legacy Chinese file; Japanese Shift_JIS content
 * is best served by the explicit override.
 */

export type TextEncoding =
	| "auto"
	| "utf-8"
	| "utf-16le"
	| "gb18030"
	| "shift-jis"
	| "big5"

export const TEXT_ENCODING_OPTIONS: readonly TextEncoding[] = [
	"auto",
	"utf-8",
	"gb18030",
	"shift-jis",
	"big5",
	"utf-16le",
]

/** Internal superset of {@link TextEncoding} — the BOM may name BE. */
type AnyTextEncoding = TextEncoding | "utf-16be"

/** Decode `bytes` as a string, honouring the BOM when it is present. */
export function decodeText(
	bytes: Uint8Array,
	encoding: TextEncoding = "auto",
): string {
	const bom = bomOf(bytes)
	if (bom !== undefined) {
		const rest = bytes.slice(bom.byteLength)
		return stripLeadingBom(decodeWith(bom.encoding, rest))
	}
	if (encoding !== "auto") {
		return stripLeadingBom(decodeWith(encoding, bytes))
	}
	if (isLikelyUtf16(bytes)) {
		return decodeUtf16Le(bytes)
	}
	const utf8 = decodeStrictUtf8(bytes)
	if (utf8 !== undefined) return utf8
	// GB18030 decodes every byte sequence — the last resort that is
	// almost always right for legacy Chinese novels.
	return decodeWith("gb18030", bytes)
}

type BOM =
	| {
			readonly byteLength: number
			readonly encoding: AnyTextEncoding
	  }
	| undefined

function bomOf(bytes: Uint8Array): BOM {
	if (
		bytes.byteLength >= 3 &&
		bytes[0] === 0xef &&
		bytes[1] === 0xbb &&
		bytes[2] === 0xbf
	) {
		return { byteLength: 3, encoding: "utf-8" }
	}
	if (bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
		return { byteLength: 2, encoding: "utf-16le" }
	}
	if (bytes.byteLength >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		// WHATWG has no utf-16be decoder; decodeWith swaps into LE.
		return { byteLength: 2, encoding: "utf-16be" }
	}
	return undefined
}

function decodeWith(encoding: AnyTextEncoding, bytes: Uint8Array): string {
	if (encoding === "utf-16le") return decodeUtf16Le(bytes)
	if (encoding === "utf-16be") return decodeUtf16Le(swap16(bytes))
	return new TextDecoder(encoding).decode(bytes)
}

function decodeUtf16Le(bytes: Uint8Array): string {
	if (bytes.byteLength % 2 !== 0) bytes = bytes.slice(0, bytes.byteLength - 1)
	return new TextDecoder("utf-16le").decode(bytes)
}

function decodeStrictUtf8(bytes: Uint8Array): string | undefined {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
	} catch {
		return undefined
	}
}

/**
 * UTF-16 content without a BOM betrays itself: every other byte is NUL.
 * A NUL ratio above a fifth is far beyond anything GB18030 text
 * produces, so the branch is safe.
 */
function isLikelyUtf16(bytes: Uint8Array): boolean {
	if (bytes.byteLength < 16) return false
	let zeros = 0
	for (let i = 0; i < bytes.byteLength; i += 1) {
		if (bytes[i] === 0) zeros += 1
	}
	return zeros / bytes.byteLength > 0.2
}

function swap16(bytes: Uint8Array): Uint8Array {
	const swapped = new Uint8Array(bytes.byteLength)
	for (let i = 0; i + 1 < bytes.byteLength; i += 2) {
		swapped[i] = bytes[i + 1]!
		swapped[i + 1] = bytes[i]!
	}
	return swapped
}

function stripLeadingBom(text: string): string {
	return text.startsWith("\uFEFF") ? text.slice(1) : text
}
