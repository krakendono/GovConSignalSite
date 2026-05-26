import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { loadProposalWorkspaceData } from '@/lib/proposal-workspace'

export const runtime = 'nodejs'

function makeParagraph(text: string, bold = false) {
  return new Paragraph({ children: [new TextRun({ text, bold })] })
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

  const qaPairs = draft?.question_answers ?? []
  const scopeItems = draft?.proposal_sections.scope ?? []
  const approachItems = draft?.proposal_sections.approach ?? []
  const pastPerformanceClaims = draft?.proposal_sections.pastPerformanceClaims ?? []

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: workspace.brief.title, heading: HeadingLevel.TITLE }),
          makeParagraph(`Agency: ${workspace.brief.agency}`),
          makeParagraph(`Company: ${workspace.companyName}`),
          makeParagraph(`Posted: ${workspace.brief.postedAt ?? 'N/A'}`),
          makeParagraph(`Response due: ${workspace.brief.responseDeadlineAt ?? 'N/A'}`),
          new Paragraph({ text: 'Executive Summary', heading: HeadingLevel.HEADING_1 }),
          makeParagraph(draft?.proposal_summary || workspace.brief.summaryText || 'No summary saved yet.'),
          new Paragraph({ text: 'Response Strategy', heading: HeadingLevel.HEADING_1 }),
          makeParagraph(draft?.response_strategy || workspace.research.aiSummary || 'No strategy saved yet.'),
          new Paragraph({ text: 'Compliance Checklist', heading: HeadingLevel.HEADING_1 }),
          makeParagraph(draft?.compliance_checklist || workspace.research.missingDocumentSignals.join('\n') || 'No checklist saved yet.'),
          new Paragraph({ text: 'Risk Notes', heading: HeadingLevel.HEADING_1 }),
          makeParagraph(draft?.risk_notes || 'No risk notes saved yet.'),
          new Paragraph({ text: 'Scope Builder', heading: HeadingLevel.HEADING_1 }),
          ...(scopeItems.length > 0
            ? scopeItems.flatMap((item) => [
                makeParagraph(item.title || 'Untitled scope item', true),
                makeParagraph(item.detail || 'No detail saved yet.'),
                makeParagraph(`Evidence: ${item.evidence || 'No evidence saved yet.'}`),
              ])
            : [makeParagraph('No scope items saved yet.')]),
          new Paragraph({ text: 'Approach Builder', heading: HeadingLevel.HEADING_1 }),
          ...(approachItems.length > 0
            ? approachItems.flatMap((item) => [
                makeParagraph(item.title || 'Untitled approach item', true),
                makeParagraph(item.detail || 'No detail saved yet.'),
                makeParagraph(`Evidence: ${item.evidence || 'No evidence saved yet.'}`),
              ])
            : [makeParagraph('No approach items saved yet.')]),
          new Paragraph({ text: 'Past Performance Claims', heading: HeadingLevel.HEADING_1 }),
          ...(pastPerformanceClaims.length > 0
            ? pastPerformanceClaims.flatMap((item) => [
                makeParagraph(item.claim || 'Untitled claim', true),
                makeParagraph(`Evidence: ${item.evidence || 'No evidence saved yet.'}`),
                makeParagraph(`Relevance: ${item.relevance || 'No relevance saved yet.'}`),
              ])
            : [makeParagraph('No past performance claims saved yet.')]),
          new Paragraph({ text: 'AI Questions', heading: HeadingLevel.HEADING_1 }),
          ...workspace.questions.flatMap((question) => [
            makeParagraph(question.question, true),
            makeParagraph(question.rationale),
            makeParagraph(qaPairs.find((item) => item.question === question.question)?.answer || 'No answer saved yet.'),
          ]),
          new Paragraph({ text: 'Historical Intelligence', heading: HeadingLevel.HEADING_1 }),
          makeParagraph(workspace.brief.awardHistory?.summaryText || 'No historical award intelligence stored yet.'),
        ],
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="proposal-${opportunityId}.docx"`,
    },
  })
}
