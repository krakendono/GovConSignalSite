import PDFDocument from 'pdfkit'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { loadProposalWorkspaceData } from '@/lib/proposal-workspace'

export const runtime = 'nodejs'

function addWrappedText(doc: any, text: string, x: number, y: number, width: number, options: Record<string, unknown> = {}) {
  doc.text(text, x, y, { width, ...options })
  return doc.y
}

export async function GET(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured yet' }, { status: 503 })
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  const workspace = await loadProposalWorkspaceData(supabase, user.id, opportunityId)
  if (!workspace) {
    return NextResponse.json({ error: 'Proposal workspace not found' }, { status: 404 })
  }

  const draft = workspace.draft
  if (!draft?.export_ready) {
    return NextResponse.json({ error: 'Mark draft as ready before exporting' }, { status: 400 })
  }

  const scopeItems = draft?.proposal_sections.scope ?? []
  const approachItems = draft?.proposal_sections.approach ?? []
  const pastPerformanceClaims = draft?.proposal_sections.pastPerformanceClaims ?? []
  const chunks: Buffer[] = []
  const doc = new PDFDocument({ margin: 48, size: 'LETTER' })

  doc.on('data', (chunk) => chunks.push(chunk))

  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  doc.fontSize(20).text(workspace.brief.title, { underline: true })
  doc.moveDown(0.5)
  doc.fontSize(11).text(`Agency: ${workspace.brief.agency}`)
  doc.text(`Company: ${workspace.companyName}`)
  doc.text(`Posted: ${workspace.brief.postedAt ?? 'N/A'}`)
  doc.text(`Response due: ${workspace.brief.responseDeadlineAt ?? 'N/A'}`)
  doc.moveDown()

  doc.fontSize(14).text('Executive Summary', { underline: true })
  addWrappedText(doc, draft?.proposal_summary || workspace.brief.summaryText || 'No summary saved yet.', 48, doc.y + 4, 516)
  doc.moveDown()

  doc.fontSize(14).text('Response Strategy', { underline: true })
  addWrappedText(doc, draft?.response_strategy || workspace.research.aiSummary || 'No strategy saved yet.', 48, doc.y + 4, 516)
  doc.moveDown()

  doc.fontSize(14).text('Compliance Checklist', { underline: true })
  addWrappedText(doc, draft?.compliance_checklist || workspace.research.missingDocumentSignals.join('\n') || 'No checklist saved yet.', 48, doc.y + 4, 516)
  doc.moveDown()

  doc.fontSize(14).text('Risk Notes', { underline: true })
  addWrappedText(doc, draft?.risk_notes || 'No risk notes saved yet.', 48, doc.y + 4, 516)
  doc.moveDown()

  doc.fontSize(14).text('Scope Builder', { underline: true })
  if (scopeItems.length > 0) {
    for (const item of scopeItems) {
      doc.font('Helvetica-Bold').fontSize(11).text(item.title || 'Untitled scope item')
      doc.font('Helvetica').fontSize(10).text(item.detail || 'No detail saved yet.')
      doc.fontSize(10).text(`Evidence: ${item.evidence || 'No evidence saved yet.'}`)
      doc.moveDown(0.5)
    }
  } else {
    doc.font('Helvetica').fontSize(10).text('No scope items saved yet.')
    doc.moveDown(0.5)
  }

  doc.fontSize(14).text('Approach Builder', { underline: true })
  if (approachItems.length > 0) {
    for (const item of approachItems) {
      doc.font('Helvetica-Bold').fontSize(11).text(item.title || 'Untitled approach item')
      doc.font('Helvetica').fontSize(10).text(item.detail || 'No detail saved yet.')
      doc.fontSize(10).text(`Evidence: ${item.evidence || 'No evidence saved yet.'}`)
      doc.moveDown(0.5)
    }
  } else {
    doc.font('Helvetica').fontSize(10).text('No approach items saved yet.')
    doc.moveDown(0.5)
  }

  doc.fontSize(14).text('Past Performance Claims', { underline: true })
  if (pastPerformanceClaims.length > 0) {
    for (const item of pastPerformanceClaims) {
      doc.font('Helvetica-Bold').fontSize(11).text(item.claim || 'Untitled claim')
      doc.font('Helvetica').fontSize(10).text(`Evidence: ${item.evidence || 'No evidence saved yet.'}`)
      doc.fontSize(10).text(`Relevance: ${item.relevance || 'No relevance saved yet.'}`)
      doc.moveDown(0.5)
    }
  } else {
    doc.font('Helvetica').fontSize(10).text('No past performance claims saved yet.')
    doc.moveDown(0.5)
  }

  doc.fontSize(14).text('AI Questions', { underline: true })
  doc.moveDown(0.25)
  for (const question of workspace.questions) {
    doc.font('Helvetica-Bold').fontSize(11).text(question.question)
    doc.font('Helvetica').fontSize(10).text(question.rationale)
    doc.fontSize(10).text(draft?.question_answers.find((item) => item.question === question.question)?.answer || 'No answer saved yet.')
    doc.moveDown(0.5)
  }

  doc.fontSize(14).text('Historical Intelligence', { underline: true })
  addWrappedText(doc, workspace.brief.awardHistory?.summaryText || 'No historical award intelligence stored yet.', 48, doc.y + 4, 516)

  doc.end()
  const buffer = await finished

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="proposal-${opportunityId}.pdf"`,
    },
  })
}
