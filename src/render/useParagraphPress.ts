import { useCallback, useRef } from "react"

/**
 * Press gestures over the novel text. On touch/pen a long press opens the
 * paragraph's comment dialog during the hold; on mouse the same dialog is
 * opened by right-click (`onContextMenu`), so left-drag text selection and
 * left-tap paging are unaffected. A tap on a comment badge opens that
 * paragraph's thread, a plain tap turns the page (left/right or centre
 * toggle), and a drag cancels everything.
 */

const LONG_PRESS_MS = 450
const TAP_MOVE_TOLERANCE_PX = 8
// Horizontal tap zones (as fractions of the container width) when a
// center action is wired: the middle band toggles the chrome, the
// outer bands page back/forward (paged) or do nothing (scroll).
const CENTER_ZONE_START = 0.3
const CENTER_ZONE_END = 0.7

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
	readonly onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function useParagraphPress(opts: {
	readonly containerRef: React.RefObject<HTMLDivElement | null>
	readonly onLongPress: (paragraphIndex: number) => void
	readonly onCommentBadgeTap: (paragraphIndex: number) => void
	readonly onTapBack: () => void
	readonly onTapForward: () => void
	/** When provided, the middle third of a tap toggles this instead of
	    paging. Absent keeps the old left/right half-split. */
	readonly onTapCenter?: () => void
}): ParagraphPressHandlers {
	const {
		containerRef,
		onLongPress,
		onCommentBadgeTap,
		onTapBack,
		onTapForward,
		onTapCenter,
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
			// Long press opens the comment dialog during the hold on
			// touch/pen; mouse uses right-click (onContextMenu) instead so
			// text selection and paging stay free.
			let timer = 0
			if (e.pointerType !== "mouse") {
				timer = window.setTimeout(function fire() {
					const tracker = pressRef.current
					if (tracker === undefined || tracker.tappedBadge) return
					tracker.fired = true
					if (tracker.paragraph >= 0) onLongPress(tracker.paragraph)
				}, LONG_PRESS_MS)
			}
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
			const rel = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0
			const action = resolveTapAction(rel, onTapCenter !== undefined)
			if (action === "back") onTapBack()
			else if (action === "forward") onTapForward()
			else onTapCenter?.()
		},
		[
			clearPress,
			containerRef,
			onCommentBadgeTap,
			onTapBack,
			onTapForward,
			onTapCenter,
		],
	)

	const onPointerCancel = useCallback(() => {
		clearPress()
	}, [clearPress])

	// Desktop entry point for the comment dialog: right-click a paragraph.
	// preventDefault blocks the native menu so the reader owns the gesture,
	// and the desktop long-press timer is deliberately not armed above. The
	// whole paragraph is selected so the user sees exactly which block the
	// comment targets (and can copy it with Ctrl+C).
	const onContextMenu = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const target = e.target
			if (!(target instanceof HTMLElement)) return
			const paragraphEl = target.closest("[data-pidx]")
			if (!(paragraphEl instanceof HTMLElement)) return
			const paragraphIndex = Number(paragraphEl.dataset.pidx)
			if (Number.isNaN(paragraphIndex)) return
			e.preventDefault()
			selectParagraphContents(paragraphEl)
			onLongPress(paragraphIndex)
		},
		[onLongPress],
	)

	return {
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onPointerCancel,
		onContextMenu,
	}
}

/**
 * Select a paragraph's text (excluding its trailing comment badge) so the
 * whole block is highlighted — feedback for "which sentence am I commenting
 * on" — and remains copyable.
 */
function selectParagraphContents(el: HTMLElement): void {
	const range = document.createRange()
	const badge = el.querySelector("[data-novel-comment-badge]")
	if (badge !== null) {
		range.setStart(el, 0)
		range.setEnd(badge, 0)
	} else {
		range.selectNodeContents(el)
	}
	const selection = window.getSelection()
	if (selection !== null) {
		selection.removeAllRanges()
		selection.addRange(range)
	}
}

/**
 * Horizontal tap zone for a container-relative X fraction. Without a wired
 * center action (desktop) the surface splits at half; with one (mobile)
 * the middle third toggles the chrome and the outer thirds page.
 */
export function resolveTapAction(
	rel: number,
	hasCenter: boolean,
): "back" | "forward" | "center" {
	if (!hasCenter) return rel < 0.5 ? "back" : "forward"
	if (rel < CENTER_ZONE_START) return "back"
	if (rel > CENTER_ZONE_END) return "forward"
	return "center"
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
