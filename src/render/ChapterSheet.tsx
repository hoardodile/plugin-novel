import { ScrollArea } from "@hoardodile/ui/components/scroll-area"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@hoardodile/ui/components/sheet"
import { cn } from "@hoardodile/ui/lib/utils"
import type { NovelChapter } from "../core/document"
import { useTranslation } from "../i18n"

/**
 * Side sheet listing detected chapters. Clicking a row jumps to that
 * paragraph index and closes the sheet so the reader retains focus. The
 * current chapter is highlighted by a fill only — every row shares the
 * same ink so the list stays readable, and the active chapter is
 * distinguished by its accent fill.
 */
export function NovelChapterSheet(props: {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly chapters: readonly NovelChapter[]
	readonly currentParagraphIndex: number
	readonly onJump: (paragraphIndex: number) => void
}) {
	const { open, onOpenChange, chapters, currentParagraphIndex, onJump } = props
	const { t } = useTranslation()
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="left"
				showCloseButton={false}
				className="w-80"
				data-testid="novel-chapter-sheet"
			>
				<SheetHeader className="pb-0">
					<SheetTitle className="text-sm">{t("chapters")}</SheetTitle>
					<SheetDescription className="text-xs">
						{t("chaptersCount", { total: chapters.length })}
					</SheetDescription>
				</SheetHeader>
				<ScrollArea className="h-full">
					{chapters.length === 0 ? (
						<p className="px-3 py-4 text-sm text-muted-foreground">
							{t("chaptersEmpty")}
						</p>
					) : (
						<ol className="flex flex-col gap-1 px-2 pb-2">
							{chapters.map(function renderChapter(chapter) {
								const isActive = chapter.paragraphIndex <= currentParagraphIndex
								return (
									<li key={chapter.paragraphIndex}>
										<button
											type="button"
											onClick={() => {
												onJump(chapter.paragraphIndex)
												onOpenChange(false)
											}}
											className={cn(
												"flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors",
												isActive
													? "bg-accent text-accent-foreground"
													: "text-foreground hover:bg-accent",
											)}
										>
											<span className="truncate">{chapter.title}</span>
										</button>
									</li>
								)
							})}
						</ol>
					)}
				</ScrollArea>
			</SheetContent>
		</Sheet>
	)
}
