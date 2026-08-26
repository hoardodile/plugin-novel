#!/usr/bin/env node
/**
 * Run every real-world sample in `testdata-real/` through the built
 * plugin sandbox (`hoardodile plugin run`) **and** the pure logic
 * layer (decoding, stripping, chapter assembly), and print a feature
 * report. Each sample is a directory containing a single book, matching
 * the resource shape the plugin is invoked with.
 *
 * The core layer is plain erasable TypeScript, so Node 24 imports it
 * directly — no bundling, no DOM. That is the whole point of the
 * core/render split: format correctness is verifiable from bytes
 * alone, without eyes on a screen.
 *
 * Requires `dist/main.js` (run `pnpm build` first). Exits non-zero when
 * any sample fails a hook or a logic check.
 *
 * Usage: node scripts/verify-real-samples.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { unzipSync } from "fflate"
import { decodeText } from "../src/core/charset.ts"
import { parseNovel } from "../src/core/document.ts"
import {
	epubContainerOpfPath,
	isStructuralEpubEntry,
	parseEpubOpf,
	resolveEpubHref,
} from "../src/core/epub.ts"
import {
	docxMetadata,
	docxToText,
	fb2Metadata,
	fb2ToUnits,
	stripHtmlToText,
} from "../src/core/text.ts"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DIST_DIR = join(ROOT, "dist")
const REAL_DIR = join(ROOT, "testdata-real")
const MANIFEST_PATH = join(REAL_DIR, "samples.json")

if (!existsSync(join(DIST_DIR, "main.js"))) {
	console.error("[verify] dist/main.js missing — run `pnpm build` first")
	process.exit(1)
}

/**
 * Resolve the hoardodile CLI entry by reading its package.json directly
 * (the package does not export `./package.json`). pnpm links the
 * workspace package into the plugin's node_modules, so the path exists
 * even though @hoardodile/cli is a devDependency of the plugin toolchain.
 */
function cliEntry() {
	const pkgPath = join(
		ROOT,
		"node_modules",
		"@hoardodile",
		"cli",
		"package.json",
	)
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
	const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.hoardodile
	return join(dirname(pkgPath), bin ?? "bin/hoardodile.mjs")
}

function runHook(hook, dir) {
	const out = execFileSync(
		process.execPath,
		[cliEntry(), "plugin", "run", hook, dir, "--plugin-dir", DIST_DIR],
		{ encoding: "utf8" },
	)
	return JSON.parse(out)
}

const LINES = []
let sampleOk = true

function check(name, ok, detail) {
	if (!ok) sampleOk = false
	const line = `${ok ? "✓" : "✕"} ${name} — ${detail}`
	LINES.push(line)
	console.log(`    ${line}`)
}

/** Logic checks keyed by sample name; returns `false` on failure. */
const LOGIC_CHECKS = {
	"gutenberg-txt": (bytes) => {
		const text = decodeText(bytes)
		const doc = parseNovel(text)
		check(
			"logic: utf-8 decode + chapter regex",
			text.includes("Pride and Prejudice") && doc.chapters.length >= 50,
			`chapters=${doc.chapters.length}, paragraphs=${doc.paragraphs.length}`,
		)
	},
	"gutenberg-html": (bytes) => {
		const { text, firstHeading } = stripHtmlToText(decodeText(bytes))
		check(
			"logic: html strip + first heading",
			text.length > 50_000 && firstHeading !== undefined,
			`firstHeading="${firstHeading}", textChars=${text.length}`,
		)
	},
	"gutenberg-honglou": (bytes) => {
		const text = decodeText(bytes)
		// The Gutenberg title is traditional Chinese (紅樓夢).
		check(
			"logic: utf-8 Chinese decode",
			text.includes("紅樓夢"),
			`chars=${text.length}`,
		)
	},
	"honglou-gb18030": (bytes) => {
		const text = decodeText(bytes)
		check(
			"logic: GB18030 auto-detect",
			text.includes("紅樓夢"),
			`chars=${text.length}, mojibake=${text.includes("锟")}`,
		)
	},
	"honglou-utf16le": (bytes) => {
		const text = decodeText(bytes)
		check(
			"logic: UTF-16LE auto-detect",
			text.includes("紅樓夢"),
			`chars=${text.length}`,
		)
	},
	"aozora-sjis": (bytes) => {
		const auto = decodeText(bytes)
		const sjis = decodeText(bytes, "shift-jis")
		check(
			"logic: Shift_JIS override decodes 吾輩は猫である",
			sjis.includes("吾輩") && sjis.includes("猫"),
			`overrideChars=${sjis.length}, autoChars=${auto.length}`,
		)
	},
	"archive-fb2": (bytes) => {
		const text = decodeText(bytes)
		const units = fb2ToUnits(text)
		const meta = fb2Metadata(text)
		check(
			"logic: fb2 sections + metadata",
			units.filter((u) => u.title !== undefined).length >= 10 &&
				meta.title !== undefined,
			`units=${units.length}, title="${meta.title}"`,
		)
	},
	"archive-docx": (bytes) => {
		const entries = unzipSync(bytes)
		const documentXml = entries["word/document.xml"]
		if (documentXml === undefined) {
			check("logic: docx text extraction", false, "word/document.xml missing")
			return
		}
		const text = docxToText(decodeText(documentXml))
		check(
			"logic: docx w:t extraction",
			text.length > 100,
			`textChars=${text.length}, paragraphs=${text.split("\n\n").length}`,
		)
		const core = entries["docProps/core.xml"]
		if (core !== undefined) {
			const meta = docxMetadata(decodeText(core))
			console.log(
				`    [info] docx metadata: title="${meta.title ?? "?"}", author="${meta.author ?? "?"}"`,
			)
		}
	},
	"gutenberg-epub": (bytes) => {
		const entries = unzipSync(bytes)
		const container = entries["META-INF/container.xml"]
		if (container === undefined) {
			check("logic: epub spine", false, "META-INF/container.xml missing")
			return
		}
		const opfPath = epubContainerOpfPath(decodeText(container))
		if (opfPath === undefined) {
			check("logic: epub spine", false, "no rootfile in container.xml")
			return
		}
		const opfEntry = entries[opfPath]
		if (opfEntry === undefined) {
			check("logic: epub spine", false, `opf ${opfPath} missing`)
			return
		}
		const { spineHrefs, title } = parseEpubOpf(decodeText(opfEntry))
		const opfDir = opfPath.slice(0, opfPath.lastIndexOf("/"))
		const chapters = spineHrefs
			.map((href) => resolveEpubHref(opfDir, href))
			.filter(
				(href) => !isStructuralEpubEntry(href.slice(href.lastIndexOf("/") + 1)),
			)
		// Some producers open the spine with cover/titlepage wrappers
		// that carry no heading — walk to the first real chapter.
		let firstHeading
		for (const chapter of chapters) {
			const chapterEntry = entries[chapter]
			if (chapterEntry === undefined) continue
			const heading = stripHtmlToText(decodeText(chapterEntry)).firstHeading
			if (heading !== undefined) {
				firstHeading = heading
				break
			}
		}
		check(
			"logic: epub spine order + metadata + chapter text",
			chapters.length >= 10 &&
				title !== undefined &&
				firstHeading !== undefined,
			`spine=${chapters.length}, title="${title ?? "?"}", first="${firstHeading ?? "?"}"`,
		)
	},
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
let failed = 0
console.log("── real sample verification ─────────────────────────")
for (const sample of manifest.samples) {
	const dir = join(REAL_DIR, sample.dir)
	if (!existsSync(join(dir, sample.file))) {
		console.log(
			`✕ ${sample.name} — sample file missing (run fetch-real-samples.mjs)`,
		)
		failed++
		continue
	}
	console.log(`✓ ${sample.name}  [${sample.features.join(",")}]`)
	sampleOk = true
	const bytes = new Uint8Array(readFileSync(join(dir, sample.file)))
	try {
		const detect = runHook("detect", dir)
		const detectOk = detect.result?.ok === true
		if (!detectOk)
			check("hook: detect", false, detect.result?.reasons?.join(",") ?? "fail")
		const files = runHook("listFiles", dir)
		const rows = Array.isArray(files.result) ? files.result : []
		check(
			"hook: listFiles",
			rows.length > 0,
			`rows=${rows.length}, first=${rows[0]?.path ?? "-"}`,
		)
		const meta = runHook("sourceMeta", dir)
		if (meta.result !== undefined && meta.result !== null) {
			console.log(
				`    [info] sourceMeta: title="${meta.result.title ?? "?"}", author="${meta.result.author ?? "?"}", chapters=${meta.result.chapterCount ?? "?"}`,
			)
		}
		const logic = LOGIC_CHECKS[sample.name]
		if (logic !== undefined) logic(bytes, dir)
		else console.log("    [info] no logic checks for this sample")
	} catch (err) {
		check("hook run", false, err instanceof Error ? err.message : String(err))
	}
	if (!sampleOk) failed++
}
console.log("─────────────────────────────────────────────────────")
console.log(
	`${manifest.samples.length - failed}/${manifest.samples.length} samples passed`,
)
process.exit(failed === 0 ? 0 : 1)
