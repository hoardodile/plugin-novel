import { StubPluginAPIProvider } from "@hoardodile/sdk-react"
import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import type { NovelTheme } from "../prefs"
import { useReaderTheme } from "./useReaderTheme"

function Host({ theme }: { readonly theme: NovelTheme }) {
	useReaderTheme(theme)
	return null
}

function mount(theme: NovelTheme) {
	return render(
		<StubPluginAPIProvider api={{}}>
			<Host theme={theme} />
		</StubPluginAPIProvider>,
	)
}

describe("useReaderTheme", () => {
	beforeEach(function reset() {
		document.documentElement.removeAttribute("style")
	})

	it("applies a palette's token set inline", () => {
		mount({ kind: "palette", palette: "parchment" })
		expect(
			document.documentElement.style.getPropertyValue("--background"),
		).toBe("#d9c7a3")
	})

	it("clears the override when inheriting the host theme", () => {
		const view = mount({ kind: "palette", palette: "parchment" })
		view.rerender(
			<StubPluginAPIProvider api={{}}>
				<Host theme={{ kind: "inherit" }} />
			</StubPluginAPIProvider>,
		)
		expect(
			document.documentElement.style.getPropertyValue("--background"),
		).toBe("")
	})

	it("applies a derived token set for a custom pair", () => {
		mount({ kind: "custom", bg: "#101010", fg: "#f0f0f0" })
		expect(
			document.documentElement.style.getPropertyValue("--background"),
		).toBe("#101010")
		expect(
			document.documentElement.style.getPropertyValue("--foreground"),
		).toBe("#f0f0f0")
	})
})
