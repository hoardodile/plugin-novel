# Roman

Ein Inhalts-Plugin für hoardodile: ein spaltenpaginierter Roman-Leser mit
Kapitelnavigation, Absatz-Kommentaren und Typografie-Einstellungen im
Viewer der App.

## Funktionen

- Liest **txt** (automatische Erkennung von UTF-8 / GB18030 / UTF-16,
  explizit außerdem Shift_JIS / Big5), **markdown**, **html/xhtml**,
  **epub**, **docx** und **fb2** — inklusive Kapitelordnern (jede Datei
  ein Kapitel) und `.fb2.zip`-Containern.
- Spaltenpaginierte Leseansicht mit Schriftgröße, Zeilenhöhe,
  Zeichenabstand, Hintergrund und Textkodierung; Kapitel werden
  automatisch erkannt (anpassbarer Ausdruck).
- Absatz-Kommentare, gespeicherte Leseposition und ein Kapitel-Panel zum
  Springen.
- Ressourcen lassen sich im Suchfilter der Bibliothek nach Format
  (EPUB / FB2 / DOCX / reiner Text) filtern.

## Anforderungen

- hoardodile ≥ 0.1.1 (Details im README des Repositories).
- Vertraue dem Repository, bevor du es installierst — Plugin-Code läuft
  serverseitig in einer eingeschränkten Sandbox.
