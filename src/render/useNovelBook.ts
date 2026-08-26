import { useEffect, useMemo, useState } from "react"
import { decodeText, type TextEncoding } from "../core/charset"
import {
	docxToText,
	fb2ToUnits,
	type NovelUnit,
	stripHtmlToText,
} from "../core/text"
import type { NovelFile } from "../shared"
import { usePluginAPI } from "./hooks"

/**
 * The novel's text: every readable unit of the resource fetched and
 * decoded. Owns the whole async lifecycle (row reads with a concurrency
 * bound, per-row failure tolerance, loading progress); document
 * assembly happens in `useDeferredNovelDocument`.
 *
 * All decoding lives in `src/logic` — this hook is pure orchestration.
 */

const READ_CONCURRENCY = 8

export function useNovelBook(opts: { readonly encoding: TextEncoding }): {
	readonly fileListLoading: boolean
	readonly noFile: boolean
	readonly filename: string
	readonly paths: ReadonlySet<string>
	readonly units: readonly NovelUnit[] | undefined
	readonly structured: boolean
	readonly loadFailed: boolean
	readonly progress:
		| { readonly loaded: number; readonly total: number }
		| undefined
} {
	const { encoding } = opts
	const api = usePluginAPI()
	const filesQuery = api.useFileList()
	const rows = useMemo(() => filesQuery.data ?? [], [filesQuery.data])
	// Single text-like rows are one opaque document (chapters come from
	// the regex); multi-row books name each unit after its file.
	const titledRows = rows.length > 1

	const [units, setUnits] = useState<readonly NovelUnit[] | undefined>(
		undefined,
	)
	const [loadFailed, setLoadFailed] = useState(false)
	const [progress, setProgress] = useState<
		{ readonly loaded: number; readonly total: number } | undefined
	>(undefined)

	// Hosts may hand us a fresh array identity per render; the effect
	// must react to the file set itself, not the array reference.
	const rowsKey = useMemo(
		() => rows.map((row) => `${row.kind}:${row.path}`).join("\n"),
		[rows],
	)

	useEffect(
		function loadBook() {
			if (rows.length === 0) {
				setUnits(undefined)
				setLoadFailed(false)
				setProgress(undefined)
				return
			}
			let cancelled = false
			let claimed = 0
			const collected: NovelUnit[] = []
			setUnits(undefined)
			setLoadFailed(false)
			setProgress({ loaded: 0, total: rows.length })

			async function lane() {
				for (;;) {
					const index = claimed
					if (index >= rows.length) return
					claimed += 1
					const row = rows[index]
					if (row === undefined) continue
					try {
						const bytes = await api.readFile(row.path)
						if (cancelled) return
						const decoded = decodeRow(
							row,
							new Uint8Array(bytes),
							encoding,
							titledRows,
						)
						if (decoded.units.length > 0) {
							for (const unit of decoded.units) {
								collected.push(unit)
							}
						}
					} catch {
						// Tolerate a broken chapter; the rest of the book
						// still renders. Everything failing is an error.
					}
					setProgress((prev) => ({
						loaded: Math.min(claimed, rows.length),
						total: prev?.total ?? rows.length,
					}))
				}
			}

			const lanes: Promise<void>[] = []
			const laneCount = Math.min(READ_CONCURRENCY, rows.length)
			for (let i = 0; i < laneCount; i += 1) lanes.push(lane())

			void Promise.all(lanes).then(function finish() {
				if (cancelled) return
				if (collected.length === 0) {
					setLoadFailed(true)
					setProgress(undefined)
					return
				}
				setUnits(collected)
				setProgress({ loaded: rows.length, total: rows.length })
			})

			return function cancel() {
				cancelled = true
			}
		},
		[api, rowsKey, encoding, titledRows],
	)

	const structured = useMemo(
		() =>
			rows.length > 0 &&
			rows.every((row) => row.kind === "epub" || row.kind === "fb2"),
		[rows],
	)

	return {
		fileListLoading: filesQuery.isLoading && filesQuery.data === undefined,
		noFile: filesQuery.data !== undefined && rows.length === 0,
		filename: rows[0]?.path ?? "",
		paths: useMemo(() => new Set(rows.map((row) => row.path)), [rows]),
		units,
		structured,
		loadFailed,
		progress,
	}
}

/** One row → its text units, per format. */
function decodeRow(
	row: NovelFile,
	bytes: Uint8Array,
	encoding: TextEncoding,
	titled: boolean,
): { readonly units: readonly NovelUnit[] } {
	switch (row.kind) {
		case "text":
			return {
				units: [
					{
						title: titled ? stemOf(row.path) : undefined,
						text: decodeText(bytes, encoding),
					},
				],
			}
		case "html":
			return { units: [htmlUnit(decodeText(bytes, encoding), row, titled)] }
		case "epub":
			return { units: [epubUnit(decodeText(bytes, encoding), row)] }
		case "docx":
			return { units: [{ text: docxToText(decodeText(bytes, encoding)) }] }
		case "fb2":
			return { units: fb2ToUnits(decodeText(bytes, encoding)) }
	}
}

function epubUnit(text: string, row: NovelFile): NovelUnit {
	const { text: prose, firstHeading } = stripHtmlToText(text)
	return { title: firstHeading ?? stemOf(row.path), text: prose }
}

function htmlUnit(text: string, row: NovelFile, titled: boolean): NovelUnit {
	const { text: prose, firstHeading } = stripHtmlToText(text)
	return {
		title: titled ? (firstHeading ?? stemOf(row.path)) : undefined,
		text: prose,
	}
}

/** Basename without extension, e.g. `ch1.xhtml` → `ch1`. */
function stemOf(path: string): string {
	const base = path.slice(path.lastIndexOf("/") + 1)
	const dot = base.lastIndexOf(".")
	return dot === -1 ? base : base.slice(0, dot)
}
