import { Button } from "@hoardodile/ui/components/button"
import { Icon } from "@hoardodile/ui/components/icon"
import { DocumentText, List, Settings } from "@hoardodile/ui/icons/registry"
import { useTranslation } from "../i18n"

/**
 * Persistent vertical function rail for non-mobile viewports: chapters,
 * settings, and (when paged) a page-number jump dialog. The reader keeps a
 * narrow left column for controls (no border — it blends with the canvas)
 * while the reading surface occupies the rest. The corner HUD
 * (chapter / page / time) stays over the content and never overlaps it.
 */
export function NovelSideRail(props: {
	readonly showPageJump: boolean
	readonly onOpenPageJump: () => void
	readonly onOpenChapters: () => void
	readonly onOpenSettings: () => void
}) {
	const { showPageJump, onOpenPageJump, onOpenChapters, onOpenSettings } = props
	const { t } = useTranslation()
	return (
		<div
			className="flex w-11 shrink-0 flex-col items-center gap-1 bg-background py-2"
			data-testid="novel-side-rail"
		>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				onClick={onOpenChapters}
				aria-label={t("chapters")}
				title={t("chapters")}
			>
				<Icon icon={List} />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				onClick={onOpenSettings}
				aria-label={t("settings")}
				title={t("settings")}
			>
				<Icon icon={Settings} />
			</Button>
			{showPageJump ? (
				<>
					<div className="my-1 h-px w-5 bg-border" />
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={onOpenPageJump}
						aria-label={t("pageJump")}
						title={t("pageJump")}
					>
						<Icon icon={DocumentText} />
					</Button>
				</>
			) : null}
		</div>
	)
}
