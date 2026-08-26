import { useCacheWriter } from "@hoardodile/sdk-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { NovelDocument } from "../core/document"
import {
	encodeNovelPosition,
	type NovelPosition,
	novelPositionMaybeCodec,
} from "../prefs"
import type { NovelScrollAnchor } from "./column-layout"
import { usePluginAPI } from "./hooks"

/**
 * Per-resource reading position: hydrated once from the resource-scoped
 * cache (clamped to the parsed document, guarded by the active file),
 * then written back through `useCacheWriter` as the reader moves.
 * Owns the mirrored `scrollAnchor`/`scrollToAnchor` pair so the reader
 * component deals with a single "jump to here" gesture.
 */
export function useNovelPosition(opts: {
	readonly filename: string
	/** Gates hydration until the parsed document exists. */
	readonly document: NovelDocument | undefined
}): {
	readonly scrollAnchor: NovelScrollAnchor
	readonly setScrollAnchor: (anchor: NovelScrollAnchor) => void
	readonly scrollToAnchor: NovelScrollAnchor | undefined
	readonly handleJump: (paragraphIndex: number) => void
	readonly onScrollHandled: () => void
} {
	const { filename, document } = opts
	const api = usePluginAPI()

	const cachedPosition = useMemo((): NovelPosition | undefined => {
		const raw = api.getCache("position")
		return raw !== undefined ? novelPositionMaybeCodec.decode(raw) : undefined
	}, [api])

	const [scrollAnchor, setScrollAnchor] = useState<NovelScrollAnchor>({
		paragraphIndex: 0,
		fraction: 0,
	})
	const [scrollToAnchor, setScrollToAnchor] = useState<
		NovelScrollAnchor | undefined
	>(undefined)
	const hasHydratedRef = useRef(false)

	useEffect(
		function hydrateOnce() {
			if (hasHydratedRef.current) return
			if (document === undefined) return
			hasHydratedRef.current = true
			const pos = cachedPosition
			if (pos === undefined) return
			if (pos.filename !== filename) return
			const idx = Math.min(
				pos.paragraphIndex,
				Math.max(0, document.paragraphs.length - 1),
			)
			const fraction = Math.max(0, Math.min(1, pos.fraction))
			setScrollAnchor({ paragraphIndex: idx, fraction })
			setScrollToAnchor({ paragraphIndex: idx, fraction })
		},
		[cachedPosition, document, filename],
	)

	const positionPayload = useMemo<NovelPosition | undefined>(
		function buildPayload() {
			if (filename === "") return undefined
			return {
				v: 2,
				filename,
				paragraphIndex: scrollAnchor.paragraphIndex,
				fraction: scrollAnchor.fraction,
				updatedAtMs: Date.now(),
			}
		},
		[filename, scrollAnchor.paragraphIndex, scrollAnchor.fraction],
	)

	useCacheWriter({
		key: "position",
		value: positionPayload,
		encode: encodeNovelPosition,
		disabled: !hasHydratedRef.current,
	})

	const handleJump = useCallback(function handleJump(paragraphIndex: number) {
		setScrollAnchor({ paragraphIndex, fraction: 0 })
		setScrollToAnchor({ paragraphIndex, fraction: 0 })
	}, [])

	const onScrollHandled = useCallback(function onScrollHandled() {
		setScrollToAnchor(undefined)
	}, [])

	return {
		scrollAnchor,
		setScrollAnchor,
		scrollToAnchor,
		handleJump,
		onScrollHandled,
	}
}
