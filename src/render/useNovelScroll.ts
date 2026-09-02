import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import type { NovelDocument } from "../core/document"
import type { NovelSettings } from "../prefs"
import {
	anchorToScrollTop,
	boxAtScrollTop,
	type NovelScrollAnchor,
	scrollProgress,
	type VerticalBox,
	type VerticalBoxes,
} from "./scroll-layout"

/**
 * The continuous-scroll reading mode state. Renders the whole paragraph
 * stream (see `NovelScrollBody`) and, given its scroll container, keeps
 * the reading position reflow-invariant: the paragraph at the container's
 * top plus a fraction is what survives a resize or typography change —
 * never the raw scroll offset.
 *
 * The vertical analogue of `useNovelPagination`: measure → restore → track
 * → jump, with the geometry in `scroll-layout.ts`.
 */

export type NovelScrollOptions = {
	readonly containerRef: React.RefObject<HTMLDivElement | null>
	readonly settings: NovelSettings
	readonly document: NovelDocument
	readonly onScrollAnchorChange: (anchor: NovelScrollAnchor) => void
	readonly scrollToAnchor: NovelScrollAnchor | undefined
	readonly onAnchorHandled: () => void
	readonly onProgressChange: (progress: number) => void
}

export type NovelScroll = {
	readonly onScroll: () => void
	readonly goToParagraph: (paragraphIndex: number, fraction?: number) => void
}

export function useNovelScroll(opts: NovelScrollOptions): NovelScroll {
	const {
		containerRef,
		settings,
		document,
		onScrollAnchorChange,
		scrollToAnchor,
		onAnchorHandled,
		onProgressChange,
	} = opts

	const boxesRef = useRef<VerticalBoxes>(new Map())
	const contentHeightRef = useRef(0)
	const anchorRef = useRef<NovelScrollAnchor>({
		paragraphIndex: 0,
		fraction: 0,
	})
	const lastReportedRef = useRef<NovelScrollAnchor | undefined>(undefined)
	const suppressScrollReportRef = useRef(false)

	const measure = useCallback(function measure(root: HTMLElement) {
		const containerTop = root.getBoundingClientRect().top
		const scrollTop = root.scrollTop
		const boxes = new Map<number, VerticalBox>()
		let contentBottom = 0
		for (const el of root.querySelectorAll<HTMLElement>("[data-pidx]")) {
			const pidx = Number(el.dataset.pidx)
			if (Number.isNaN(pidx) || boxes.has(pidx)) continue
			const rect = el.getBoundingClientRect()
			const top = rect.top - containerTop + scrollTop
			const height = el.offsetHeight
			boxes.set(pidx, { top, height })
			if (top + height > contentBottom) contentBottom = top + height
		}
		boxesRef.current = boxes
		contentHeightRef.current = Math.max(contentBottom, root.scrollHeight)
	}, [])

	// Re-measure and restore position whenever the layout-affecting props
	// (typography, document identity) or the container size change. A pure
	// reflow must not snap the anchor back toward a page boundary, so the
	// next scroll report is suppressed.
	const reflow = useCallback(
		function reflow() {
			const root = containerRef.current
			if (root === null) return
			const prev = anchorRef.current
			measure(root)
			const target = anchorToScrollTop(prev, boxesRef.current)
			if (Math.abs(root.scrollTop - target) > 1) {
				suppressScrollReportRef.current = true
				root.scrollTop = target
			}
			onProgressChange(
				scrollProgress(target, contentHeightRef.current, root.clientHeight),
			)
			// Keep the reported anchor in sync with the (unchanged) logical one.
			lastReportedRef.current = prev
		},
		[
			containerRef,
			measure,
			settings.fontSize,
			settings.lineHeight,
			settings.letterSpacing,
			settings.fontRole,
			document,
			onProgressChange,
		],
	)

	useLayoutEffect(
		function runReflow() {
			reflow()
		},
		[reflow],
	)

	useEffect(
		function watchContainerSize() {
			const root = containerRef.current
			if (root === null) return
			const observer = new ResizeObserver(reflow)
			observer.observe(root)
			return () => observer.disconnect()
		},
		[containerRef, reflow],
	)

	const onScroll = useCallback(
		function onScroll() {
			const root = containerRef.current
			if (root === null) return
			if (suppressScrollReportRef.current) {
				suppressScrollReportRef.current = false
				return
			}
			const anchor = boxAtScrollTop(root.scrollTop, boxesRef.current)
			if (anchor !== undefined) {
				anchorRef.current = anchor
				const last = lastReportedRef.current
				if (
					last === undefined ||
					last.paragraphIndex !== anchor.paragraphIndex ||
					Math.abs(last.fraction - anchor.fraction) > 0.01
				) {
					lastReportedRef.current = anchor
					onScrollAnchorChange(anchor)
				}
			}
			onProgressChange(
				scrollProgress(
					root.scrollTop,
					contentHeightRef.current,
					root.clientHeight,
				),
			)
		},
		[containerRef, onScrollAnchorChange, onProgressChange],
	)

	useEffect(
		function jumpToAnchor() {
			if (scrollToAnchor === undefined) return
			const root = containerRef.current
			if (root === null) return
			root.scrollTo({
				top: anchorToScrollTop(scrollToAnchor, boxesRef.current),
				behavior: "auto",
			})
			onAnchorHandled()
		},
		[scrollToAnchor, onAnchorHandled, containerRef],
	)

	const goToParagraph = useCallback(
		function goToParagraph(paragraphIndex: number, fraction = 0) {
			const root = containerRef.current
			if (root === null) return
			root.scrollTo({
				top: anchorToScrollTop({ paragraphIndex, fraction }, boxesRef.current),
				behavior: "auto",
			})
		},
		[containerRef],
	)

	return { onScroll, goToParagraph }
}
