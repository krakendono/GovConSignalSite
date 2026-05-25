type SummaryInput = {
  title: string
  synopsis: string | null
  agency: string | null
  naicsCode: string | null
  pscCode: string | null
  postedAt: string | null
  responseDeadlineAt: string | null
}

type OpportunitySummary = {
  summaryText: string
  keyPoints: string[]
  pursueSteps: string[]
}

function safeDate(value: string | null) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toLocaleDateString()
}

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function generateOpportunitySummary(input: SummaryInput): OpportunitySummary {
  const synopsis = compactText(input.synopsis ?? '')
  const agency = input.agency ?? 'Unspecified agency'
  const posted = safeDate(input.postedAt)
  const due = safeDate(input.responseDeadlineAt)

  let summaryText = `${input.title} from ${agency}.`
  if (synopsis.length > 0) {
    const excerpt = synopsis.length > 280 ? `${synopsis.slice(0, 277)}...` : synopsis
    summaryText = `${summaryText} ${excerpt}`
  } else {
    summaryText = `${summaryText} No synopsis was provided in the notice feed.`
  }

  const keyPoints = [
    `Agency: ${agency}`,
    `NAICS: ${input.naicsCode ?? 'N/A'}`,
    `PSC: ${input.pscCode ?? 'N/A'}`,
    `Posted: ${posted ?? 'N/A'}`,
    `Response due: ${due ?? 'N/A'}`,
  ]

  const pursueSteps = [
    'Validate fit against your capabilities and past performance before bidding.',
    'Review the full SAM notice, attachments, and submission instructions.',
    'Confirm required certifications, teaming needs, and compliance documents.',
  ]

  return {
    summaryText,
    keyPoints,
    pursueSteps,
  }
}
