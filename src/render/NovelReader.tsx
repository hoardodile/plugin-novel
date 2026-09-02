import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "../i18n"
import {
	NOVEL_SETTINGS_DEFAULT,
	NOVEL_SETTINGS_KEY,
	type NovelReadingMode,
	novelSettingsCodec,
} from "../prefs"
import { NovelChapterSheet } from "./ChapterSheet"
import { buildCommentsByParagraph } from "./commentsByParagraph"
import { useAnchorJump, usePluginAPI } from "./hooks"
import { NovelBody } from "./NovelBody"
import { NovelFloatingToolbar } from "./NovelFloatingToolbar"
import { NovelParagraphCommentDialog } from "./NovelParagraphCommentDialog"
import { NovelReadingBottomStrip } from "./NovelReadingBottomStrip"
import { NovelReadingTopStrip } from "./NovelReadingTopStrip"
import { NovelScrollBody } from "./NovelScrollBody"
import { NovelSideRail } from "./NovelSideRail"
import { PageJumpDialog } from "./PageJumpDialog"
import { NovelSettingsSheet } from "./SettingsSheet"
import { chapterForParagraph } from "./scroll-layout"
import { useDeferredNovelDocument } from "./useDeferredNovelDocument"
import { useNovelBook } from "./useNovelBook"
import { useNovelPosition } from "./useNovelPosition"
import { useReaderTheme } from "./useReaderTheme"
import { useIsMobile } from "./useReaderViewport"

/**
 * Novel reader. Reads every text unit of the resource (txt/md/html/epub/
 * docx/fb2 — multi-unit books assemble into one document), parses it into
 * paragraphs and chapters, persists reading position + per-user settings,
 * and routes comments through the shared resource-anchor system.
 *
 * The reader follows the host's theme (default parchment) via a reader
 * theme preference applied to the document, and renders in one of two
 * reading modes: paged (multi-column) or continuous scroll.
 */
export function NovelReader() {
	const api = usePluginAPI()
	const { t } = useTranslation()

	const [settings, setSettings] = api.usePref(
		NOVEL_SETTINGS_KEY,
		NOVEL_SETTINGS_DEFAULT,
		novelSettingsCodec,
	)

	useReaderTheme(settings.theme)

	const {
		fileListLoading,
		noFile,
		filename,
		paths,
		units,
		structured,
		loadFailed,
		progress,
	} = useNovelBook({ encoding: settings.encoding })

	const document = useDeferredNovelDocument({
		units,
		chapterRegexSource: settings.chapterRegex,
		structured,
	})

	const {
		scrollAnchor,
		setScrollAnchor,
		scrollToAnchor,
		handleJump,
		onScrollHandled,
	} = useNovelPosition({ filename, document })

	// Reactive message list from the SDK; refetches when the host
	// invalidates after a create/delete.
	const messagesQuery = api.useMessageList()
	const comments = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data])
	const commentsByParagraph = useMemo(
		() => buildCommentsByParagraph(comments),
		[comments],
	)

	const [pageStats, setPageStats] = useState<{
		current: number
		total: number
	}>({ current: 1, total: 1 })
	const [scrollProgress, setScrollProgress] = useState(0)
	const [chapterOpen, setChapterOpen] = useState(false)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [pageJumpOpen, setPageJumpOpen] = useState(false)
	const [scrollToPage, setScrollToPage] = useState<number | undefined>(
		undefined,
	)
	const handleJumpToPage = useCallback(function handleJumpToPage(page: number) {
		setScrollToPage(page)
	}, [])
	const [selectedParagraph, setSelectedParagraph] = useState<
		number | undefined
	>(undefined)
	// Mobile immersive chrome: the function (bottom) bar is hidden behind
	// a center-tap; the corner HUD (chapter / page / time) stays always on.
	const mobile = useIsMobile()
	const [chromeVisible, setChromeVisible] = useState(false)
	const handleToggleChrome = useCallback(function handleToggleChrome() {
		setChromeVisible((visible) => !visible)
	}, [])

	// Reset the sub-paragraph fraction when the reading mode changes so a
	// restore in the new mode lands at the start of the current paragraph
	// rather than inheriting the other mode's fraction semantics.
	const anchorRef = useRef(scrollAnchor)
	anchorRef.current = scrollAnchor
	const prevModeRef = useRef<NovelReadingMode>(settings.readingMode)
	useEffect(
		function resetFractionOnModeChange() {
			if (prevModeRef.current === settings.readingMode) return
			prevModeRef.current = settings.readingMode
			handleJump(anchorRef.current.paragraphIndex)
		},
		[settings.readingMode, handleJump],
	)

	useAnchorJump(function onJump(anchor) {
		if (!paths.has(anchor.filename)) return
		handleJump(anchor.paragraphIndex)
	})

	if (fileListLoading) {
		return (
			<p className="px-4 py-8 text-sm text-muted-foreground">{t("loading")}</p>
		)
	}

	if (noFile) {
		return (
			<p className="px-4 py-8 text-sm text-muted-foreground">{t("noFile")}</p>
		)
	}

	if (loadFailed) {
		return (
			<p className="px-4 py-8 text-sm text-muted-foreground">
				{t("loadFailed")}
			</p>
		)
	}

	if (document === undefined) {
		if (progress !== undefined && progress.total > 1) {
			return (
				<p className="px-4 py-8 text-sm text-muted-foreground">
					{t("loadingChapters")} {Math.min(progress.loaded + 1, progress.total)}{" "}
					/ {progress.total}
				</p>
			)
		}
		return (
			<p className="px-4 py-8 text-sm text-muted-foreground">{t("loading")}</p>
		)
	}

	const currentChapter = chapterForParagraph(
		document.chapters,
		scrollAnchor.paragraphIndex,
	)
	const currentChapterTitle = currentChapter?.title ?? ""
	const progressValue =
		settings.readingMode === "scroll"
			? scrollProgress
			: pageStats.total > 0
				? pageStats.current / pageStats.total
				: 1
	const positionLabel =
		settings.readingMode === "scroll"
			? `${Math.round(progressValue * 100)}%`
			: `${pageStats.current}/${pageStats.total}`

	return (
		<div className="relative flex h-full w-full bg-background text-foreground">
			{!mobile ? (
				<NovelSideRail
					showPageJump={settings.readingMode === "paged"}
					onOpenPageJump={() => setPageJumpOpen(true)}
					onOpenChapters={() => setChapterOpen(true)}
					onOpenSettings={() => setSettingsOpen(true)}
				/>
			) : null}
			<div className="relative flex min-w-0 flex-1 flex-col">
				<NovelReadingTopStrip chapterTitle={currentChapterTitle} />
				<div className="relative flex-1 overflow-hidden">
					{settings.readingMode === "scroll" ? (
						<NovelScrollBody
							document={document}
							settings={settings}
							onScrollAnchorChange={setScrollAnchor}
							onParagraphLongPress={setSelectedParagraph}
							onParagraphCommentTap={setSelectedParagraph}
							commentsByParagraph={commentsByParagraph}
							scrollToAnchor={scrollToAnchor}
							onAnchorHandled={onScrollHandled}
							onProgressChange={setScrollProgress}
							onToggleChrome={mobile ? handleToggleChrome : undefined}
							compact={mobile}
						/>
					) : (
						<NovelBody
							document={document}
							settings={settings}
							onScrollAnchorChange={setScrollAnchor}
							onParagraphLongPress={setSelectedParagraph}
							onParagraphCommentTap={setSelectedParagraph}
							commentsByParagraph={commentsByParagraph}
							scrollToAnchor={scrollToAnchor}
							onScrollHandled={onScrollHandled}
							scrollToPage={scrollToPage}
							onScrollToPageHandled={() => setScrollToPage(undefined)}
							onPageStatsChange={setPageStats}
							onToggleChrome={mobile ? handleToggleChrome : undefined}
							compact={mobile}
						/>
					)}
					{mobile && chromeVisible ? (
						<NovelFloatingToolbar
							showPageJump={settings.readingMode === "paged"}
							onOpenPageJump={() => setPageJumpOpen(true)}
							onOpenChapters={() => setChapterOpen(true)}
							onOpenSettings={() => setSettingsOpen(true)}
						/>
					) : null}
				</div>
				<NovelReadingBottomStrip
					paged={settings.readingMode === "paged"}
					compact={mobile}
					positionLabel={positionLabel}
					canPrevPage={pageStats.current > 1}
					canNextPage={pageStats.current < pageStats.total}
					onPrevPage={() => handleJumpToPage(pageStats.current - 1)}
					onNextPage={() => handleJumpToPage(pageStats.current + 1)}
				/>
			</div>
			<NovelChapterSheet
				open={chapterOpen}
				onOpenChange={setChapterOpen}
				chapters={document.chapters}
				currentParagraphIndex={scrollAnchor.paragraphIndex}
				onJump={handleJump}
			/>
			<NovelSettingsSheet
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				settings={settings}
				onChange={setSettings}
			/>
			<PageJumpDialog
				open={pageJumpOpen}
				onOpenChange={setPageJumpOpen}
				currentPage={pageStats.current}
				totalPages={pageStats.total}
				onJump={(page) => {
					handleJumpToPage(page)
					setPageJumpOpen(false)
				}}
			/>
			<NovelParagraphCommentDialog
				open={selectedParagraph !== undefined}
				onClose={() => setSelectedParagraph(undefined)}
				filename={filename}
				paragraphIndex={selectedParagraph}
				comments={
					selectedParagraph !== undefined
						? (commentsByParagraph.get(selectedParagraph) ?? [])
						: []
				}
			/>
		</div>
	)
}
