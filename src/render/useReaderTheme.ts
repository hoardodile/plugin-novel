import { useLayoutEffect } from "react"
import {
	deriveCustomTheme,
	type NovelTheme,
	PALETTE_TOKENS,
	THEME_PALETTES,
	type ThemeTokenMap,
} from "../prefs"
import { usePluginAPI } from "./hooks"

/** The custom-property names the reader theme manages. */
const MANAGED_VARS = Object.keys(PALETTE_TOKENS.parchment.light)

/**
 * Apply the reader's theme preference as inline CSS variables on
 * `document.documentElement`.
 *
 * The plugin iframe is entirely the reader, so overriding the document
 * root's variables themes every surface — including the portaled
 * `Sheet`/`AppDialog` overlays, which render under `body` and would
 * otherwise inherit the host palette. Inline variables survive the
 * SDK's class-based `applyTheme` (which strips every `theme-*` class on
 * each host theme change), so this is ordering-independent: it simply
 * re-asserts on `[theme, resolvedTheme]`.
 *
 * - `inherit` clears the managed variables, letting the host's
 *   `theme-<palette>` class (or the base `:root`/`.dark` values) stand.
 * - `palette` applies the registered palette's token set for the current
 *   light/dark mode.
 * - `custom` applies a token set derived from the chosen bg/fg pair.
 */
export function useReaderTheme(theme: NovelTheme): void {
	const api = usePluginAPI()
	// `useTheme` is part of the reactive plugin API; guard for fixture
	// providers that only supply the imperative queries.
	const hostTheme = (
		api as { readonly useTheme?: () => { readonly resolvedTheme?: string } }
	).useTheme?.()
	const resolvedTheme = hostTheme?.resolvedTheme
	const mode = resolvedTheme === "dark" ? "dark" : "light"

	useLayoutEffect(
		function applyReaderTheme() {
			const root = document.documentElement
			if (theme.kind === "inherit") {
				for (const name of MANAGED_VARS) root.style.removeProperty(name)
				return
			}
			const tokens = readerThemeTokens(theme, mode)
			for (const [name, value] of Object.entries(tokens)) {
				root.style.setProperty(name, value)
			}
		},
		[theme, mode],
	)
}

/** Resolve the overriding token set for a non-inherit theme preference. */
function readerThemeTokens(
	theme: NovelTheme,
	mode: "light" | "dark",
): ThemeTokenMap {
	if (theme.kind === "custom") {
		// Fall back to neutral defaults if the stored pair is malformed.
		return deriveCustomTheme(theme.bg ?? "#ffffff", theme.fg ?? "#101010")
	}
	const palette =
		typeof theme.palette === "string" &&
		(THEME_PALETTES as readonly string[]).includes(theme.palette)
			? theme.palette
			: "parchment"
	return PALETTE_TOKENS[palette as keyof typeof PALETTE_TOKENS][mode]
}
