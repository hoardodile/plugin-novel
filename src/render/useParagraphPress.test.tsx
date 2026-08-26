import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { NovelParagraphView } from "./NovelParagraphView"
import { resolvePressTarget } from "./useParagraphPress"

function paragraphElement(pidx: number, withBadge = false): HTMLElement {
	const p = document.createElement("p")
	p.dataset.pidx = String(pidx)
	if (withBadge) {
		const badge = document.createElement("span")
		badge.setAttribute("data-novel-comment-badge", "")
		p.appendChild(badge)
	}
	return p
}

describe("resolvePressTarget", () => {
	it("resolves the paragraph under the target", () => {
		const p = paragraphElement(3)
		expect(resolvePressTarget(p)).toEqual({
			paragraphIndex: 3,
			tappedBadge: false,
		})
	})

	it("marks a press on the comment badge", () => {
		const p = paragraphElement(7, true)
		const badge = p.querySelector("[data-novel-comment-badge]")
		if (badge === null) throw new Error("badge missing")
		expect(resolvePressTarget(badge as HTMLElement)).toEqual({
			paragraphIndex: 7,
			tappedBadge: true,
		})
	})

	it("resolves nested text nodes through the closest paragraph", () => {
		const p = paragraphElement(2)
		const nested = document.createElement("em")
		nested.textContent = "word"
		p.appendChild(nested)
		expect(resolvePressTarget(nested)).toEqual({
			paragraphIndex: 2,
			tappedBadge: false,
		})
	})

	it("reports -1 outside any paragraph", () => {
		const outside = document.createElement("div")
		expect(resolvePressTarget(outside)).toEqual({
			paragraphIndex: -1,
			tappedBadge: false,
		})
	})

	it("reports -1 for a malformed paragraph index", () => {
		const p = document.createElement("p")
		p.dataset.pidx = "not-a-number"
		expect(resolvePressTarget(p)).toEqual({
			paragraphIndex: -1,
			tappedBadge: false,
		})
	})
})

describe("NovelParagraphView badge", () => {
	const baseStyle = { fontSize: "18px", lineHeight: 1.8, letterSpacing: "0em" }

	it("marks the comment badge so presses on it open the thread", () => {
		const { container } = render(
			<NovelParagraphView
				paragraph={{ index: 0, text: "text", isChapterHeading: false }}
				baseStyle={baseStyle}
				commentCount={3}
			/>,
		)
		const badge = container.querySelector("[data-novel-comment-badge]")
		expect(badge).not.toBeNull()
		expect(badge?.textContent).toBe("3")
	})

	it("omits the badge without comments", () => {
		const { container } = render(
			<NovelParagraphView
				paragraph={{ index: 0, text: "text", isChapterHeading: false }}
				baseStyle={baseStyle}
				commentCount={0}
			/>,
		)
		expect(container.querySelector("[data-novel-comment-badge]")).toBeNull()
	})
})
