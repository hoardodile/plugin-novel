# Novela

Un plugin de contenido para hoardodile: un lector de novelas paginado en
columnas con navegación por capítulos, mensajes por párrafo y ajustes de
tipografía en el visor de la app.

## Funciones

- Lee **txt** (detección automática de UTF-8 / GB18030 / UTF-16, además de
  Shift_JIS / Big5 explícito), **markdown**, **html/xhtml**, **epub**,
  **docx** y **fb2** — incluidos carpetas de capítulos (cada archivo es un
  capítulo) y contenedores `.fb2.zip`.
- Lectura paginada en columnas con tamaño de fuente, interlineado,
  espaciado entre letras, fondo y codificación de texto; los capítulos se
  detectan automáticamente (expresión regular personalizable).
- Mensajes por párrafo, posición de lectura guardada y panel de capítulos
  para saltar.
- Los recursos se pueden filtrar por formato (EPUB / FB2 / DOCX / texto
  plano) en los filtros de búsqueda de la biblioteca.

## Requisitos

- hoardodile ≥ 0.1.6 (consulta el README del repositorio).
- Confía en el repositorio antes de instalarlo: el código del plugin se
  ejecuta en el servidor dentro de un sandbox restringido.
