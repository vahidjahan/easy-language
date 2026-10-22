import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateProgress } from '../src/progress.js'

test('aggregates shown and answered events by card and learner-local day', () => {
  const summary = aggregateProgress([
    { id: '1', userId: 'user-a', type: 'shown', cardId: 'bonjour', createdAt: '2026-10-22T09:00:00.000Z', timeZone: 'UTC' },
    { id: '2', userId: 'user-a', type: 'answered', cardId: 'bonjour', correct: true, createdAt: '2026-10-22T09:01:00.000Z', timeZone: 'UTC' },
    { id: '3', userId: 'user-a', type: 'answered', cardId: 'bonjour', correct: false, createdAt: '2026-10-23T09:01:00.000Z', timeZone: 'UTC' },
    { id: '4', userId: 'user-a', type: 'answered', cardId: 'bonjour', correct: true, createdAt: '2026-10-23T02:30:00.000Z', timeZone: 'America/New_York' },
  ])

  assert.deepEqual(summary.daily['2026-10-22'], { correct: 2, incorrect: 0 })
  assert.deepEqual(summary.daily['2026-10-23'], { correct: 0, incorrect: 1 })
  assert.deepEqual(summary.cards.bonjour, { shown: 1, correct: 2, incorrect: 1 })
})
