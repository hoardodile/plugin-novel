import { useCallback, useRef } from "react"

/**
 * Press gestures over the novel text. Three outcomes share one press:
 * a long press opens the paragraph's comment dialog, a tap on a comment
 * badge opens that paragraph's thread, and a plain tap turns the page
 * (left half back, right half forward). A drag cancels all of them.
 */

const LONG_PRESS_MS = 450
const TAP_MOVE_TOLERANCE_PX = 8

type PressTracker = {
	readonly x: number
	readonly y: number
	readonly timer: number
	readonly paragraph: number
	readonly tappedBadge: boolean
	fired: boolean
}

export type ParagraphPressHandlers = {
	readonly onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
	readonly onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
	readonly onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
	readonly onPointerCancel: () => void
}

export function useParagraphPress(opts: {
	readonly containerRef: React.RefObject<HTMLDivElement | null>
	readonly onLongPress: (paragraphIndex: number) => void
	readonly onCommentBadgeTap: (paragraphIndex: number) => void
	readonly onTapBack: () => void
	readonly onTapForward: () => void
}): ParagraphPressHandlers {
	const {
		containerRef,
		onLongPress,
		onCommentBadgeTap,
		onTapBack,
		onTapForward,
	} = opts
	const pressRef = useRef<PressTracker | undefined>(undefined)

	const clearPress = useCallback(() => {
		const tracker = pressRef.current
		if (tracker === undefined) return undefined
		window.clearTimeout(tracker.timer)
		pressRef.current = undefined
		return tracker
	}, [])

	const onPointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			// Ignore secondary buttons; only finger / pen / left-click open
			// page turns and long-press dialogs.
			if (e.pointerType === "mouse" && e.button !== 0) return
			const target = e.target
			if (!(target instanceof HTMLElement)) return
			const { tappedBadge, paragraphIndex } = resolvePressTarget(target)
			const timer = window.setTimeout(function fire() {
				const tracker = pressRef.current
				if (tracker === undefined || tracker.tappedBadge) return
				tracker.fired = true
				if (tracker.paragraph >= 0) onLongPress(tracker.paragraph)
			}, LONG_PRESS_MS)
			pressRef.current = {
				x: e.clientX,
				y: e.clientY,
				timer,
				paragraph: paragraphIndex,
				tappedBadge,
				fired: false,
			}
		},
		[onLongPress],
	)

	const onPointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const tracker = pressRef.current
			if (tracker === undefined) return
			const dx = Math.abs(e.clientX - tracker.x)
			const dy = Math.abs(e.clientY - tracker.y)
			if (dx > TAP_MOVE_TOLERANCE_PX || dy > TAP_MOVE_TOLERANCE_PX) {
				clearPress()
			}
		},
		[clearPress],
	)

	const onPointerUp = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const tracker = clearPress()
			if (tracker === undefined || tracker.fired) return
			if (tracker.tappedBadge) {
				if (tracker.paragraph >= 0) onCommentBadgeTap(tracker.paragraph)
				return
			}
			const root = containerRef.current
			if (root === null) return
			const rect = root.getBoundingClientRect()
			if (e.clientX - rect.left < rect.width / 2) onTapBack()
			else onTapForward()
		},
		[clearPress, containerRef, onCommentBadgeTap, onTapBack, onTapForward],
	)

	const onPointerCancel = useCallback(() => {
		clearPress()
	}, [clearPress])

	return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}

/** What the press gesture should mean for the element that received it. */
export type PressTarget = {
	/** Paragraph index under the target, or -1 outside any paragraph. */
	readonly paragraphIndex: number
	/** True when the press landed on a comment badge rather than text. */
	readonly tappedBadge: boolean
}

/**
 * Resolve a press target to its gesture meaning: the paragraph it
 * belongs to (via the `data-pidx` marker every rendered paragraph
 * carries) and whether it hit a comment badge. Pure and exported so
 * the target rules are testable without firing real pointer events.
 */
export function resolvePressTarget(target: HTMLElement): PressTarget {
	const tappedBadge = target.closest("[data-novel-comment-badge]") !== null
	const paragraphEl = target.closest("[data-pidx]")
	if (!(paragraphEl instanceof HTMLElement)) {
		return { paragraphIndex: -1, tappedBadge }
	}
	const raw = paragraphEl.dataset.pidx
	const parsed = raw !== undefined ? Number(raw) : Number.NaN
	return {
		paragraphIndex: Number.isNaN(parsed) ? -1 : parsed,
		tappedBadge,
	}
}
