import type { Codec } from "@hoardodile/sdk-web"
import type { TextEncoding } from "./core/charset"

const SETTINGS_VERSION = 3 as const
const POSITION_VERSION = 2 as const

/**
 * Reader theme preference. Mirrors the hoardodile documentation page's
 * theme model (`inherit` plus the registered palettes, defaulting to
 * `parchment`) extended with a self-selected background/foreground pair.
 *
 * - `inherit` — follow the host app's palette + resolved mode (no local
 *   override; the SDK's `theme-<palette>` class on `<html>` stands).
 * - `palette` — apply one registered palette locally (light or dark
 *   variant per the host's resolved mode) via `useReaderTheme`.
 * - `custom` — apply a user-chosen background/foreground pair; the rest
 *   of the token set is derived from those two colours.
 */
export type NovelTheme = {
	readonly kind: "inherit" | "palette" | "custom"
	/** Palette id when `kind === "palette"` (e.g. `"parchment"`). */
	readonly palette?: string
	/** Background colour when `kind === "custom"`. */
	readonly bg?: string
	/** Foreground colour when `kind === "custom"`. */
	readonly fg?: string
}

export type NovelReadingMode = "paged" | "scroll"

export type NovelFontRole = "doc" | "sans"

export type NovelSettings = {
	readonly v: typeof SETTINGS_VERSION
	readonly fontSize: number
	readonly lineHeight: number
	readonly letterSpacing: number
	readonly theme: NovelTheme
	readonly readingMode: NovelReadingMode
	readonly fontRole: NovelFontRole
	/** Reading-column width (px) in scroll mode — 680 or 800. */
	readonly readingWidth: number
	readonly chapterRegex: string
	/**
	 * Text encoding for non-UTF-8 books. `"auto"` prefers UTF-8 then
	 * GB18030; the explicit options rescue legacy Japanese/Windows
	 * files. Only `"auto"` appears in the settings sheet.
	 */
	readonly encoding: TextEncoding
}

/**
 * Persisted reading position. `v:2` adds `fraction` ∈ [0,1] for
 * sub-paragraph precision so long paragraphs that span multiple pages
 * restore to roughly the same text after a window resize / font change.
 */
export type NovelPosition = {
	readonly v: typeof POSITION_VERSION
	readonly filename: string
	readonly paragraphIndex: number
	readonly fraction: number
	readonly updatedAtMs: number
}

export const NOVEL_SETTINGS_KEY = "settings"

/** The reader theme the docs page also defaults to. */
export const NOVEL_DEFAULT_PALETTE = "parchment" as const

export const DEFAULT_THEME: NovelTheme = {
	kind: "palette",
	palette: NOVEL_DEFAULT_PALETTE,
}

export const NOVEL_SETTINGS_DEFAULT: NovelSettings = {
	v: SETTINGS_VERSION,
	fontSize: 18,
	lineHeight: 1.8,
	letterSpacing: 0,
	theme: DEFAULT_THEME,
	readingMode: "paged",
	fontRole: "doc",
	readingWidth: 680,
	chapterRegex: "",
	encoding: "auto",
}

export function encodeNovelSettings(value: NovelSettings): string {
	return JSON.stringify(value)
}

/**
 * Decode persisted settings. v1 and v2 settings migrate to v3 by
 * defaulting the new theme preference to parchment (v2's hardcoded
 * background colour is dropped) and setting the reading-mode/font-role
 * defaults; anything else unknown is rejected.
 */
export function decodeNovelSettings(raw: string): NovelSettings | undefined {
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>
		if (parsed.v === 1) {
			return {
				v: SETTINGS_VERSION,
				fontSize: num(parsed.fontSize, NOVEL_SETTINGS_DEFAULT.fontSize),
				lineHeight: num(parsed.lineHeight, NOVEL_SETTINGS_DEFAULT.lineHeight),
				letterSpacing: num(
					parsed.letterSpacing,
					NOVEL_SETTINGS_DEFAULT.letterSpacing,
				),
				theme: DEFAULT_THEME,
				readingMode: "paged",
				fontRole: "doc",
				readingWidth: NOVEL_SETTINGS_DEFAULT.readingWidth,
				chapterRegex: str(parsed.chapterRegex, ""),
				encoding: "auto",
			}
		}
		if (parsed.v === 2) {
			return {
				v: SETTINGS_VERSION,
				fontSize: num(parsed.fontSize, NOVEL_SETTINGS_DEFAULT.fontSize),
				lineHeight: num(parsed.lineHeight, NOVEL_SETTINGS_DEFAULT.lineHeight),
				letterSpacing: num(
					parsed.letterSpacing,
					NOVEL_SETTINGS_DEFAULT.letterSpacing,
				),
				theme: DEFAULT_THEME,
				readingMode: "paged",
				fontRole: "doc",
				readingWidth: NOVEL_SETTINGS_DEFAULT.readingWidth,
				chapterRegex: str(parsed.chapterRegex, ""),
				encoding: str(parsed.encoding, "auto") as TextEncoding,
			}
		}
		if (parsed.v !== SETTINGS_VERSION) return undefined
		const theme = normalizeTheme(parsed.theme)
		if (theme === undefined) return undefined
		return {
			v: SETTINGS_VERSION,
			fontSize: num(parsed.fontSize, NOVEL_SETTINGS_DEFAULT.fontSize),
			lineHeight: num(parsed.lineHeight, NOVEL_SETTINGS_DEFAULT.lineHeight),
			letterSpacing: num(
				parsed.letterSpacing,
				NOVEL_SETTINGS_DEFAULT.letterSpacing,
			),
			theme,
			readingMode: parsed.readingMode === "scroll" ? "scroll" : "paged",
			fontRole: parsed.fontRole === "sans" ? "sans" : "doc",
			readingWidth: normalizeWidth(parsed.readingWidth),
			chapterRegex: str(parsed.chapterRegex, ""),
			encoding: str(parsed.encoding, "auto") as TextEncoding,
		}
	} catch {
		return undefined
	}
}

/** Validate a stored theme value; returns the default on malformed input. */
function normalizeTheme(raw: unknown): NovelTheme | undefined {
	if (raw === undefined || typeof raw !== "object" || raw === null) {
		// A missing theme on a v3 record is treated as the default.
		return DEFAULT_THEME
	}
	const r = raw as Record<string, unknown>
	if (r.kind === "inherit") return { kind: "inherit" }
	if (r.kind === "palette") {
		const palette =
			typeof r.palette === "string" ? r.palette : NOVEL_DEFAULT_PALETTE
		if (!isSupportedPalette(palette)) return undefined
		return { kind: "palette", palette }
	}
	if (r.kind === "custom") {
		const bg = typeof r.bg === "string" && r.bg.length > 0 ? r.bg : undefined
		const fg = typeof r.fg === "string" && r.fg.length > 0 ? r.fg : undefined
		if (bg === undefined || fg === undefined) return undefined
		return { kind: "custom", bg, fg }
	}
	return undefined
}

function num(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function str(value: unknown, fallback: string): string {
	return typeof value === "string" ? value : fallback
}

/** Snap a stored reading width to one of the supported column widths. */
function normalizeWidth(value: unknown): number {
	return value === 800 ? 800 : 680
}

export function encodeNovelPosition(value: NovelPosition): string {
	return JSON.stringify(value)
}

/**
 * Parse a persisted novel position. Returns `undefined` for malformed JSON
 * or unknown versions.
 */
export function decodeNovelPosition(raw: string): NovelPosition | undefined {
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>
		if (parsed.v !== POSITION_VERSION) return undefined
		if (
			typeof parsed.filename !== "string" ||
			typeof parsed.paragraphIndex !== "number" ||
			typeof parsed.fraction !== "number" ||
			typeof parsed.updatedAtMs !== "number"
		) {
			return undefined
		}
		return {
			v: POSITION_VERSION,
			filename: parsed.filename,
			paragraphIndex: parsed.paragraphIndex,
			fraction: parsed.fraction,
			updatedAtMs: parsed.updatedAtMs,
		}
	} catch {
		return undefined
	}
}

// ── Reader theme token model ──────────────────────────────────────────────

/** Registered palettes the reader can host locally. */
export const THEME_PALETTES = [
	"parchment",
	"sage",
	"azure",
	"hoardodile",
] as const

export type ThemePaletteName = (typeof THEME_PALETTES)[number]

function isSupportedPalette(value: string): value is ThemePaletteName {
	return (THEME_PALETTES as readonly string[]).includes(value)
}

export type ThemeTokenMap = Readonly<Record<string, string>>

/**
 * Palette token values, mirroring `.theme-<palette>` (light) and
 * `html.dark.theme-<palette>` (dark) in `@hoardodile/ui/theme.css`. The
 * reader applies these as inline CSS variables on `document.documentElement`
 * so the whole iframe (including portaled sheets/dialogs) follows the
 * chosen palette independent of the host's own theme class. Kept as a
 * constant so the theme is deterministic and unit-testable (jsdom does
 * not resolve CSS custom properties from imported stylesheets).
 */
export const PALETTE_TOKENS: Readonly<
	Record<
		ThemePaletteName,
		{ readonly light: ThemeTokenMap; readonly dark: ThemeTokenMap }
	>
> = {
	parchment: {
		light: {
			"--background": "#d9c7a3",
			"--foreground": "#302202",
			"--card": "#ccb991",
			"--card-foreground": "#302202",
			"--popover": "#ccb991",
			"--popover-foreground": "#302202",
			"--primary": "#7d5600",
			"--primary-foreground": "#f3e8ce",
			"--secondary": "#c0ac87",
			"--secondary-foreground": "#6a5a39",
			"--muted": "#c0ac87",
			"--muted-foreground": "#9e8c63",
			"--accent": "#bfa87a",
			"--accent-foreground": "#302202",
			"--border": "#b7a175",
			"--border-strong": "#a38c5c",
			"--input": "#b7a175",
			"--ring": "#7d5600",
			"--icon-tone": "#966500",
		},
		dark: {
			"--background": "#181818",
			"--foreground": "#b8b8b8",
			"--card": "#262626",
			"--card-foreground": "#b8b8b8",
			"--popover": "#2e2e2e",
			"--popover-foreground": "#b8b8b8",
			"--primary": "#d9a856",
			"--primary-foreground": "#302202",
			"--secondary": "#2e2e2e",
			"--secondary-foreground": "#969696",
			"--muted": "#2e2e2e",
			"--muted-foreground": "#717171",
			"--accent": "#3d2a2b",
			"--accent-foreground": "#b8b8b8",
			"--border": "#333333",
			"--border-strong": "#454545",
			"--input": "#333333",
			"--ring": "#d9a856",
			"--icon-tone": "#966500",
		},
	},
	sage: {
		light: {
			"--background": "#f5f6f0",
			"--foreground": "#212920",
			"--card": "#eef0ea",
			"--card-foreground": "#212920",
			"--popover": "#eef0ea",
			"--popover-foreground": "#212920",
			"--primary": "#525f4c",
			"--primary-foreground": "#f2f4ec",
			"--secondary": "#e7eae1",
			"--secondary-foreground": "#55604f",
			"--muted": "#e7eae1",
			"--muted-foreground": "#8a9083",
			"--accent": "#dee2d6",
			"--accent-foreground": "#212920",
			"--border": "#e0e4d9",
			"--border-strong": "#cdd3c1",
			"--input": "#e0e4d9",
			"--ring": "#525f4c",
			"--icon-tone": "#5f6d5b",
		},
		dark: {
			"--background": "#0a100e",
			"--foreground": "#d8cfbf",
			"--card": "#101a15",
			"--card-foreground": "#d8cfbf",
			"--popover": "#152019",
			"--popover-foreground": "#d8cfbf",
			"--primary": "#a8bd96",
			"--primary-foreground": "#101a15",
			"--secondary": "#152019",
			"--secondary-foreground": "#a9a79b",
			"--muted": "#152019",
			"--muted-foreground": "#7d7e74",
			"--accent": "#1b2a20",
			"--accent-foreground": "#ddd7c8",
			"--border": "#1d2a22",
			"--border-strong": "#28392d",
			"--input": "#1d2a22",
			"--ring": "#a8bd96",
			"--icon-tone": "#75855a",
		},
	},
	azure: {
		light: {
			"--background": "#fbfbfc",
			"--foreground": "#161718",
			"--card": "#ffffff",
			"--card-foreground": "#161718",
			"--popover": "#ffffff",
			"--popover-foreground": "#161718",
			"--primary": "#0277bd",
			"--primary-foreground": "#ffffff",
			"--secondary": "#f0f1f6",
			"--secondary-foreground": "#5e6267",
			"--muted": "#f0f1f6",
			"--muted-foreground": "#95979a",
			"--accent": "#e3f4fb",
			"--accent-foreground": "#161718",
			"--border": "#e4e5e7",
			"--border-strong": "#d0d2d8",
			"--input": "#e4e5e7",
			"--ring": "#0277bd",
			"--icon-tone": "#02aeee",
		},
		dark: {
			"--background": "#191a1c",
			"--foreground": "#d7d4d0",
			"--card": "#202224",
			"--card-foreground": "#d7d4d0",
			"--popover": "#292b2d",
			"--popover-foreground": "#d7d4d0",
			"--primary": "#02aeee",
			"--primary-foreground": "#0d1f26",
			"--secondary": "#292b2d",
			"--secondary-foreground": "#a7a097",
			"--muted": "#292b2d",
			"--muted-foreground": "#8a857d",
			"--accent": "#1d2c38",
			"--accent-foreground": "#d7d4d0",
			"--border": "#2c2f32",
			"--border-strong": "#3a3e42",
			"--input": "#2c2f32",
			"--ring": "#02aeee",
			"--icon-tone": "#008dc0",
		},
	},
	hoardodile: {
		light: {
			"--background": "#fbfbfb",
			"--foreground": "#272822",
			"--card": "#ffffff",
			"--card-foreground": "#272822",
			"--popover": "#ffffff",
			"--popover-foreground": "#272822",
			"--primary": "#5f721f",
			"--primary-foreground": "#f8f8f2",
			"--secondary": "#edede3",
			"--secondary-foreground": "#5c5d50",
			"--muted": "#edede3",
			"--muted-foreground": "#93917e",
			"--accent": "#e9f4ce",
			"--accent-foreground": "#272822",
			"--border": "#e3e3d4",
			"--border-strong": "#cfcfba",
			"--input": "#e3e3d4",
			"--ring": "#5f721f",
			"--icon-tone": "#758a23",
		},
		dark: {
			"--background": "#272822",
			"--foreground": "#f8f8f2",
			"--card": "#2f3028",
			"--card-foreground": "#f8f8f2",
			"--popover": "#34352c",
			"--popover-foreground": "#f8f8f2",
			"--primary": "#bcd03b",
			"--primary-foreground": "#272822",
			"--secondary": "#34352c",
			"--secondary-foreground": "#bcbfb0",
			"--muted": "#34352c",
			"--muted-foreground": "#75715e",
			"--accent": "#49483e",
			"--accent-foreground": "#f8f8f2",
			"--border": "#3a3b32",
			"--border-strong": "#4c4d41",
			"--input": "#3a3b32",
			"--ring": "#bcd03b",
			"--icon-tone": "#bcd03b",
		},
	},
}

/**
 * Build a coherent theme token map from a user-chosen background and
 * foreground colour. Canvas = `bg`, ink = `fg`; the fills, hairlines and
 * accent are derived by mixing the two so the reading surface and its
 * chrome stay self-consistent when the user picks an arbitrary pair.
 */
export function deriveCustomTheme(bg: string, fg: string): ThemeTokenMap {
	const card = mix(bg, fg, 0.05)
	const muted = mix(bg, fg, 0.06)
	const border = mix(bg, fg, 0.18)
	const borderStrong = mix(bg, fg, 0.3)
	return {
		"--background": bg,
		"--foreground": fg,
		"--card": card,
		"--card-foreground": fg,
		"--popover": card,
		"--popover-foreground": fg,
		"--primary": fg,
		"--primary-foreground": bg,
		"--secondary": muted,
		"--secondary-foreground": mix(fg, bg, 0.35),
		"--muted": muted,
		"--muted-foreground": mix(fg, bg, 0.45),
		"--accent": mix(bg, fg, 0.08),
		"--accent-foreground": fg,
		"--border": border,
		"--border-strong": borderStrong,
		"--input": border,
		"--ring": fg,
		"--icon-tone": fg,
	}
}

export const novelSettingsCodec: Codec<NovelSettings> = {
	encode: encodeNovelSettings,
	decode: decodeNovelSettings,
}

export const novelPositionMaybeCodec: Codec<NovelPosition | undefined> = {
	encode: (value) => (value === undefined ? "" : encodeNovelPosition(value)),
	decode: (raw) => {
		if (raw === "") return undefined
		return decodeNovelPosition(raw)
	},
}

// ── Small colour helpers (custom theme) ──────────────────────────────────

type Rgb = { readonly r: number; readonly g: number; readonly b: number }

function hexToRgb(hex: string): Rgb {
	let value = hex.trim().replace(/^#/, "")
	if (value.length === 3) {
		value = value
			.split("")
			.map((c) => `${c}${c}`)
			.join("")
	}
	const n = Number.parseInt(value, 16)
	if (Number.isNaN(n) || value.length !== 6) {
		return { r: 0, g: 0, b: 0 }
	}
	return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

function rgbToHex({ r, g, b }: Rgb): string {
	const c = (n: number) => Math.round(n).toString(16).padStart(2, "0")
	return `#${c(r)}${c(g)}${c(b)}`
}

/** Linear RGB blend: `weight` is the fraction of `b` in the result. */
function mix(a: string, b: string, weight: number): string {
	const ca = hexToRgb(a)
	const cb = hexToRgb(b)
	const w = Math.max(0, Math.min(1, weight))
	return rgbToHex({
		r: ca.r + (cb.r - ca.r) * w,
		g: ca.g + (cb.g - ca.g) * w,
		b: ca.b + (cb.b - ca.b) * w,
	})
}
