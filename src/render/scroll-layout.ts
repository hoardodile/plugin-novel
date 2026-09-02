/**
 * Pure geometry for the novel reader's continuous (scroll) mode. The
 * vertical analogue of `column-layout.ts`: given measured paragraph
 * boxes within the scroll content, map the scroll position to a stable
 * reflow-invariant anchor and back, and tally reading progress.
 *
 * Nothing here needs React or the DOM once paragraph boxes have been
 * measured, so it can be reasoned about — and tested — on its own.
 */

export type VerticalBox = {
	readonly top: number
	readonly height: number
}

export type VerticalBoxes = ReadonlyMap<number, VerticalBox>

/**
 * Reflow-invariant reading position: the paragraph at the scroll
 * container's top edge, plus how far along that paragraph the edge
 * falls. The fraction is what survives a font-size or viewport change —
 * the absolute scroll offset does not.
 */
export type NovelScrollAnchor = {
	readonly paragraphIndex: number
	readonly fraction: number
}

/**
 * Find the anchor for a given scroll position: the paragraph whose
 * vertical span contains `scrollTop` (content-relative), and the fraction
 * of that paragraph the top edge sits at. Clamps to a paragraph when a
 * gap exists, and returns the first/last paragraph on the edges.
 */
export function boxAtScrollTop(
	scrollTop: number,
	boxes: VerticalBoxes,
): NovelScrollAnchor | undefined {
	if (boxes.size === 0) return undefined
	const top = Math.max(0, scrollTop)
	let last:
		| { readonly pidx: number; readonly top: number; readonly height: number }
		| undefined
	for (const [pidx, box] of boxes) {
		const height = Math.max(1, box.height)
		if (box.top <= top && top < box.top + height) {
			return {
				paragraphIndex: pidx,
				fraction: clamp01((top - box.top) / height),
			}
		}
		if (box.top > top) break
		last = { pidx, top: box.top, height }
	}
	if (last === undefined) {
		const first = boxes.entries().next().value as
			| [number, VerticalBox]
			| undefined
		if (first === undefined) return undefined
		return { paragraphIndex: first[0], fraction: 0 }
	}
	return {
		paragraphIndex: last.pidx,
		fraction: clamp01((top - last.top) / last.height),
	}
}

/**
 * The scroll offset that places an anchor's point at the top of the
 * scroll container. `fraction` selects how far down the paragraph the
 * top edge should sit (0 = the paragraph's own top).
 */
export function anchorToScrollTop(
	anchor: NovelScrollAnchor,
	boxes: VerticalBoxes,
): number {
	const box = boxes.get(anchor.paragraphIndex)
	if (box === undefined) return 0
	return box.top + clamp01(anchor.fraction) * Math.max(1, box.height)
}

/**
 * Reading progress of the whole book as a 0..1 fraction of the scrollable
 * range — the analogue of paged mode's `currentPage / totalPages`.
 */
export function scrollProgress(
	scrollTop: number,
	scrollHeight: number,
	clientHeight: number,
): number {
	const denom = scrollHeight - clientHeight
	if (denom <= 0) return 1
	return clamp01(scrollTop / denom)
}

/**
 * The chapter whose heading is at or above the given paragraph index —
 * the "which chapter am I in" answer used by the chrome.
 */
export function chapterForParagraph(
	chapters: readonly {
		readonly paragraphIndex: number
		readonly title: string
	}[],
	paragraphIndex: number,
): { readonly paragraphIndex: number; readonly title: string } | undefined {
	let current: { paragraphIndex: number; title: string } | undefined
	for (const chapter of chapters) {
		if (chapter.paragraphIndex <= paragraphIndex) current = chapter
		else break
	}
	return current
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value))
}
