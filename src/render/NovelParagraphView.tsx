import { cn } from "@hoardodile/ui/lib/utils"
import type { NovelSettings } from "../prefs"
import type { NovelChunk } from "./chunks"

export type ParagraphBaseStyle = Readonly<{
	fontFamily: string
	fontSize: string
	lineHeight: number
	letterSpacing: string
}>

/**
 * The reading-voice typography for body paragraphs. Reading content
 * speaks the doc serif (`--font-doc`) unless the user opts into the app
 * sans (`--font-sans`); size/line/letter come from the user's settings.
 */
export function novelParagraphBaseStyle(
	settings: NovelSettings,
): ParagraphBaseStyle {
	return {
		fontFamily:
			settings.fontRole === "sans" ? "var(--font-sans)" : "var(--font-doc)",
		fontSize: `${settings.fontSize}px`,
		lineHeight: settings.lineHeight,
		letterSpacing: `${settings.letterSpacing}em`,
	}
}

const CHAPTER_PARAGRAPH_OVERRIDES = {
	// Treat chapter headings as a page break only — the next paragraph
	// continues in the same column right below the heading instead of
	// each chapter title eating an entire otherwise-empty page. The
	// heading's top/bottom margin lives in `.novel-chapter-heading`
	// (index.css) so it can shrink on narrow (phone) viewports.
	breakBefore: "column",
	breakInside: "avoid",
	textAlign: "center",
	textIndent: 0,
} as const

export function NovelParagraphView(props: {
	readonly paragraph: NovelChunk["paragraphs"][number]
	readonly baseStyle: ParagraphBaseStyle
	readonly commentCount: number
}) {
	const { paragraph: p, baseStyle, commentCount } = props
	const paragraphStyle = p.isChapterHeading
		? { ...baseStyle, ...CHAPTER_PARAGRAPH_OVERRIDES }
		: {
				...baseStyle,
				// Chinese typesetting convention: indent the first line of
				// every body paragraph by two full-width characters. `2em`
				// ≈ two CJK glyphs at the configured `fontSize`.
				textIndent: "2em",
			}
	return (
		<p
			data-pidx={p.index}
			className={cn(
				"wrap-break-word py-1 transition-colors",
				p.isChapterHeading && "novel-chapter-heading font-semibold",
			)}
			style={paragraphStyle}
		>
			{p.text}
			{commentCount > 0 ? (
				<span
					data-novel-comment-badge
					className="ml-2 mb-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/12 px-1.5 text-xs tabular-nums align-top text-primary"
				>
					{commentCount}
				</span>
			) : null}
		</p>
	)
}
