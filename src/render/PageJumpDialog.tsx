import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Button } from "@hoardodile/ui/components/button"
import { Input } from "@hoardodile/ui/components/input"
import { useEffect, useState } from "react"
import { useTranslation } from "../i18n"

/**
 * Page-number jump dialog (paged mode). Shows the current page / total and
 * lets the user type a page to jump straight to it. The buttons live in the
 * dialog footer (Cancel + Jump, no icon); the reader owns the navigation via
 * `scrollToPage`.
 */
export function PageJumpDialog(props: {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly currentPage: number
	readonly totalPages: number
	readonly onJump: (page: number) => void
}) {
	const { open, onOpenChange, currentPage, totalPages, onJump } = props
	const { t } = useTranslation()
	const [draft, setDraft] = useState("")

	useEffect(
		function resetOnOpen() {
			if (open) setDraft(String(currentPage))
		},
		[open, currentPage],
	)

	function commit() {
		const parsed = Number.parseInt(draft, 10)
		if (Number.isNaN(parsed)) return
		onJump(Math.max(1, Math.min(totalPages, parsed)))
	}

	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("pageJump")}
			contentTestId="novel-page-jump-dialog"
			footer={
				<>
					<Button
						type="button"
						variant="secondary"
						onClick={() => onOpenChange(false)}
					>
						{t("cancel")}
					</Button>
					<Button
						type="button"
						onClick={commit}
						disabled={Number.isNaN(Number.parseInt(draft, 10))}
					>
						{t("jump")}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-3">
				<p className="text-xs text-muted-foreground">
					{t("pageJumpCurrent", { current: currentPage, total: totalPages })}
				</p>
				<Input
					type="text"
					inputMode="numeric"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") commit()
					}}
					placeholder={t("pagePlaceholder")}
					aria-label={t("pagePlaceholder")}
				/>
			</div>
		</AppDialog>
	)
}
