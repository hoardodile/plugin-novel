import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import type { NovelSettings } from "../prefs"
import type { NovelChunkIndex } from "./chunks"
import {
	anchorToPage,
	type ChunkLayout,
	countPages,
	locateGlobalPage,
	type NovelScrollAnchor,
	type ParagraphBox,
	type PendingChunkTarget,
	pageToAnchor,
	resolveTargetPage,
	tallyPages,
} from "./column-layout"

/**
 * The novel reader's pagination state machine.
 *
 * Only one chunk of paragraphs is mounted at a time, so the multi-column
 * layout cost stays bounded; the tradeoff is that every chunk swap,
 * typography change or resize invalidates the measured geometry and has
 * to be re-measured before the reader knows which page it is on. This
 * hook owns that cycle — measure, resolve a target, scroll, report —
 * and delegates every calculation to `column-layout.ts`.
 */

export type NovelPaginationOptions = {
	readonly containerRef: React.RefObject<HTMLDivElement | null>
	readonly chunkIndex: NovelChunkIndex
	readonly settings: NovelSettings
	/** Re-measure when the paragraph list itself changes identity. */
	readonly paragraphs: unknown
	readonly onScrollAnchorChange: (anchor: NovelScrollAnchor) => void
	readonly onPageStatsChange: (stats: {
		current: number
		total: number
	}) => void
	readonly scrollToAnchor: NovelScrollAnchor | undefined
	readonly onScrollHandled: () => void
	readonly scrollToPage: number | undefined
	readonly onScrollToPageHandled: () => void
}

export type NovelPagination = {
	readonly chunkIdx: number
	readonly pageSize: { readonly width: number; readonly height: number }
	readonly goPrev: () => void
	readonly goNext: () => void
}

export function useNovelPagination(
	opts: NovelPaginationOptions,
): NovelPagination {
	const {
		containerRef,
		chunkIndex,
		settings,
		paragraphs,
		onScrollAnchorChange,
		onPageStatsChange,
		scrollToAnchor,
		onScrollHandled,
		scrollToPage,
		onScrollToPageHandled,
	} = opts

	// `chunkIdx` selects which slice of paragraphs is mounted; crossing a
	// boundary remounts a new slice and resnaps `scrollLeft`.
	const [chunkIdx, setChunkIdx] = useState(0)
	const [pageInChunk, setPageInChunk] = useState(0)
	const [pagesByChunk, setPagesByChunk] = useState<ReadonlyMap<number, number>>(
		() => new Map(),
	)
	const pageSize = useContainerSize(containerRef)

	const pendingRef = useRef<PendingChunkTarget | undefined>(undefined)
	const layoutRef = useRef<ChunkLayout | undefined>(undefined)
	const scrollAnchorRef = useRef<NovelScrollAnchor>({
		paragraphIndex: 0,
		fraction: 0,
	})
	// One-shot flag set by the layout effect on a pure resize / reflow:
	// the next page sync skips writing the anchor back, so the persisted
	// fraction doesn't drift by `pageWidth / boxWidth` on every resize.
	const suppressAnchorSyncRef = useRef(false)

	const reportScrollAnchor = useEventCallback(onScrollAnchorChange)
	const reportPageStats = useEventCallback(onPageStatsChange)
	// Read inside the layout effect, which must NOT re-run on page flips
	// (re-measuring the whole chunk per page turn would be wasteful).
	const pageInChunkRef = useRef(pageInChunk)
	pageInChunkRef.current = pageInChunk

	const commitAnchor = useCallback(
		(anchor: NovelScrollAnchor | undefined) => {
			if (anchor === undefined) return
			scrollAnchorRef.current = anchor
			reportScrollAnchor(anchor)
		},
		[reportScrollAnchor],
	)

	// After every chunk swap, typography change or container resize the
	// multi-column layout must be re-measured to map paragraphs back to
	// columns. `scrollLeft` is reset to 0 first so paragraph boxes are
	// read in absolute layout coordinates — a stale offset from the
	// previous chunk would skew every subsequent lookup.
	useLayoutEffect(
		function measureChunkLayout() {
			const root = containerRef.current
			if (root === null) return
			const pageWidth = root.clientWidth
			if (pageWidth === 0) return
			root.scrollLeft = 0

			const layout: ChunkLayout = {
				pagesInChunk: countPages(root.scrollWidth, pageWidth),
				paragraphBoxes: measureParagraphBoxes(root),
			}
			layoutRef.current = layout
			setPagesByChunk(function record(prev) {
				if (prev.get(chunkIdx) === layout.pagesInChunk) return prev
				const next = new Map(prev)
				next.set(chunkIdx, layout.pagesInChunk)
				return next
			})

			const pending = pendingRef.current
			pendingRef.current = undefined
			const targetPage = resolveTargetPage({
				pending,
				anchor: scrollAnchorRef.current,
				layout,
				pageWidth,
			})
			setPageInChunk(targetPage)
			root.scrollTo({ left: targetPage * pageWidth, behavior: "auto" })

			// Intentional navigation resets the anchor to wherever we landed,
			// because the caller meant to move there. A pure resize must not:
			// re-deriving the anchor would snap the fraction toward the page
			// boundary on every re-measure.
			if (pending !== undefined) {
				commitAnchor(
					pageToAnchor({
						pageInChunk: targetPage,
						paragraphBoxes: layout.paragraphBoxes,
						pageWidth,
					}),
				)
			} else if (targetPage !== pageInChunkRef.current) {
				// Only arm the flag when `pageInChunk` will actually change;
				// otherwise React no-ops the setter and the flag would survive
				// into the next user navigation.
				suppressAnchorSyncRef.current = true
			}
		},
		// `pageInChunk` is read through a ref — the page-sync effect below
		// handles within-chunk page changes; re-measuring on every page
		// flip would be wasteful.
		[
			chunkIdx,
			containerRef,
			pageSize.width,
			pageSize.height,
			settings.fontSize,
			settings.lineHeight,
			settings.letterSpacing,
			settings.fontRole,
			paragraphs,
			commitAnchor,
		],
	)

	useEffect(
		function syncScrollWithinChunk() {
			const root = containerRef.current
			if (root === null) return
			const pageWidth = root.clientWidth
			if (pageWidth === 0) return
			const target = pageInChunk * pageWidth
			if (Math.abs(root.scrollLeft - target) > 1) {
				root.scrollTo({ left: target, behavior: "auto" })
			}
			if (suppressAnchorSyncRef.current) {
				suppressAnchorSyncRef.current = false
				return
			}
			const layout = layoutRef.current
			if (layout === undefined) return
			commitAnchor(
				pageToAnchor({
					pageInChunk,
					paragraphBoxes: layout.paragraphBoxes,
					pageWidth,
				}),
			)
		},
		[pageInChunk, commitAnchor, containerRef],
	)

	const goPrev = useCallback(
		function goPrev() {
			if (pageInChunk > 0) {
				setPageInChunk(pageInChunk - 1)
				return
			}
			if (chunkIdx > 0) {
				pendingRef.current = { kind: "last" }
				setChunkIdx(chunkIdx - 1)
			}
		},
		[chunkIdx, pageInChunk],
	)

	const goNext = useCallback(
		function goNext() {
			const layout = layoutRef.current
			if (layout !== undefined && pageInChunk + 1 < layout.pagesInChunk) {
				setPageInChunk(pageInChunk + 1)
				return
			}
			if (chunkIdx + 1 < chunkIndex.chunks.length) {
				pendingRef.current = { kind: "first" }
				setChunkIdx(chunkIdx + 1)
			}
		},
		[chunkIdx, pageInChunk, chunkIndex.chunks.length],
	)

	useEffect(
		function bindArrowKeys() {
			function onKey(e: KeyboardEvent) {
				if (e.key === "ArrowRight") goNext()
				else if (e.key === "ArrowLeft") goPrev()
			}
			window.addEventListener("keydown", onKey)
			return () => window.removeEventListener("keydown", onKey)
		},
		[goNext, goPrev],
	)

	useEffect(
		function jumpToAnchor() {
			if (scrollToAnchor === undefined) return
			const { paragraphIndex, fraction } = scrollToAnchor
			const targetChunk = chunkIndex.chunkOfParagraph(paragraphIndex)
			if (targetChunk !== chunkIdx) {
				pendingRef.current = {
					kind: "anchor",
					paragraph: paragraphIndex,
					fraction,
				}
				setChunkIdx(targetChunk)
			} else {
				const root = containerRef.current
				const layout = layoutRef.current
				if (root !== null && layout !== undefined) {
					setPageInChunk(
						anchorToPage({
							anchor: scrollToAnchor,
							paragraphBoxes: layout.paragraphBoxes,
							pageWidth: root.clientWidth,
							pagesInChunk: layout.pagesInChunk,
						}),
					)
				}
			}
			onScrollHandled()
		},
		[scrollToAnchor, onScrollHandled, chunkIndex, chunkIdx, containerRef],
	)

	const { currentPage, totalPages } = useMemo(
		() =>
			tallyPages({
				chunkCount: chunkIndex.chunks.length,
				chunkIdx,
				pageInChunk,
				pagesByChunk,
			}),
		[chunkIndex.chunks.length, chunkIdx, pageInChunk, pagesByChunk],
	)
	useEffect(
		function emitPageStats() {
			reportPageStats({ current: currentPage, total: totalPages })
		},
		[currentPage, totalPages, reportPageStats],
	)

	const pageLocatorRef = useRef({
		chunkCount: chunkIndex.chunks.length,
		pagesByChunk,
		totalPages,
		chunkIdx,
	})
	pageLocatorRef.current = {
		chunkCount: chunkIndex.chunks.length,
		pagesByChunk,
		totalPages,
		chunkIdx,
	}
	useEffect(
		function jumpToGlobalPage() {
			if (scrollToPage === undefined) return
			// Read through a ref: the tally is needed for navigation, but a
			// tally update must not re-trigger the jump. The effect fires
			// only when the parent issues a new request.
			const locator = pageLocatorRef.current
			const found = locateGlobalPage({
				page: scrollToPage,
				chunkCount: locator.chunkCount,
				pagesByChunk: locator.pagesByChunk,
				totalPages: locator.totalPages,
			})
			if (found !== undefined) {
				if (found.chunkIdx === locator.chunkIdx) {
					setPageInChunk(found.pageInChunk)
				} else {
					pendingRef.current = { kind: "page", page: found.pageInChunk }
					setChunkIdx(found.chunkIdx)
				}
			}
			onScrollToPageHandled()
		},
		[scrollToPage, onScrollToPageHandled],
	)

	return { chunkIdx, pageSize, goPrev, goNext }
}

/** Live container dimensions; one page equals one container width. */
function useContainerSize(
	containerRef: React.RefObject<HTMLDivElement | null>,
) {
	const [size, setSize] = useState<{ width: number; height: number }>({
		width: 0,
		height: 0,
	})
	useEffect(
		function trackContainerSize() {
			const root = containerRef.current
			if (root === null) return
			function update() {
				if (root === null) return
				setSize({ width: root.clientWidth, height: root.clientHeight })
			}
			update()
			const observer = new ResizeObserver(update)
			observer.observe(root)
			return () => observer.disconnect()
		},
		[containerRef],
	)
	return size
}

/** Read every mounted paragraph's box in absolute layout coordinates. */
function measureParagraphBoxes(root: HTMLElement): Map<number, ParagraphBox> {
	const containerLeft = root.getBoundingClientRect().left
	const boxes = new Map<number, ParagraphBox>()
	for (const el of root.querySelectorAll<HTMLElement>("[data-pidx]")) {
		const pidx = Number(el.dataset.pidx)
		if (Number.isNaN(pidx) || boxes.has(pidx)) continue
		const rect = el.getBoundingClientRect()
		boxes.set(pidx, {
			left: rect.left - containerLeft + root.scrollLeft,
			width: rect.width,
		})
	}
	return boxes
}

/**
 * Latest-callback ref so layout effects can call user callbacks without
 * re-running every time the parent reissues a new function identity.
 * The returned function is stable; its body reads the newest prop.
 */
function useEventCallback<TArgs extends readonly unknown[], TReturn>(
	fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
	const ref = useRef(fn)
	ref.current = fn
	return useCallback((...args: TArgs) => ref.current(...args), [])
}
