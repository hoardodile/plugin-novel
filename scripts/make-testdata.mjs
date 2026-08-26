#!/usr/bin/env node
/**
 * Regenerate `testdata/` — the fixture volumes the novel plugin is
 * developed against (`pnpm dev`, `pnpm detect:smoke`). The generated
 * files are committed, so this only needs running when the fixture
 * itself should change.
 *
 * Every volume is a flat directory — a resource holds exactly one
 * book, so each format gets its own directory:
 *
 * - `text/`   — the original synthetic folio (`.txt` + a `.md` sidecar)
 * - `folder/` — a multi-file chapter folder (txt + html)
 * - `epub/`   — a two-chapter EPUB with real container/OPF/spine layout
 * - `docx/`   — a two-paragraph Word document with core properties
 * - `fb2/`    — an fb2 with nested sections and title-info metadata
 * - `html/`   — a single chapter page with headings and scripts
 * - `gbk/`    — the folio re-encoded as GB18030 (real legacy-Chinese bytes)
 *
 * The text is generated, not copied: deterministic filler sentences
 * with `Chapter N` / `Prologue` / `Epilogue` headings that the default
 * chapter regex recognises, and paragraphs long enough to span several
 * columns so the multi-column pagination and the sub-paragraph scroll
 * anchor are actually exercised.
 *
 * Usage: node scripts/make-testdata.mjs
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { strToU8, zipSync } from "fflate"
import iconv from "iconv-lite"

const OUT_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"testdata",
)

const CHAPTER_COUNT = 6
const PARAGRAPHS_PER_CHAPTER = 8
/** Sentences in the longest paragraph; short ones taper down from here. */
const MAX_SENTENCES = 14

const SUBJECTS = [
	"The archivist",
	"A quiet clerk",
	"The night courier",
	"Her oldest notebook",
	"The reading room",
	"A borrowed lantern",
]
const VERBS = [
	"catalogued",
	"misplaced",
	"annotated",
	"rediscovered",
	"quietly returned",
	"copied out",
]
const OBJECTS = [
	"a shelf of unlabelled folios",
	"the ledger nobody had signed",
	"three letters and a pressed leaf",
	"an index that indexed itself",
	"the last page of a missing volume",
	"a map of corridors that no longer exist",
]

/** Deterministic filler sentence — same seed, same text, every run. */
function sentence(seed) {
	const subject = SUBJECTS[seed % SUBJECTS.length]
	const verb = VERBS[(seed * 3 + 1) % VERBS.length]
	const object = OBJECTS[(seed * 7 + 2) % OBJECTS.length]
	return `${subject} ${verb} ${object}.`
}

function paragraph(seed, sentenceCount) {
	const parts = []
	for (let i = 0; i < sentenceCount; i++) parts.push(sentence(seed + i))
	return parts.join(" ")
}

function chapterHeading(index) {
	if (index === 0) return "Prologue"
	if (index === CHAPTER_COUNT - 1) return "Epilogue"
	return `Chapter ${index}`
}

function buildNovel() {
	const lines = ["The Unlabelled Folio", ""]
	for (let chapter = 0; chapter < CHAPTER_COUNT; chapter++) {
		lines.push(chapterHeading(chapter), "")
		for (let p = 0; p < PARAGRAPHS_PER_CHAPTER; p++) {
			// Taper the length so every chapter mixes paragraphs that fit
			// on one page with ones that span several.
			const sentenceCount = MAX_SENTENCES - ((chapter + p) % MAX_SENTENCES)
			lines.push(
				paragraph(chapter * 31 + p * 5, Math.max(2, sentenceCount)),
				"",
			)
		}
	}
	return `${lines.join("\n").trimEnd()}\n`
}

const NOTES_MD = [
	"# Reading notes",
	"",
	"A second text file so the reader's file selection is exercised: the",
	"plugin reads every text unit, and this `.md` must be left",
	"alone.",
	"",
]

/** Wipe a fixture volume so regeneration starts from a clean slate. */
function wipeVolume(name) {
	const dir = join(OUT_DIR, name)
	rmSync(dir, { recursive: true, force: true })
	mkdirSync(dir, { recursive: true })
	return dir
}

function write(volume, filename, content, encoding = "utf8") {
	writeFileSync(join(volume, filename), content, encoding)
}

// ── text/ — the original folio + md sidecar ─────────────────────────

const textVolume = wipeVolume("text")
write(textVolume, "the-unlabelled-folio.txt", buildNovel())
write(textVolume, "notes.md", NOTES_MD.join("\n"))

// ── folder/ — a multi-file chapter folder ───────────────────────────

const folderVolume = wipeVolume("folder")
const volumeNames = ["卷一", "卷二", "卷三"]
volumeNames.forEach((volume, i) => {
	const lines = [volume, ""]
	for (let chapter = 0; chapter < 2; chapter++) {
		lines.push(`第${chapter + 1}章`, "")
		for (let p = 0; p < 4; p++) {
			lines.push(paragraph(i * 17 + chapter * 7 + p * 3, 6), "")
		}
	}
	write(folderVolume, `${volume}.txt`, `${lines.join("\n").trimEnd()}\n`)
})
write(
	folderVolume,
	"ch3.html",
	'<html lang="en"><head><title>Chapter 3</title></head><body>' +
		"<h1>Chapter 3</h1><p>The folder accepts html chapters too.</p>" +
		"<p>Second paragraph.</p></body></html>",
)

// ── epub/ — a two-chapter book ──────────────────────────────────────

const epubVolume = wipeVolume("epub")
const EPUB_NS = "http://www.idpf.org/2007/opf"
const XHTML_NS = "http://www.w3.org/1999/xhtml"
const CONTAINER_XML =
	'<?xml version="1.0"?>' +
	'<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
	'<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>' +
	"</rootfiles></container>"
const OPF_XML =
	`<?xml version="1.0"?>` +
	`<package xmlns="${EPUB_NS}" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0">` +
	`<metadata><dc:title>The Unlabelled Folio</dc:title><dc:creator>Hoard Archive</dc:creator></metadata>` +
	`<manifest>` +
	`<item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>` +
	`<item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>` +
	`</manifest>` +
	`<spine><itemref idref="ch1"/><itemref idref="ch2"/></spine>` +
	`</package>`
function xhtmlChapter(title, bodyParagraphs) {
	const paras = bodyParagraphs.map((p) => `<p>${p}</p>`).join("")
	return (
		`<?xml version="1.0" encoding="utf-8"?>` +
		`<html xmlns="${XHTML_NS}"><head><title>${title}</title></head>` +
		`<body><h1>${title}</h1>${paras}</body></html>`
	)
}
const epubEntries = {
	mimetype: strToU8("application/epub+zip"),
	"META-INF/container.xml": strToU8(CONTAINER_XML),
	"OEBPS/content.opf": strToU8(OPF_XML),
	"OEBPS/text/ch1.xhtml": strToU8(
		xhtmlChapter("Chapter 1", [paragraph(3, 8), paragraph(9, 12)]),
	),
	"OEBPS/text/ch2.xhtml": strToU8(
		xhtmlChapter("Chapter 2", [paragraph(21, 10), paragraph(27, 5)]),
	),
}
write(epubVolume, "book.epub", Buffer.from(zipSync(epubEntries)))

// ── docx/ — a Word document with core properties ────────────────────

const docxVolume = wipeVolume("docx")
const DOCX_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const CORE_NS =
	"http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
const DC_NS = "http://purl.org/dc/elements/1.1/"
const DOCUMENT_XML =
	`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
	`<w:document xmlns:w="${DOCX_NS}"><w:body>` +
	`<w:p><w:r><w:t>Prologue</w:t></w:r></w:p>` +
	`<w:p><w:r><w:t>${paragraph(3, 8)}</w:t></w:r></w:p>` +
	`<w:p><w:r><w:t>${paragraph(9, 10)}</w:t></w:r></w:p>` +
	`<w:p><w:r><w:t>Chapter 1</w:t></w:r></w:p>` +
	`<w:p><w:r><w:t>${paragraph(17, 9)}</w:t></w:r></w:p>` +
	`</w:body></w:document>`
const CORE_XML =
	`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
	`<cp:coreProperties xmlns:cp="${CORE_NS}" xmlns:dc="${DC_NS}">` +
	`<dc:title>The Unlabelled Folio</dc:title><dc:creator>Hoard Archive</dc:creator>` +
	`</cp:coreProperties>`
const docxEntries = {
	"[Content_Types].xml": strToU8(
		'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
			'<Default Extension="xml" ContentType="application/xml"/></Types>',
	),
	"word/document.xml": strToU8(DOCUMENT_XML),
	"docProps/core.xml": strToU8(CORE_XML),
}
write(docxVolume, "book.docx", Buffer.from(zipSync(docxEntries)))

// ── fb2/ — nested sections + title-info ─────────────────────────────

const fb2Volume = wipeVolume("fb2")
const FB2_NS = "http://www.gribuser.ru/xml/fictionbook/2.0"
const FB2_XML =
	`<?xml version="1.0" encoding="utf-8"?>` +
	`<FictionBook xmlns="${FB2_NS}">` +
	`<description><title-info>` +
	`<book-title>The Unlabelled Folio</book-title>` +
	`<author><first-name>Hoard</first-name><last-name>Archive</last-name></author>` +
	`<lang>en</lang>` +
	`</title-info></description>` +
	`<body>` +
	`<section><title><p>Book One</p></title>` +
	`<section><title><p>Chapter 1</p></title><p>${paragraph(3, 8)}</p></section>` +
	`<section><title><p>Chapter 2</p></title><p>${paragraph(9, 10)}</p></section>` +
	`</section>` +
	`<section><title><p>Book Two</p></title>` +
	`<section><title><p>Chapter 3</p></title><p>${paragraph(21, 9)}</p></section>` +
	`</section>` +
	`</body>` +
	`</FictionBook>`
write(fb2Volume, "book.fb2", FB2_XML)

// ── html/ — a single chapter page ───────────────────────────────────

const htmlVolume = wipeVolume("html")
write(
	htmlVolume,
	"chapter.html",
	'<!DOCTYPE html><html lang="en"><head><title>The Unlabelled Folio</title>' +
		"<style>body { margin: 0 }</style></head><body>" +
		"<h1>Chapter 1</h1>" +
		`<p>${paragraph(3, 8)}</p>` +
		'<p>Inline <em>emphasis</em> and a <a href="#x">the note</a>.</p>' +
		'<script>document.body.dataset.generated = "true";</script>' +
		`<p>${paragraph(9, 6)}</p>` +
		"</body></html>",
)

// ── gbk/ — the folio in GB18030, the dominant legacy Chinese encoding ─

const gbkVolume = wipeVolume("gbk")
const gbkLines = ["卷之一", ""]
for (let chapter = 0; chapter < 3; chapter++) {
	gbkLines.push(`第${chapter + 1}章`, "")
	for (let p = 0; p < 3; p++) {
		gbkLines.push(paragraph(chapter * 11 + p * 5, 6), "")
	}
}
const gbkText = `${gbkLines.join("\n").trimEnd()}\n`
write(gbkVolume, "folio-gbk.txt", iconv.encode(gbkText, "gb18030"))

console.log(
	`[testdata] wrote volumes text/ folder/ epub/ docx/ fb2/ html/ gbk/ under ${OUT_DIR}`,
)
