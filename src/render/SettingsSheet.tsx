import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { Slider } from "@hoardodile/ui/components/slider"
import { cn } from "@hoardodile/ui/lib/utils"
import { TEXT_ENCODING_OPTIONS } from "../core/charset"
import { useTranslation } from "../i18n"
import { NOVEL_BG_COLOR_PRESETS, type NovelSettings } from "../prefs"

const BG_LABELS: Record<string, string> = {
	paper: "bgPaper",
	green: "bgGreen",
	dark: "bgDark",
	black: "bgBlack",
	white: "bgWhite",
}

const ENCODING_LABELS: Record<string, string> = {
	auto: "encodingAuto",
	"utf-8": "encodingUtf8",
	gb18030: "encodingGbk",
	"shift-jis": "encodingSjis",
	big5: "encodingBig5",
	"utf-16le": "encodingUtf16",
}

/**
 * Right-hand sheet exposing the per-user novel settings: typography
 * (font / line / letter spacing) and background colour. The reader is
 * paged-only, so no layout toggle is exposed here. The chapter regex
 * override is intentionally kept out of this sheet because most users
 * never need it; it's reachable through a separate "advanced" path.
 */
export function NovelSettingsSheet(props: {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly settings: NovelSettings
	readonly onChange: (next: NovelSettings) => void
}) {
	const { open, onOpenChange, settings, onChange } = props
	const { t } = useTranslation()
	function patch(next: Partial<NovelSettings>) {
		onChange({ ...settings, ...next })
	}
	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("settings")}
			contentClassName="sm:max-w-md"
			contentTestId="novel-settings-dialog"
		>
			<div className="flex flex-col gap-5">
				<SettingRow label={t("fontSize")} value={`${settings.fontSize}px`}>
					<Slider
						min={12}
						max={32}
						step={1}
						value={[settings.fontSize]}
						onValueChange={(v) =>
							patch({
								fontSize:
									(typeof v === "number" ? v : v[0]) ?? settings.fontSize,
							})
						}
					/>
				</SettingRow>
				<SettingRow
					label={t("lineHeight")}
					value={settings.lineHeight.toFixed(2)}
				>
					<Slider
						min={1.2}
						max={2.6}
						step={0.05}
						value={[settings.lineHeight]}
						onValueChange={(v) =>
							patch({
								lineHeight:
									(typeof v === "number" ? v : v[0]) ?? settings.lineHeight,
							})
						}
					/>
				</SettingRow>
				<SettingRow
					label={t("letterSpacing")}
					value={`${settings.letterSpacing.toFixed(2)}em`}
				>
					<Slider
						min={0}
						max={0.2}
						step={0.01}
						value={[settings.letterSpacing]}
						onValueChange={(v) =>
							patch({
								letterSpacing:
									(typeof v === "number" ? v : v[0]) ?? settings.letterSpacing,
							})
						}
					/>
				</SettingRow>
				<div className="flex flex-col gap-2">
					<span className="text-xs font-medium text-muted-foreground">
						{t("encoding")}
					</span>
					<DropdownSelect
						value={settings.encoding}
						onValueChange={(value) =>
							patch({ encoding: value as NovelSettings["encoding"] })
						}
						options={TEXT_ENCODING_OPTIONS.map((enc) => ({
							value: enc,
							label: t(ENCODING_LABELS[enc] ?? enc),
						}))}
						data-testid="novel-encoding-select"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<span className="text-xs font-medium text-muted-foreground">
						{t("background")}
					</span>
					<div className="flex flex-wrap gap-2">
						{NOVEL_BG_COLOR_PRESETS.map((p) => (
							<button
								type="button"
								key={p.id}
								onClick={() => patch({ bgKind: "color", bgColor: p.value })}
								className={cn(
									"h-8 w-8 rounded-full border-2 transition",
									settings.bgKind === "color" && settings.bgColor === p.value
										? "border-primary ring-2 ring-primary/30"
										: "border-transparent",
								)}
								style={{ background: p.value }}
								aria-label={t(BG_LABELS[p.id] ?? p.id)}
							/>
						))}
					</div>
				</div>
			</div>
		</AppDialog>
	)
}

function SettingRow(props: {
	readonly label: string
	readonly value: string
	readonly children: React.ReactNode
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium text-muted-foreground">
					{props.label}
				</span>
				<span className="text-xs tabular-nums text-muted-foreground">
					{props.value}
				</span>
			</div>
			{props.children}
		</div>
	)
}
