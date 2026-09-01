# Novel

A column-paginated novel reader for hoardodile: chapter navigation,
per-paragraph messages, and typography settings, all in the app's own
viewer.

## Features

- Reads **txt** (auto-detected UTF-8 / GB18030 / UTF-16, plus explicit
  Shift_JIS / Big5), **markdown**, **html/xhtml**, **epub**, **docx**
  and **fb2** — including chapter folders (every file a chapter) and
  `.fb2.zip` containers.
- Column-paginated reading with font size, line height, letter
  spacing, background and text-encoding settings; chapters are detected
  automatically with a customizable regex.
- Per-paragraph messages, saved reading position, and a chapter side
  sheet for jumping.
- Resources are filterable by format (EPUB / FB2 / DOCX / plain text)
  in the library search filters.

## Requirements

- hoardodile ≥ 0.1.9 (see the repository README for details).
- Trust the repository before installing — plugin code runs server-side in a
  restricted sandbox.
