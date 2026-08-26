/**
 * Prose → {@link NovelDocument}. The document is the render-facing
 * model: a flat paragraph stream (stable global indices feed comments,
 * anchors and the reading position) plus a chapter table. Any source
 * format produces one through {@link buildNovelDocument}: units are
 * named chunks of prose (a chapter file, an epub spine entry, an fb2
 * section) that become chapter boundaries.
 *
 * Two boundary policies:
 * - **plain** (txt/md/html/docx): units are opaque text; chapters come
 *   from the chapter regex unless a unit already names itself.
 * - **structured** (epub/fb2): units carry authoritative titles;
 *   the regex is not consulted and duplicates are impossible.
 */

/**
 * Default chapter regex covering both Chinese (e.g. `第一章 …`,
 * `第十二卷 …`) and common English markers (`Chapter 5`, `Chapter I.`,
 * `Prologue`, `Epilogue` — Roman numerals cover classic Gutenberg
 * books). Users can override via the novel reader settings.
 */
export const DEFAULT_CHAPTER_REGEX_SOURCE =
	"^\\s*(?:第[\\d一二三四五六七八九十百千零两]+[章卷]|Chapter\\s+(?:\\d+|[IVXLCDM]+)|Prologue|Epilogue)" as const

export const DEFAULT_CHAPTER_REGEX_FLAGS = "i" as const

export type NovelParagraph = {
	readonly index: number
	readonly text: string
	readonly isChapterHeading: boolean
}

export type NovelChapter = {
	readonly paragraphIndex: number
	readonly title: string
}

export type NovelDocument = {
	readonly paragraphs: readonly NovelParagraph[]
	readonly chapters: readonly NovelChapter[]
}

/**
 * Strip the BOM, normalise CRLF/LF/CR to `\n`, and trim trailing
 * whitespace per line. Pure so reader components can re-parse on the
 * fly when the user changes the chapter regex without re-fetching.
 */
export function normalizeNovelText(raw: string): string {
	const bomStripped = raw.startsWith("\uFEFF") ? raw.slice(1) : raw
	return bomStripped.replace(/\r\n?/g, "\n")
}

/**
 * Split into paragraphs on any run of one-or-more newlines. Empty
 * paragraphs are dropped — they would otherwise inflate paragraph
 * indices and confuse the comment-anchor jump UI.
 */
export function splitNovelParagraphs(normalized: string): readonly string[] {
	return normalized
		.split(/\n+/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0)
}

export type ParseNovelOptions = {
	readonly chapterRegexSource?: string
	readonly chapterRegexFlags?: string
}

/**
 * Build a {@link NovelDocument} from raw text. Caller chooses whether
 * to use the default chapter regex or a user-supplied one (via
 * settings); we tolerate an invalid regex by falling back to the
 * default rather than throwing into the render path.
 */
export function parseNovel(
	raw: string,
	opts: ParseNovelOptions = {},
): NovelDocument {
	return buildNovelDocument([{ text: raw }], opts)
}

/**
 * Build a {@link NovelDocument} from text units. `structured` switches
 * the boundary policy: structured units are named by their titles and
 * the regex is not consulted; plain units fall back to the regex.
 */
export function buildNovelDocument(
	units: readonly { readonly title?: string; readonly text: string }[],
	opts: ParseNovelOptions & { readonly structured?: boolean } = {},
): NovelDocument {
	const { structured = false } = opts
	const chapterRegex = structured ? undefined : compileChapterRegex(opts)
	const paragraphs: NovelParagraph[] = []
	const chapters: NovelChapter[] = []
	let index = 0

	for (const unit of units) {
		const texts = splitNovelParagraphs(normalizeNovelText(unit.text))
		if (texts.length === 0) continue
		const title = unit.title?.trim()

		if (title !== undefined && title.length > 0) {
			// The unit names itself: mark the boundary paragraph as the
			// heading — either the unit already opens with its title, or
			// a title paragraph is injected so the boundary stays
			// visible in the flow.
			const boundaryIsFirst = texts[0] === title
			paragraphs.push({ index, text: title, isChapterHeading: true })
			index += 1
			chapters.push({ paragraphIndex: index - 1, title })
			const rest = boundaryIsFirst ? texts.slice(1) : texts
			if (structured) {
				for (const text of rest) {
					paragraphs.push({ index, text, isChapterHeading: false })
					index += 1
				}
				continue
			}
			// Plain mode: the boundary heading is a chapter already —
			// the regex must not record it twice.
			for (const text of rest) {
				const isHeading = chapterRegex!.test(text)
				paragraphs.push({ index, text, isChapterHeading: isHeading })
				if (isHeading) chapters.push({ paragraphIndex: index, title: text })
				index += 1
			}
			continue
		}

		for (const text of texts) {
			const isHeading = chapterRegex!.test(text)
			paragraphs.push({ index, text, isChapterHeading: isHeading })
			if (isHeading) chapters.push({ paragraphIndex: index, title: text })
			index += 1
		}
	}

	return { paragraphs, chapters }
}

function compileChapterRegex(opts: ParseNovelOptions): RegExp {
	const source = opts.chapterRegexSource || DEFAULT_CHAPTER_REGEX_SOURCE
	const flags = opts.chapterRegexFlags ?? DEFAULT_CHAPTER_REGEX_FLAGS
	try {
		return new RegExp(source, flags)
	} catch {
		return new RegExp(DEFAULT_CHAPTER_REGEX_SOURCE, DEFAULT_CHAPTER_REGEX_FLAGS)
	}
}
