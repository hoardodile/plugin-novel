import { useTranslation } from "../i18n"

/**
 * Real top strip (in flow) that carries the current chapter name in the
 * top-left corner. It occupies layout space so the reading content sits
 * genuinely below it in both paged and scroll mode — no overlay, no
 * margin-hack to dodge the corner. Top-right is intentionally empty.
 */
export function NovelReadingTopStrip(props: { readonly chapterTitle: string }) {
	const { chapterTitle } = props
	const { t } = useTranslation()
	return (
		<div
			className="flex h-7 shrink-0 items-center px-3"
			data-testid="novel-reading-top"
		>
			<span className="truncate text-xs text-muted-foreground">
				{chapterTitle || t("untitled")}
			</span>
		</div>
	)
}
