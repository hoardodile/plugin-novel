import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useCurrentTime, useIsMobile } from "./useReaderViewport"

function MobileProbe() {
	const mobile = useIsMobile()
	return <span data-testid="mobile">{String(mobile)}</span>
}

describe("useIsMobile", () => {
	it("is false under the jsdom matchMedia stub (desktop path)", () => {
		render(<MobileProbe />)
		expect(screen.getByTestId("mobile").textContent).toBe("false")
	})
})

function TimeProbe() {
	const time = useCurrentTime()
	return <span data-testid="time">{time}</span>
}

describe("useCurrentTime", () => {
	it("formats the time as HH:mm", () => {
		render(<TimeProbe />)
		expect(screen.getByTestId("time").textContent).toMatch(/^\d{2}:\d{2}$/)
	})
})
