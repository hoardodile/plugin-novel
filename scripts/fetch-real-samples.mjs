#!/usr/bin/env node
/**
 * Fetch (or verify) the real-world samples in `testdata-real/` —
 * real books downloaded from Gutenberg / the Internet Archive / Aozora
 * Bunko, exercised against the built plugin and the logic layer during
 * development. Nothing here is committed (the directory is
 * git-ignored); the sample manifest below is the single source of
 * truth for what a "real" run covers.
 *
 * Some samples are *derived*: the source file is downloaded, then
 * re-encoded on the fly (GB18030 / UTF-16LE variants of a real Chinese
 * classic; Shift_JIS extracted from Aozora's zip). Real content, real
 * encodings — exactly the bytes a legacy download would carry.
 *
 * Idempotent: an existing sample whose file size matches the manifest
 * is left untouched; missing or mismatched samples are (re)downloaded.
 * Every run rewrites `samples.json` with name, source URL, byte size,
 * feature tags and the fetch date.
 *
 * Usage: node scripts/fetch-real-samples.mjs [--verify-only]
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { unzipSync } from "fflate"
import iconv from "iconv-lite"

const OUT_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"testdata-real",
)

/**
 * The sample manifest. `dir` is the subdirectory under `testdata-real/`
 * (a resource holds exactly one book, so each sample gets its own);
 * `file` the on-disk name; `size` the expected byte size for
 * idempotence checks; `process` how a sample is produced from its
 * `source` download:
 * - absent   — the download itself is the sample
 * - `"unzip"` — the download is a zip; its first `.txt` entry is the sample
 * - `"gb18030"` / `"utf16le"` — re-encode the UTF-8 download
 * - `"shiftjis"` — re-encode the UTF-8 download (used only as fallback)
 */
const SAMPLES = [
	{
		name: "gutenberg-epub",
		dir: "epub",
		file: "pride-and-prejudice.epub",
		url: "https://www.gutenberg.org/ebooks/1342.epub.noimages",
		size: 558547,
		features: ["epub", "spine", "61-chapters"],
	},
	{
		name: "gutenberg-txt",
		dir: "txt",
		file: "pride-and-prejudice.txt",
		url: "https://www.gutenberg.org/cache/epub/1342/pg1342.txt",
		size: 772386,
		features: ["txt", "utf8"],
	},
	{
		name: "gutenberg-html",
		dir: "html",
		file: "pride-and-prejudice.htm",
		url: "https://www.gutenberg.org/files/1342/1342-h/1342-h.htm",
		size: 806295,
		features: ["html", "messy-markup"],
	},
	{
		name: "gutenberg-honglou",
		dir: "zh-utf8",
		file: "honglou-utf8.txt",
		url: "https://www.gutenberg.org/cache/epub/24264/pg24264.txt",
		size: 2663455,
		features: ["txt", "chinese", "utf8"],
	},
	{
		name: "honglou-gb18030",
		dir: "zh-gb18030",
		file: "honglou-gbk.txt",
		process: "gb18030",
		source: {
			url: "https://www.gutenberg.org/cache/epub/24264/pg24264.txt",
			size: 2663455,
		},
		features: ["txt", "chinese", "gb18030"],
	},
	{
		name: "honglou-utf16le",
		dir: "zh-utf16",
		file: "honglou-utf16.txt",
		process: "utf16le",
		source: {
			url: "https://www.gutenberg.org/cache/epub/24264/pg24264.txt",
			size: 2663455,
		},
		features: ["txt", "chinese", "utf16le"],
	},
	{
		name: "aozora-sjis",
		dir: "sjis",
		file: "wagahai-wa-neko-de-aru.txt",
		process: "unzip",
		url: "https://www.aozora.gr.jp/cards/000148/files/789_ruby_5639.zip",
		size: 344964,
		features: ["txt", "japanese", "shift-jis"],
	},
	{
		name: "archive-fb2",
		dir: "fb2",
		file: "away-in-the-wilderness.fb2",
		url: "https://archive.org/download/RM_Ballantyne_Away_in_the_Wilderness/RM_Ballantyne_Away_in_the_Wilderness.fb2",
		size: 1723322,
		features: ["fb2", "sections", "metadata"],
	},
	{
		name: "archive-docx",
		dir: "docx",
		file: "lajia.docx",
		url: "https://archive.org/download/elshaik1989_gmail_201310/%D9%84%D8%A7%D8%AC%D8%A6%D8%A9-%D8%B1%D9%88%D8%A7%D9%8A%D8%A9.docx",
		size: 449683,
		features: ["docx", "metadata", "arabic"],
	},
]

const MANIFEST_PATH = join(OUT_DIR, "samples.json")

function existingManifest() {
	try {
		return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
	} catch {
		return { v: 1, samples: [] }
	}
}

/**
 * Download with `fetch`, retrying transient failures with backoff
 * (three attempts, 2 s / 4 s apart). Run the script with
 * `node --use-env-proxy` when an HTTP(S)_PROXY env var is set — undici
 * ignores proxy variables otherwise.
 */
async function download(url, destPath, expectedSize) {
	let tries = 0
	for (;;) {
		tries += 1
		try {
			const res = await fetch(url)
			if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
			const bytes = new Uint8Array(await res.arrayBuffer())
			if (bytes.byteLength !== expectedSize) {
				throw new Error(
					`size mismatch for ${destPath}: expected ${expectedSize}, got ${bytes.byteLength}`,
				)
			}
			writeFileSync(destPath, bytes)
			return
		} catch (err) {
			if (tries >= 3 || /^HTTP 40[0-9]/.test(err.message)) throw err
			await new Promise((resolveDelay) =>
				setTimeout(resolveDelay, tries * 2_000),
			)
		}
	}
}

function writeSample(manifest, sample, bytes) {
	manifest.samples = manifest.samples.filter((s) => s.name !== sample.name)
	manifest.samples.push({
		name: sample.name,
		dir: sample.dir,
		file: sample.file,
		path: `${sample.dir}/${sample.file}`,
		url:
			sample.process === undefined
				? sample.url
				: (sample.source?.url ?? sample.url),
		size: bytes.byteLength,
		features: sample.features,
		fetchedAt: new Date().toISOString(),
	})
}

async function main() {
	const verifyOnly = process.argv.includes("--verify-only")
	mkdirSync(OUT_DIR, { recursive: true })
	const manifest = existingManifest()

	for (const sample of SAMPLES) {
		const dir = join(OUT_DIR, sample.dir)
		const dest = join(dir, sample.file)
		// Plain downloads pin their size in the manifest; derived samples
		// idempotence-check against the size recorded on the last fetch.
		const recorded = manifest.samples.find((s) => s.name === sample.name)
		const expectedSize =
			sample.process === undefined ? sample.size : recorded?.size
		const existing =
			existsSync(dest) && statSync(dest).isFile()
				? statSync(dest).size
				: undefined
		if (existing !== undefined && existing === expectedSize) {
			console.log(`[samples] ok (cached): ${sample.name}`)
		} else if (verifyOnly) {
			console.error(
				`[samples] MISSING or stale: ${sample.name} (expected ${expectedSize ?? "?"}, found ${existing ?? "none"}) — run without --verify-only`,
			)
			process.exitCode = 1
			continue
		} else {
			console.log(`[samples] preparing: ${sample.name} …`)
			mkdirSync(dir, { recursive: true })
			try {
				if (sample.process === undefined) {
					await download(sample.url, dest, sample.size)
				} else if (sample.process === "unzip") {
					await download(sample.url, dest, sample.size)
					const entries = unzipSync(readFileSync(dest))
					const entry = Object.entries(entries).find(([name]) =>
						name.toLowerCase().endsWith(".txt"),
					)
					if (entry === undefined) {
						throw new Error(`no .txt entry inside ${sample.url}`)
					}
					writeFileSync(dest, entry[1])
				} else if (
					sample.process === "gb18030" ||
					sample.process === "utf16le"
				) {
					await download(sample.source.url, dest, sample.source.size)
					const text = new TextDecoder("utf-8").decode(readFileSync(dest))
					if (sample.process === "gb18030") {
						writeFileSync(dest, iconv.encode(text, "gb18030"))
					} else {
						// BOM-prefixed like a Windows Notepad export — the
						// dominant real-world UTF-16 text shape.
						writeFileSync(
							dest,
							iconv.encode(text, "utf16-le", { addBOM: true }),
						)
					}
				} else {
					throw new Error(`unknown process "${sample.process}"`)
				}
			} catch (err) {
				console.error(`[samples] failed: ${sample.name}: ${err.message}`)
				process.exitCode = 1
				continue
			}
		}
		writeSample(manifest, sample, { byteLength: statSync(dest).size })
	}

	manifest.samples.sort((a, b) => a.name.localeCompare(b.name))
	writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
	console.log(
		`[samples] manifest: ${manifest.samples.length} sample(s) -> ${MANIFEST_PATH}`,
	)
}

void main()
