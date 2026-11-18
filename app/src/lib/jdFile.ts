// The job description from a file (Jason, 18 November 2026). The text is read
// here, in the browser, and only the text is saved on the search: the file is
// never uploaded or kept. PDF goes through pdfjs-dist and Word (.docx)
// through mammoth, each loaded only when a file of its kind is picked, so
// neither weighs on the first load of the app.

export type JdKind = 'pdf' | 'docx' | 'text'

/** Which reader a file needs, or null when it is not one we can read. */
export function jdKindOf(file: { name: string; type: string }): JdKind | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx'
  if (file.type === 'text/plain' || name.endsWith('.txt')) return 'text'
  return null
}

/** Words in a text, for the "on file, 640 words" line. */
export function wordCount(text: string | null | undefined): number {
  const t = text?.trim()
  return t ? t.split(/\s+/).length : 0
}

/** Tidy what a reader gives back: no runs of blank lines or trailing spaces. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+\n/g, '\n')
    .replace(/[ \t\f\v]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function pdfText(data: ArrayBuffer): Promise<string> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  const doc = await task.promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''))
  }
  await task.destroy()
  return pages.join('\n\n')
}

async function docxText(data: ArrayBuffer): Promise<string> {
  const m = await import('mammoth')
  const mammoth = (m as unknown as { default?: typeof m }).default ?? m
  const { value } = await mammoth.extractRawText({ arrayBuffer: data })
  return value
}

/** The text of a PDF, Word (.docx) or plain text file. Throws a plain sentence when it cannot. */
export async function textFromFile(file: File): Promise<string> {
  const kind = jdKindOf(file)
  if (!kind) throw new Error('Use a PDF or a Word (.docx) file.')
  let raw: string
  try {
    raw = kind === 'text' ? await file.text() : kind === 'pdf' ? await pdfText(await file.arrayBuffer()) : await docxText(await file.arrayBuffer())
  } catch {
    throw new Error('Could not read that file. Try pasting the text instead.')
  }
  const text = tidyText(raw)
  if (!text) throw new Error('No text found in that file. If it is a scan, paste the text instead.')
  return text
}
