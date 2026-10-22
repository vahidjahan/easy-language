export type LearningEvent = {
  id: string
  userId: string
  type: 'shown' | 'answered'
  cardId: string
  correct?: boolean
  createdAt: string
  timeZone: string
}

export type ProgressSummary = {
  daily: Record<string, { correct: number; incorrect: number }>
  cards: Record<string, { shown: number; correct: number; incorrect: number }>
}

export function aggregateProgress(events: LearningEvent[]): ProgressSummary {
  const summary: ProgressSummary = { daily: {}, cards: {} }

  for (const event of events) {
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: event.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(event.createdAt))
    const daily = summary.daily[day] ?? { correct: 0, incorrect: 0 }
    const card = summary.cards[event.cardId] ?? { shown: 0, correct: 0, incorrect: 0 }

    if (event.type === 'shown') {
      card.shown += 1
    } else if (event.correct) {
      daily.correct += 1
      card.correct += 1
    } else {
      daily.incorrect += 1
      card.incorrect += 1
    }

    summary.daily[day] = daily
    summary.cards[event.cardId] = card
  }

  return summary
}
