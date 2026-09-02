import { MOBILE_QUERY } from "@hoardodile/ui/viewport"
import { useEffect, useState } from "react"

/**
 * Reactive below-md (phone) detection. Uses the same `MOBILE_QUERY` the
 * design system uses (`@hoardodile/ui/viewport`) via `matchMedia`, so JS
 * and CSS breakpoints never disagree — and it avoids depending on
 * `react-use`, which the `use-mobile` hook imports but a plugin does not
 * ship. Under jsdom `matchMedia` returns `false`, so tests stay on the
 * desktop path.
 */
export function useIsMobile(): boolean {
	const [mobile, setMobile] = useState(
		() =>
			typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches,
	)
	useEffect(function subscribe() {
		if (typeof window === "undefined") return
		const mq = window.matchMedia(MOBILE_QUERY)
		function update() {
			setMobile(mq.matches)
		}
		update()
		mq.addEventListener?.("change", update)
		return () => mq.removeEventListener?.("change", update)
	}, [])
	return mobile
}

/** Local time as `HH:mm` (24h), refreshed periodically. */
export function useCurrentTime(): string {
	const [time, setTime] = useState(formatTime)
	useEffect(function tick() {
		const id = setInterval(function update() {
			setTime(formatTime())
		}, 30_000)
		return () => clearInterval(id)
	}, [])
	return time
}

function formatTime(): string {
	const now = new Date()
	const h = String(now.getHours()).padStart(2, "0")
	const m = String(now.getMinutes()).padStart(2, "0")
	return `${h}:${m}`
}
