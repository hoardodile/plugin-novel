import type { Message } from "@hoardodile/sdk-web"
import { useMemo, useRef } from "react"
import type { NovelDocument } from "../core/document"
import type { NovelSettings } from "../prefs"
import { splitIntoChunks } from "./chunks"
import { columnFlowStyle, type NovelScrollAnchor } from "./column-layout"
import {
	NovelParagraphView,
	novelParagraphBaseStyle,
} from "./NovelParagraphView"
import { useNovelPagination } from "./useNovelPagination"
import { useParagraphPress } from "./useParagraphPress"

export type { NovelScrollAnchor } from "./column-layout"

/**
 * Paginated novel text. Renders one chunk of paragraphs into a CSS
 * multi-column flow and scrolls it horizontally one viewport page at a
 * time.
 *
 * The pagination state machine (measure → resolve target → scroll →
 * report) lives in `useNovelPagination`, its geometry in
 * `column-layout.ts`, and the press gestures in `useParagraphPress`.
 * What is left here is the render tree.
 */
export type NovelBodyProps = {
	readonly document: NovelDocument
	readonly settings: NovelSettings
	readonly onScrollAnchorChange: (anchor: NovelScrollAnchor) => void
	readonly onParagraphLongPress: (idx: number) => void
	readonly onParagraphCommentTap: (idx: number) => void
	readonly commentsByParagraph: ReadonlyMap<number, readonly Message[]>
	readonly scrollToAnchor: NovelScrollAnchor | undefined
	readonly onScrollHandled: () => void
	readonly scrollToPage: number | undefined
	readonly onScrollToPageHandled: () => void
	readonly onPageStatsChange: (stats: {
		current: number
		total: number
	}) => void
	/** Toggle the immersive chrome (mobile). Absent keeps tap-to-page only. */
	readonly onToggleChrome?: () => void
	/** Compact (below-md) page insets on mobile. */
	readonly compact?: boolean
}

export function NovelBody(props: NovelBodyProps) {
	const {
		document,
		settings,
		onScrollAnchorChange,
		onParagraphLongPress,
		onParagraphCommentTap,
		commentsByParagraph,
		scrollToAnchor,
		onScrollHandled,
		scrollToPage,
		onScrollToPageHandled,
		onPageStatsChange,
		onToggleChrome,
		compact,
	} = props
	const containerRef = useRef<HTMLDivElement | null>(null)
	const chunkIndex = useMemo(
		() => splitIntoChunks(document.paragraphs),
		[document.paragraphs],
	)

	const { chunkIdx, pageSize, flowWidth, goPrev, goNext } = useNovelPagination({
		containerRef,
		chunkIndex,
		settings,
		paragraphs: document.paragraphs,
		onScrollAnchorChange,
		onPageStatsChange,
		scrollToAnchor,
		onScrollHandled,
		scrollToPage,
		onScrollToPageHandled,
	})

	// Desktop paged mode doesn't page-turn by tapping — the bottom strip's
	// prev/next buttons (and arrow keys) handle it; mobile (compact) keeps
	// the tap-to-page-turn gestures.
	const pressHandlers = useParagraphPress({
		containerRef,
		onLongPress: onParagraphLongPress,
		onCommentBadgeTap: onParagraphCommentTap,
		onTapBack: compact ? goPrev : noop,
		onTapForward: compact ? goNext : noop,
		onTapCenter: onToggleChrome,
	})

	const baseParagraphStyle = useMemo(
		() => novelParagraphBaseStyle(settings),
		[
			settings.fontSize,
			settings.lineHeight,
			settings.letterSpacing,
			settings.fontRole,
		],
	)

	const activeChunk = chunkIndex.chunks[chunkIdx]

	return (
		<div
			ref={containerRef}
			className={`relative h-full w-full touch-pan-y overflow-x-hidden overflow-y-hidden ${
				compact ? "select-none" : "select-text"
			}`}
			data-testid="novel-body"
			onPointerDown={pressHandlers.onPointerDown}
			onPointerMove={pressHandlers.onPointerMove}
			onPointerUp={pressHandlers.onPointerUp}
			onPointerCancel={pressHandlers.onPointerCancel}
			onContextMenu={pressHandlers.onContextMenu}
		>
			<div style={columnFlowStyle(pageSize, { compact, flowWidth })}>
				{activeChunk?.paragraphs.map(function renderParagraph(p) {
					return (
						<NovelParagraphView
							key={p.index}
							paragraph={p}
							baseStyle={baseParagraphStyle}
							commentCount={commentsByParagraph.get(p.index)?.length ?? 0}
						/>
					)
				})}
			</div>
		</div>
	)
}

function noop() {
	// Desktop paged mode taps are inert — paging uses the bottom strip.
}
