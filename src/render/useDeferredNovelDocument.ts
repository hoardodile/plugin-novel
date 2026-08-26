import { useEffect, useState } from "react"
import { buildNovelDocument, type NovelDocument } from "../core/document"
import type { NovelUnit } from "../core/text"

/**
 * Threshold (chars) above which document assembly is deferred to a
 * `requestIdleCallback` slot rather than running inline. Below it the
 * parse cost is invisibly small and the extra round-trip would just
 * delay first paint of short documents.
 */
const NOVEL_PARSE_DEFERRAL_THRESHOLD = 200_000

type DeferredParseInput = Readonly<{
	units: readonly NovelUnit[] | undefined
	chapterRegexSource: string
	structured: boolean
}>

/**
 * Run `buildNovelDocument` outside the React commit phase so that
 * opening a multi-megabyte book doesn't freeze the UI thread for
 * hundreds of milliseconds. Small documents take the synchronous path
 * so the common case still produces a first paint without the extra
 * idle round-trip.
 */
export function useDeferredNovelDocument(
	input: DeferredParseInput,
): NovelDocument | undefined {
	const { units, chapterRegexSource, structured } = input
	const [doc, setDoc] = useState<NovelDocument | undefined>(undefined)
	useEffect(
		function scheduleParse() {
			if (units === undefined) {
				setDoc(undefined)
				return
			}
			const totalChars = units.reduce((acc, unit) => acc + unit.text.length, 0)
			if (totalChars <= NOVEL_PARSE_DEFERRAL_THRESHOLD) {
				setDoc(buildNovelDocument(units, { chapterRegexSource, structured }))
				return
			}
			let cancelled = false
			function run() {
				if (cancelled) return
				const next = buildNovelDocument(units as readonly NovelUnit[], {
					chapterRegexSource,
					structured,
				})
				if (cancelled) return
				setDoc(next)
			}
			const ric =
				typeof window !== "undefined" &&
				typeof window.requestIdleCallback === "function"
					? window.requestIdleCallback(run, { timeout: 250 })
					: window.setTimeout(run, 0)
			return function cancel() {
				cancelled = true
				if (
					typeof window !== "undefined" &&
					typeof window.cancelIdleCallback === "function"
				) {
					window.cancelIdleCallback(ric as number)
				} else {
					window.clearTimeout(ric as number)
				}
			}
		},
		[units, chapterRegexSource, structured],
	)
	return doc
}
