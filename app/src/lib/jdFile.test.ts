import { describe, expect, it, vi } from 'vitest'
import { jdKindOf, textFromFile, tidyText, wordCount } from './jdFile'

// The readers are stood in for: the test checks what is done with what they give back.
const pdf = vi.hoisted(() => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: async (n: number) => ({
        getTextContent: async () => ({ items: n === 1 ? [{ str: 'Head of Product Marketing', hasEOL: true }, { str: 'Own   launches', hasEOL: false }] : [{ str: 'Report to the CMO', hasEOL: true }] }),
      }),
    }),
    destroy: vi.fn(async () => {}),
  })),
  GlobalWorkerOptions: { workerSrc: '' },
}))
vi.mock('pdfjs-dist', () => pdf)
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.js' }))
const word = vi.hoisted(() => ({ extractRawText: vi.fn(async () => ({ value: 'Senior PMM\r\n\r\n\r\n\r\nLaunches and pricing   \n' })) }))
vi.mock('mammoth', () => ({ default: word }))

const file = (name: string, type: string, body = 'x') => new File([body], name, { type })

describe('the job description from a file', () => {
  it('knows a PDF, a Word file and plain text, and nothing else', () => {
    expect(jdKindOf(file('jd.pdf', ''))).toBe('pdf')
    expect(jdKindOf(file('JD.DOCX', ''))).toBe('docx')
    expect(jdKindOf(file('jd', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe('docx')
    expect(jdKindOf(file('jd.txt', 'text/plain'))).toBe('text')
    expect(jdKindOf(file('jd.doc', 'application/msword'))).toBeNull()
    expect(jdKindOf(file('jd.png', 'image/png'))).toBeNull()
  })

  it('reads a PDF page by page, through the worker it loads itself', async () => {
    expect(await textFromFile(file('jd.pdf', 'application/pdf'))).toBe('Head of Product Marketing\nOwn launches\n\nReport to the CMO')
    expect(pdf.GlobalWorkerOptions.workerSrc).toBe('/pdf.worker.js')
  })

  it('reads a Word file and tidies the blank lines', async () => {
    expect(await textFromFile(file('jd.docx', ''))).toBe('Senior PMM\n\nLaunches and pricing')
    expect(word.extractRawText).toHaveBeenCalledWith({ arrayBuffer: expect.anything() })
  })

  it('says plainly when it cannot', async () => {
    await expect(textFromFile(file('jd.doc', 'application/msword'))).rejects.toThrow('Use a PDF or a Word (.docx) file.')
    word.extractRawText.mockRejectedValueOnce(new Error('bad zip'))
    await expect(textFromFile(file('jd.docx', ''))).rejects.toThrow(/Try pasting the text instead/)
    word.extractRawText.mockResolvedValueOnce({ value: '   ' })
    await expect(textFromFile(file('scan.docx', ''))).rejects.toThrow(/No text found/)
  })

  it('counts words and tidies text', () => {
    expect(wordCount('  Own launches\n\nfor two lines ')).toBe(5)
    expect(wordCount(null)).toBe(0)
    expect(tidyText('a  \n\n\n\nb\r\nc')).toBe('a\n\nb\nc')
  })
})
