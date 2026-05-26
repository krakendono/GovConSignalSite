type ExtractedDocumentText = {
  text: string
  extractionMethod: 'plain-text' | 'pdf' | 'docx' | 'metadata-only'
}

const MAX_EXTRACTED_CHARS = 24000

function truncateText(value: string, maxChars = MAX_EXTRACTED_CHARS) {
  if (value.length <= maxChars) {
    return value
  }

  return `${value.slice(0, maxChars - 1)}…`
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function isTextLikeDocument(fileName: string, mimeType: string) {
  const normalizedMime = mimeType.toLowerCase()
  if (
    normalizedMime.startsWith('text/') ||
    normalizedMime.includes('json') ||
    normalizedMime.includes('xml') ||
    normalizedMime.includes('csv')
  ) {
    return true
  }

  const lowerName = fileName.toLowerCase()
  return lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.csv') || lowerName.endsWith('.json') || lowerName.endsWith('.xml')
}

function isPdfDocument(fileName: string, mimeType: string) {
  const lowerName = fileName.toLowerCase()
  return lowerName.endsWith('.pdf') || mimeType.toLowerCase().includes('pdf')
}

function isDocxDocument(fileName: string, mimeType: string) {
  const lowerName = fileName.toLowerCase()
  return (
    lowerName.endsWith('.docx') ||
    mimeType.toLowerCase().includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  )
}

async function extractPlainText(file: File) {
  const rawText = await file.text()
  return truncateText(normalizeText(rawText))
}

async function extractPdfText(file: File) {
  const pdfParseModule = await import('pdf-parse')
  const pdfParse = (pdfParseModule.default ?? pdfParseModule) as (dataBuffer: Buffer) => Promise<{ text?: string }>
  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await pdfParse(buffer)
  return truncateText(normalizeText(result.text ?? ''))
}

async function extractDocxText(file: File) {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return truncateText(normalizeText(result.value ?? ''))
}

export async function extractTextFromUploadedDocument(file: File): Promise<ExtractedDocumentText> {
  const mimeType = file.type || ''

  try {
    if (isTextLikeDocument(file.name, mimeType)) {
      return { text: await extractPlainText(file), extractionMethod: 'plain-text' }
    }

    if (isPdfDocument(file.name, mimeType)) {
      const text = await extractPdfText(file)
      if (text.length > 0) {
        return { text, extractionMethod: 'pdf' }
      }
    }

    if (isDocxDocument(file.name, mimeType)) {
      const text = await extractDocxText(file)
      if (text.length > 0) {
        return { text, extractionMethod: 'docx' }
      }
    }
  } catch {
    // Fall back to metadata-only mode on parser failures.
  }

  return {
    text: `[Document uploaded: ${file.name}. Automatic text extraction is not available for this file type yet.]`,
    extractionMethod: 'metadata-only',
  }
}
