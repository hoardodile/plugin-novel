import { StubPluginAPIProvider } from "@hoardodile/sdk-react"
import type { AnchorData, Codec, Message } from "@hoardodile/sdk-web"
import { act, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NOVEL_SETTINGS_DEFAULT, type NovelSettings } from "../prefs"
import { NovelReader } from "./NovelReader"

const FILENAME = "chapter.txt"
const TEXT = ["first", "second", "third", "fourth"].join("\n")
const SCROLL_SETTINGS: NovelSettings = {
	...NOVEL_SETTINGS_DEFAULT,
	readingMode: "scroll",
}

type CapturedScrollProps = {
	mounted: boolean
	scrollToAnchor: { paragraphIndex: number; fraction: number } | undefined
}

const capturedScroll = vi.hoisted(function createStore(): CapturedScrollProps {
	return { mounted: false, scrollToAnchor: undefined }
})

// jsdom cannot lay out a scroll flow; stub the scroll body and capture the
// props NovelReader feeds it when readingMode is "scroll".
vi.mock("./NovelScrollBody", function mockNovelScrollBody() {
	return {
		NovelScrollBody: function NovelScrollBodyStub(props: {
			readonly scrollToAnchor:
				| { paragraphIndex: number; fraction: number }
				| undefined
			readonly onProgressChange: (progress: number) => void
		}) {
			capturedScroll.scrollToAnchor = props.scrollToAnchor
			capturedScroll.mounted = true
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

function renderScrollReader(
	onAnchorJump?: (cb: (a: AnchorData) => void) => () => void,
) {
	return render(
		<StubPluginAPIProvider
			api={{
				usePref: function usePref<T>(
					key: string,
					defaultValue: T,
					codec?: Codec<T>,
				): readonly [T, (value: T) => void] {
					void key
					void defaultValue
					void codec
					return [SCROLL_SETTINGS as unknown as T, () => undefined]
				},
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
				onAnchorJump,
			}}
		>
			<NovelReader />
		</StubPluginAPIProvider>,
	)
}

describe("NovelReader (scroll mode)", () => {
	beforeEach(function reset() {
		capturedScroll.mounted = false
		capturedScroll.scrollToAnchor = undefined
	})

	it("renders the scroll body and reports an anchor jump", async () => {
		let jumpHandler: ((anchor: AnchorData) => void) | undefined
		renderScrollReader(function onAnchorJump(cb) {
			jumpHandler = cb
			return function unsubscribe() {}
		})
		await waitFor(function mounted() {
			expect(capturedScroll.mounted).toBe(true)
		})

		act(function push() {
			jumpHandler?.({ data: { paragraphIndex: 2, filename: FILENAME } })
		})
		await waitFor(function jumped() {
			expect(capturedScroll.scrollToAnchor).toEqual({
				paragraphIndex: 2,
				fraction: 0,
			})
		})
	})
})
