import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "../i18n"
import {
	NOVEL_SETTINGS_DEFAULT,
	NOVEL_SETTINGS_KEY,
	novelSettingsCodec,
	novelTextColorFor,
} from "../prefs"
import { NovelChapterSheet } from "./ChapterSheet"
import { buildCommentsByParagraph } from "./commentsByParagraph"
import { useAnchorJump, usePluginAPI } from "./hooks"
import { NovelBody } from "./NovelBody"
import { NovelParagraphCommentDialog } from "./NovelParagraphCommentDialog"
import { NovelTopBar } from "./NovelTopBar"
import { NovelSettingsSheet } from "./SettingsSheet"
import { useDeferredNovelDocument } from "./useDeferredNovelDocument"
import { useNovelBook } from "./useNovelBook"
import { useNovelPosition } from "./useNovelPosition"

/**
 * Novel reader with paragraph-level comments. Reads every text unit of
 * the resource (txt/md/html/epub/docx/fb2 — multi-unit books assemble
 * into one document), parses it into paragraphs and chapters, persists
 * reading position + per-user typography settings via the plugin host
 * API, and routes comments through the shared resource-anchor system.
 *
 * The heavy lifting lives in the hooks: unit fetching/decoding,
 * document parsing and position persistence each own their lifecycle
 * here.
 */
export function NovelReader() {
	const api = usePluginAPI()
	const { t } = useTranslation()

	const [settings, setSettings] = api.usePref(
		NOVEL_SETTINGS_KEY,
		NOVEL_SETTINGS_DEFAULT,
		novelSettingsCodec,
	)

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
	const [chapterOpen, setChapterOpen] = useState(false)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [selectedParagraph, setSelectedParagraph] = useState<
		number | undefined
	>(undefined)
	const [scrollToPage, setScrollToPage] = useState<number | undefined>(
		undefined,
	)

	const handlePageJump = useCallback(function handlePageJump(page: number) {
		setScrollToPage(page)
	}, [])

	useAnchorJump(function onJump(anchor) {
		// Anchors address any unit of this resource's book.
		if (!paths.has(anchor.filename)) return
		handleJump(anchor.paragraphIndex)
	})

	if (fileListLoading) {
		return <span className="text-sm text-white/60">{t("loading")}</span>
	}

	if (noFile) {
		return <span className="text-sm text-white/60">{t("noFile")}</span>
	}

	if (loadFailed) {
		return <span className="text-sm text-white/60">{t("loadFailed")}</span>
	}

	if (document === undefined) {
		if (progress !== undefined && progress.total > 1) {
			return (
				<span className="text-sm text-white/60">
					{t("loadingChapters")} {Math.min(progress.loaded + 1, progress.total)}{" "}
					/ {progress.total}
				</span>
			)
		}
		return <span className="text-sm text-white/60">{t("loading")}</span>
	}

	const textColor = novelTextColorFor(settings.bgColor)

	return (
		<div
			className="relative flex h-full w-full flex-col"
			style={{ background: settings.bgColor, color: textColor }}
		>
			<NovelTopBar
				currentPage={pageStats.current}
				totalPages={pageStats.total}
				onOpenChapters={() => setChapterOpen(true)}
				onOpenSettings={() => setSettingsOpen(true)}
				onPageJump={handlePageJump}
			/>
			<div className="relative flex-1 overflow-hidden">
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
