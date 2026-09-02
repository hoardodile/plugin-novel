import type { Message } from "@hoardodile/sdk-web"
import { useMemo, useRef } from "react"
import type { NovelDocument } from "../core/document"
import type { NovelSettings } from "../prefs"
import {
	NovelParagraphView,
	novelParagraphBaseStyle,
} from "./NovelParagraphView"
import type { NovelScrollAnchor } from "./scroll-layout"
import { useNovelScroll } from "./useNovelScroll"
import { useParagraphPress } from "./useParagraphPress"

/**
 * Continuous (scroll) reading mode. Renders the whole paragraph stream
 * into a single vertical flow inside a `max-w-reading` column and tracks
 * the scroll position as a reflow-invariant anchor.
 *
 * Interaction differs from paged mode: a plain tap does nothing (the page
 * is scrolled, not turned), while a long press still opens the paragraph
 * comment dialog and tapping a comment badge opens its thread.
 */
export type NovelScrollBodyProps = {
	readonly document: NovelDocument
	readonly settings: NovelSettings
	readonly onScrollAnchorChange: (anchor: NovelScrollAnchor) => void
	readonly onParagraphLongPress: (idx: number) => void
	readonly onParagraphCommentTap: (idx: number) => void
	readonly commentsByParagraph: ReadonlyMap<number, readonly Message[]>
	readonly scrollToAnchor: NovelScrollAnchor | undefined
	readonly onAnchorHandled: () => void
	readonly onProgressChange: (progress: number) => void
	/** Toggle the immersive chrome (mobile). Absent leaves taps inert. */
	readonly onToggleChrome?: () => void
	/** Compact (below-md) column insets on mobile. */
	readonly compact?: boolean
}

export function NovelScrollBody(props: NovelScrollBodyProps) {
	const {
		document,
		settings,
		onScrollAnchorChange,
		onParagraphLongPress,
		onParagraphCommentTap,
		commentsByParagraph,
		scrollToAnchor,
		onAnchorHandled,
		onProgressChange,
		onToggleChrome,
		compact,
	} = props
	const containerRef = useRef<HTMLDivElement | null>(null)

	const { onScroll } = useNovelScroll({
		containerRef,
		settings,
		document,
		onScrollAnchorChange,
		scrollToAnchor,
		onAnchorHandled,
		onProgressChange,
	})

	const pressHandlers = useParagraphPress({
		containerRef,
		onLongPress: onParagraphLongPress,
		onCommentBadgeTap: onParagraphCommentTap,
		onTapBack: noop,
		onTapForward: noop,
		onTapCenter: onToggleChrome,
	})

	const baseStyle = useMemo(
		() => novelParagraphBaseStyle(settings),
		[
			settings.fontSize,
			settings.lineHeight,
			settings.letterSpacing,
			settings.fontRole,
		],
	)

	return (
		<div
			ref={containerRef}
			data-testid="novel-scroll-body"
			className={`relative h-full w-full touch-pan-y overflow-y-auto ${
				compact ? "select-none" : "select-text"
			}`}
			onScroll={onScroll}
			onPointerDown={pressHandlers.onPointerDown}
			onPointerMove={pressHandlers.onPointerMove}
			onPointerUp={pressHandlers.onPointerUp}
			onPointerCancel={pressHandlers.onPointerCancel}
			onContextMenu={pressHandlers.onContextMenu}
		>
			<div
				className="mx-auto w-full px-6"
				style={{ maxWidth: settings.readingWidth }}
			>
				{document.paragraphs.map(function renderParagraph(p) {
					return (
						<NovelParagraphView
							key={p.index}
							paragraph={p}
							baseStyle={baseStyle}
							commentCount={commentsByParagraph.get(p.index)?.length ?? 0}
						/>
					)
				})}
			</div>
		</div>
	)
}

function noop() {
	// Scroll mode has no tap-to-turn gesture; a plain tap is inert.
}
