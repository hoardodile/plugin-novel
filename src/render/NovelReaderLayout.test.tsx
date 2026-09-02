import { StubPluginAPIProvider } from "@hoardodile/sdk-react"
import type { Message } from "@hoardodile/sdk-web"
import { render, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { NovelReader } from "./NovelReader"

const FILENAME = "chapter.txt"
const TEXT = ["first", "second", "third"].join("\n")

// jsdom cannot lay out the paged flow or publish scroll positions; stub the
// body so the layout tests assert the chrome around it.
vi.mock("./NovelBody", function mockNovelBody() {
	return {
		NovelBody: function NovelBodyStub() {
			return null
		},
	}
})

function encodeText(text: string): ArrayBuffer {
	const bytes = new TextEncoder().encode(text)
	const buffer = new ArrayBuffer(bytes.byteLength)
	new Uint8Array(buffer).set(bytes)
	return buffer
}

function renderReader() {
	return render(
		<StubPluginAPIProvider
			api={{
				useFileList: function useFileList() {
					return {
						data: [{ path: FILENAME, kind: "text" as const }],
						isLoading: false,
						isError: false,
						error: null,
					}
				},
				readFile: async function readFile() {
					return encodeText(TEXT)
				},
				useMessageList: function useMessageList() {
					return {
						data: [] as Message[],
						isLoading: false,
						isError: false,
						error: null,
					}
				},
			}}
		>
			<NovelReader />
		</StubPluginAPIProvider>,
	)
}

function mobileMatchMedia(query: string) {
	return {
		matches: true,
		media: query,
		onchange: null,
		addListener: () => undefined,
		removeListener: () => undefined,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		dispatchEvent: () => false,
	} as MediaQueryList
}

const savedMatchMedia = window.matchMedia

afterEach(function restore() {
	window.matchMedia = savedMatchMedia
})

describe("NovelReader layout", () => {
	it("desktop shows the side rail and real top/bottom strips, no floating toolbar", async () => {
		renderReader()
		await waitFor(function mounted() {
			expect(
				document.querySelector('[data-testid="novel-side-rail"]'),
			).not.toBeNull()
		})
		expect(
			document.querySelector('[data-testid="novel-reading-top"]'),
		).not.toBeNull()
		expect(
			document.querySelector('[data-testid="novel-reading-bottom"]'),
		).not.toBeNull()
		expect(document.querySelector('[data-testid="novel-toolbar"]')).toBeNull()
	})

	it("mobile shows the real top/bottom strips, no rail, and the floating toolbar hidden by default", async () => {
		window.matchMedia = mobileMatchMedia as typeof window.matchMedia
		renderReader()
		await waitFor(function mounted() {
			expect(
				document.querySelector('[data-testid="novel-reading-bottom"]'),
			).not.toBeNull()
		})
		expect(
			(
				document.querySelector('[data-testid="novel-reading-bottom"]')
					?.textContent ?? ""
			).length,
		).toBeGreaterThan(0)
		expect(document.querySelector('[data-testid="novel-side-rail"]')).toBeNull()
		expect(document.querySelector('[data-testid="novel-toolbar"]')).toBeNull()
	})
})
