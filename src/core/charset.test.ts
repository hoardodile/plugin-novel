// @vitest-environment node

import iconv from "iconv-lite"
import { describe, expect, it } from "vitest"
import { decodeText } from "./charset"

function bytesOf(input: string | Uint8Array): Uint8Array {
	if (typeof input === "string") return new TextEncoder().encode(input)
	return input
}

function utf16Le(input: string): Uint8Array {
	const codeUnits = new Array<number>(input.length * 2)
	for (let i = 0; i < input.length; i += 1) {
		const code = input.charCodeAt(i)
		codeUnits[i * 2] = code & 0xff
		codeUnits[i * 2 + 1] = (code >> 8) & 0xff
	}
	return new Uint8Array(codeUnits)
}

describe("decodeText — BOM", () => {
	it("decodes a UTF-8 BOM and strips it", () => {
		const raw = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x62])
		expect(decodeText(raw)).toBe("ab")
	})

	it("decodes UTF-16LE with BOM", () => {
		const raw = new Uint8Array([0xff, 0xfe, ...utf16Le("你好")])
		expect(decodeText(raw)).toBe("你好")
	})

	it("decodes UTF-16BE with BOM by byte-swapping", () => {
		const le = utf16Le("test")
		const be = new Uint8Array(le.length)
		for (let i = 0; i < le.length; i += 2) {
			be[i] = le[i + 1]!
			be[i + 1] = le[i]!
		}
		const raw = new Uint8Array([0xfe, 0xff, ...be])
		expect(decodeText(raw)).toBe("test")
	})
})

describe("decodeText — auto", () => {
	it("prefers UTF-8 when valid", () => {
		expect(decodeText(bytesOf("plain ascii"))).toBe("plain ascii")
		expect(decodeText(bytesOf("中文 UTF-8"))).toBe("中文 UTF-8")
	})

	it("falls back to GB18030 for legacy Chinese bytes", () => {
		// "第一章" in GBK: 0xB5 DA D2 BB D5 C2
		const gbk = new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2])
		expect(decodeText(gbk)).toBe("第一章")
	})

	it("detects UTF-16LE without BOM via the NUL-ratio heuristic", () => {
		expect(decodeText(utf16Le("Windows notepad"))).toBe("Windows notepad")
	})

	it("decodes UTF-16LE explicitly even when the heuristic would not", () => {
		const bytes = utf16Le("x")
		expect(decodeText(bytes, "utf-16le")).toBe("x")
	})
})

describe("decodeText — explicit encodings", () => {
	it("decodes Shift_JIS with the override", () => {
		const sjis = new Uint8Array(iconv.encode("吾輩は猫である", "shiftjis"))
		expect(decodeText(sjis, "shift-jis")).toBe("吾輩は猫である")
	})

	it("decodes Big5 with the override", () => {
		const big5 = new Uint8Array(iconv.encode("武俠", "big5"))
		expect(decodeText(big5, "big5")).toBe("武俠")
	})
})
