import { Button } from "@hoardodile/ui/components/button"
import { useTranslation } from "../i18n"
import { useCurrentTime } from "./useReaderViewport"

/**
 * Real bottom strip (in flow) that carries the reading position (bottom-left)
 * and the local time (bottom-right). On desktop paged it also hosts the
 * prev/next-page text buttons; the strip occupies layout space so the reading
 * content sits genuinely above it (paged and scroll alike). No border — the
 * strip blends with the canvas and the content simply ends above it.
 */
export function NovelReadingBottomStrip(props: {
	readonly paged: boolean
	readonly compact: boolean
	readonly positionLabel: string
	readonly canPrevPage: boolean
	readonly canNextPage: boolean
	readonly onPrevPage: () => void
	readonly onNextPage: () => void
}) {
	const {
		paged,
		compact,
		positionLabel,
		canPrevPage,
		canNextPage,
		onPrevPage,
		onNextPage,
	} = props
	const { t } = useTranslation()
	const time = useCurrentTime()
	// Prev/next page is a desktop-only control; mobile taps to page-turn.
	const showPageNav = paged && !compact
	return (
		<div
			className="flex h-9 shrink-0 items-center justify-between gap-2 px-3"
			data-testid="novel-reading-bottom"
		>
			<span className="truncate text-xs tabular-nums text-muted-foreground">
				{positionLabel}
			</span>
			{showPageNav ? (
				<div className="flex shrink-0 items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="text-xs"
						onClick={onPrevPage}
						disabled={!canPrevPage}
						aria-label={t("prevPage")}
					>
						{t("prevPage")}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="text-xs"
						onClick={onNextPage}
						disabled={!canNextPage}
						aria-label={t("nextPage")}
					>
						{t("nextPage")}
					</Button>
				</div>
			) : null}
			<span className="truncate text-xs tabular-nums text-muted-foreground">
				{time}
			</span>
		</div>
	)
}
