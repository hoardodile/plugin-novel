import type { Message } from "@hoardodile/sdk-web"
import { useMemo, useRef } from "react"
import type { NovelDocument } from "../core/document"
import type { NovelSettings } from "../prefs"
import { splitIntoChunks } from "./chunks"
import { columnFlowStyle, type NovelScrollAnchor } from "./column-layout"
import { NovelParagraphView } from "./NovelParagraphView"
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
	} = props
	const containerRef = useRef<HTMLDivElement | null>(null)
	const chunkIndex = useMemo(
		() => splitIntoChunks(document.paragraphs),
		[document.paragraphs],
	)

	const { chunkIdx, pageSize, goPrev, goNext } = useNovelPagination({
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

	const pressHandlers = useParagraphPress({
		containerRef,
		onLongPress: onParagraphLongPress,
		onCommentBadgeTap: onParagraphCommentTap,
		onTapBack: goPrev,
		onTapForward: goNext,
	})

	const baseParagraphStyle = useMemo(
		() => ({
			// Reading content speaks the doc serif (theme.css `--font-doc`;
			// the host's font preference still cascades via `--font-app`).
			fontFamily: "var(--font-doc)",
			fontSize: `${settings.fontSize}px`,
			lineHeight: settings.lineHeight,
			letterSpacing: `${settings.letterSpacing}em`,
		}),
		[settings.fontSize, settings.lineHeight, settings.letterSpacing],
	)

	const activeChunk = chunkIndex.chunks[chunkIdx]

	return (
		<div
			ref={containerRef}
			className="relative h-full w-full touch-pan-y overflow-x-hidden overflow-y-hidden select-none"
			data-testid="novel-body"
			onPointerDown={pressHandlers.onPointerDown}
			onPointerMove={pressHandlers.onPointerMove}
			onPointerUp={pressHandlers.onPointerUp}
			onPointerCancel={pressHandlers.onPointerCancel}
		>
			<div style={columnFlowStyle(pageSize)}>
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
