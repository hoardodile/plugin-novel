import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Button } from "@hoardodile/ui/components/button"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { SectionLabel } from "@hoardodile/ui/components/section-label"
import { Slider } from "@hoardodile/ui/components/slider"
import { Switch } from "@hoardodile/ui/components/switch"
import { TEXT_ENCODING_OPTIONS } from "../core/charset"
import { useTranslation } from "../i18n"
import type { NovelSettings } from "../prefs"

/** Neutral fallback for a freshly chosen custom theme. */
const CUSTOM_BG_FALLBACK = "#d9c7a3"
const CUSTOM_FG_FALLBACK = "#302202"

const THEME_OPTIONS = [
	{ value: "inherit", labelKey: "themeInherit" },
	{ value: "parchment", labelKey: "themeParchment" },
	{ value: "sage", labelKey: "themeSage" },
	{ value: "azure", labelKey: "themeAzure" },
	{ value: "hoardodile", labelKey: "themeHoardodile" },
	{ value: "custom", labelKey: "themeCustom" },
] as const

const ENCODING_LABELS: Record<string, string> = {
	auto: "encodingAuto",
	"utf-8": "encodingUtf8",
	gb18030: "encodingGbk",
	"shift-jis": "encodingSjis",
	big5: "encodingBig5",
	"utf-16le": "encodingUtf16",
}

/**
 * Reader settings: theme (inherit / palette / custom colour), reading
 * mode, typography and encoding. Built from design-system primitives with
 * their default config — no hand-tuned classNames on the components.
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
			contentTestId="novel-settings-dialog"
		>
			<div className="flex flex-col gap-5 pb-4">
				<section className="flex flex-col gap-2">
					<SectionLabel>{t("theme")}</SectionLabel>
					<ThemePicker settings={settings} onChange={onChange} />
				</section>

				<section className="flex flex-col gap-2">
					<SectionLabel>{t("readingMode")}</SectionLabel>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="secondary"
							active={settings.readingMode === "paged"}
							aria-pressed={settings.readingMode === "paged"}
							onClick={() => patch({ readingMode: "paged" })}
							data-testid="novel-mode-paged"
						>
							{t("modePaged")}
						</Button>
						<Button
							type="button"
							variant="secondary"
							active={settings.readingMode === "scroll"}
							aria-pressed={settings.readingMode === "scroll"}
							onClick={() => patch({ readingMode: "scroll" })}
							data-testid="novel-mode-scroll"
						>
							{t("modeScroll")}
						</Button>
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>{t("typography")}</SectionLabel>
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
										(typeof v === "number" ? v : v[0]) ??
										settings.letterSpacing,
								})
							}
						/>
					</SettingRow>
					<SettingRow
						label={t("readingFont")}
						value={settings.fontRole === "doc" ? t("fontSerif") : t("fontSans")}
					>
						<Switch
							checked={settings.fontRole === "doc"}
							onCheckedChange={(checked) =>
								patch({ fontRole: checked ? "doc" : "sans" })
							}
							data-testid="novel-font-role-switch"
						/>
					</SettingRow>
					{settings.readingMode === "scroll" ? (
						<SettingRow
							label={t("readingWidth")}
							value={`${settings.readingWidth}px`}
						>
							<DropdownSelect
								value={String(settings.readingWidth)}
								onValueChange={(value) =>
									patch({ readingWidth: Number(value) })
								}
								options={[
									{ value: "680", label: "680px" },
									{ value: "800", label: "800px" },
								]}
								data-testid="novel-width-select"
							/>
						</SettingRow>
					) : null}
				</section>

				<section className="flex flex-col gap-2">
					<SectionLabel>{t("advanced")}</SectionLabel>
					<span className="text-xs text-muted-foreground">{t("encoding")}</span>
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
				</section>
			</div>
		</AppDialog>
	)
}

function ThemePicker(props: {
	readonly settings: NovelSettings
	readonly onChange: (next: NovelSettings) => void
}) {
	const { settings, onChange } = props
	const { t } = useTranslation()
	const theme = settings.theme
	const current =
		theme.kind === "inherit"
			? "inherit"
			: theme.kind === "custom"
				? "custom"
				: (theme.palette ?? "parchment")
	const bg =
		theme.kind === "custom"
			? (theme.bg ?? CUSTOM_BG_FALLBACK)
			: CUSTOM_BG_FALLBACK
	const fg =
		theme.kind === "custom"
			? (theme.fg ?? CUSTOM_FG_FALLBACK)
			: CUSTOM_FG_FALLBACK

	function onThemeChange(value: string) {
		if (value === "inherit") {
			onChange({ ...settings, theme: { kind: "inherit" } })
		} else if (value === "custom") {
			onChange({ ...settings, theme: { kind: "custom", bg, fg } })
		} else {
			onChange({ ...settings, theme: { kind: "palette", palette: value } })
		}
	}

	function patchCustom(patch: Partial<{ bg: string; fg: string }>) {
		onChange({
			...settings,
			theme: { kind: "custom", bg, fg, ...patch },
		})
	}

	return (
		<div className="flex flex-col gap-3">
			<DropdownSelect
				value={current}
				onValueChange={onThemeChange}
				options={THEME_OPTIONS.map((o) => ({
					value: o.value,
					label: t(o.labelKey),
				}))}
				data-testid="novel-theme-select"
			/>
			{theme.kind === "custom" ? (
				<div className="flex flex-col gap-2">
					<ColorRow
						label={t("bgColor")}
						value={bg}
						onChange={(color) => patchCustom({ bg: color })}
					/>
					<ColorRow
						label={t("fgColor")}
						value={fg}
						onChange={(color) => patchCustom({ fg: color })}
					/>
				</div>
			) : null}
		</div>
	)
}

function ColorRow(props: {
	readonly label: string
	readonly value: string
	readonly onChange: (color: string) => void
}) {
	const { label, value, onChange } = props
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-xs text-muted-foreground">{label}</span>
			<label className="flex items-center gap-2">
				<input
					type="color"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
					aria-label={label}
				/>
				<span className="text-xs tabular-nums text-muted-foreground">
					{value}
				</span>
			</label>
		</div>
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
				<span className="text-xs text-muted-foreground">{props.label}</span>
				<span className="text-xs tabular-nums text-muted-foreground">
					{props.value}
				</span>
			</div>
			{props.children}
		</div>
	)
}
