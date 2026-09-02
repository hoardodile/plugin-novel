import { Button } from "@hoardodile/ui/components/button"
import { Icon } from "@hoardodile/ui/components/icon"
import { DocumentText, List, Settings } from "@hoardodile/ui/icons/registry"
import { useTranslation } from "../i18n"

/**
 * Floating toolbar revealed on a mobile center-tap. It sits above the
 * bottom corner labels (chapter / page / time stay on the always-on HUD),
 * centered as a floating card — a separate layer, never merged into the
 * bottom edge. The wrapper is pointer-transparent so taps around the pill
 * still reach the reading surface (left/right page-turn, center toggle).
 */
export function NovelFloatingToolbar(props: {
	readonly showPageJump: boolean
	readonly onOpenPageJump: () => void
	readonly onOpenChapters: () => void
	readonly onOpenSettings: () => void
}) {
	const { showPageJump, onOpenPageJump, onOpenChapters, onOpenSettings } = props
	const { t } = useTranslation()
	return (
		<div
			className="pointer-events-none absolute inset-x-0 bottom-12 z-20 flex justify-center"
			data-testid="novel-toolbar"
		>
			<div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-card px-2 py-1 shadow-card">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={onOpenChapters}
					aria-label={t("chapters")}
				>
					<Icon icon={List} />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={onOpenSettings}
					aria-label={t("settings")}
				>
					<Icon icon={Settings} />
				</Button>
				{showPageJump ? (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={onOpenPageJump}
						aria-label={t("pageJump")}
					>
						<Icon icon={DocumentText} />
					</Button>
				) : null}
			</div>
		</div>
	)
}
