import { describe, expect, it } from "vitest"
import {
	decodeNovelSettings,
	deriveCustomTheme,
	NOVEL_SETTINGS_DEFAULT,
	PALETTE_TOKENS,
	THEME_PALETTES,
} from "./prefs"

describe("novel settings v3", () => {
	it("round-trips the defaults through the codec", () => {
		expect(decodeNovelSettings(JSON.stringify(NOVEL_SETTINGS_DEFAULT))).toEqual(
			NOVEL_SETTINGS_DEFAULT,
		)
	})

	it("defaults the theme to parchment", () => {
		expect(NOVEL_SETTINGS_DEFAULT.theme).toEqual({
			kind: "palette",
			palette: "parchment",
		})
	})

	it("defaults to paged (page-number) mode with the doc serif", () => {
		expect(NOVEL_SETTINGS_DEFAULT.readingMode).toBe("paged")
		expect(NOVEL_SETTINGS_DEFAULT.fontRole).toBe("doc")
	})

	it("migrates a v1 record to v3", () => {
		const stored = {
			v: 1,
			fontSize: 20,
			lineHeight: 2,
			letterSpacing: 0.1,
			chapterRegex: "第[\\d]+章",
		}
		const decoded = decodeNovelSettings(JSON.stringify(stored))
		expect(decoded).toMatchObject({
			v: 3,
			fontSize: 20,
			lineHeight: 2,
			letterSpacing: 0.1,
			theme: { kind: "palette", palette: "parchment" },
			readingMode: "paged",
			fontRole: "doc",
			readingWidth: 680,
		})
	})

	it("migrates a v2 record to v3, dropping the hardcoded background", () => {
		const stored = {
			v: 2,
			fontSize: 18,
			lineHeight: 1.8,
			letterSpacing: 0,
			bgKind: "color",
			bgColor: "#cce8cf",
			chapterRegex: "",
			encoding: "gb18030",
		}
		const decoded = decodeNovelSettings(JSON.stringify(stored))
		expect(decoded).toMatchObject({
			v: 3,
			theme: { kind: "palette", palette: "parchment" },
			readingMode: "paged",
			encoding: "gb18030",
		})
		expect(decoded).not.toHaveProperty("bgColor")
		expect(decoded).not.toHaveProperty("bgKind")
	})

	it("accepts a stored custom theme", () => {
		const decoded = decodeNovelSettings(
			JSON.stringify({
				v: 3,
				fontSize: 18,
				lineHeight: 1.8,
				letterSpacing: 0,
				theme: { kind: "custom", bg: "#101010", fg: "#f0f0f0" },
				readingMode: "scroll",
				fontRole: "sans",
				readingWidth: 800,
				chapterRegex: "",
				encoding: "auto",
			}),
		)
		expect(decoded).toMatchObject({
			v: 3,
			theme: { kind: "custom", bg: "#101010", fg: "#f0f0f0" },
			readingMode: "scroll",
			fontRole: "sans",
			readingWidth: 800,
		})
	})

	it("rejects a malformed theme", () => {
		const decoded = decodeNovelSettings(
			JSON.stringify({
				v: 3,
				fontSize: 18,
				lineHeight: 1.8,
				letterSpacing: 0,
				theme: { kind: "weird" },
				readingMode: "paged",
				fontRole: "doc",
				readingWidth: 680,
				chapterRegex: "",
				encoding: "auto",
			}),
		)
		expect(decoded).toBeUndefined()
	})
})

describe("palette tokens", () => {
	it("covers every registered palette with light + dark variants", () => {
		for (const name of THEME_PALETTES) {
			const pal = PALETTE_TOKENS[name]
			expect(pal, `${name} light`).toBeDefined()
			expect(Object.keys(pal.light).length).toBeGreaterThan(0)
			expect(Object.keys(pal.dark).length).toBeGreaterThan(0)
			expect(pal.light["--background"], `${name} bg`).toBeDefined()
			expect(pal.dark["--background"], `${name} dark bg`).toBeDefined()
		}
	})
})

describe("deriveCustomTheme", () => {
	it("sets the canvas and ink from the chosen pair", () => {
		const tokens = deriveCustomTheme("#101010", "#f0f0f0")
		expect(tokens["--background"]).toBe("#101010")
		expect(tokens["--foreground"]).toBe("#f0f0f0")
		expect(tokens["--card"]).not.toBe("#101010")
		expect(tokens["--border"]).not.toBe("#101010")
	})

	it("derives a coherent token set (primary follows the ink)", () => {
		const tokens = deriveCustomTheme("#f4ecd8", "#3a2f1f")
		expect(tokens["--primary"]).toBe("#3a2f1f")
		expect(tokens["--primary-foreground"]).toBe("#f4ecd8")
		expect(tokens["--muted-foreground"]).toMatch(/^#[0-9a-f]{6}$/i)
	})
})
