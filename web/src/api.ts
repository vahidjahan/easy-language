import { getAccessToken } from './auth'
import type { Flashcard } from './cards'

const configuredApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined
const apiBase = configuredApiBase?.trim() ? configuredApiBase.replace(/\/$/, '') : '/api'

export type LearningEvent = {
  id: string
  type: 'shown' | 'answered'
  cardId: string
  correct?: boolean
  createdAt: string
  timeZone: string
}

export type RemoteProgress = {
  daily: Record<string, { correct: number; incorrect: number }>
  cards: Record<string, { shown: number; correct: number; incorrect: number }>
}

async function request(path: string, init: RequestInit = {}, authenticated = false) {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (authenticated) {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in to sync your learning profile.')
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${apiBase}${path}`, { ...init, headers })
  if (!response.ok) throw new Error(`API request failed (${response.status}).`)
  return response
}

export async function fetchCards(level: string): Promise<Flashcard[]> {
  const response = await request(`/cards?level=${encodeURIComponent(level)}`)
  return response.json() as Promise<Flashcard[]>
}

export async function fetchProgress(): Promise<RemoteProgress> {
  const response = await request('/progress', {}, true)
  return response.json() as Promise<RemoteProgress>
}

export async function postLearningEvent(event: LearningEvent) {
  await request('/progress', { method: 'POST', body: JSON.stringify(event) }, true)
}
