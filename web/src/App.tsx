import { useEffect, useState } from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import { fetchCards, fetchProgress, postLearningEvent } from './api'
import { authConfigured, initializeAuth, signIn, signOut } from './auth'
import { demoCards, type Flashcard } from './cards'
import './App.css'

type DayProgress = {
  correct: number
  incorrect: number
}

type Progress = Record<string, DayProgress>

const progressKey = 'le-francais-progress-v1'
const cardStatsKey = 'le-francais-card-stats-v1'

type CardStats = Record<string, { shown: number; correct: number; incorrect: number }>

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function createDateInfo() {
  const now = new Date()
  return {
    today: dateKey(now),
    label: new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(now).toUpperCase(),
    week: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index))
      return {
        key: dateKey(date),
        label: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
      }
    }),
  }
}

function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(progressKey) || '{}') as Progress
  } catch {
    return {}
  }
}

function normalizeAnswer(value: string) {
  return value
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(le|la|les|un|une|des) /, '')
}

function loadCardStats(): CardStats {
  try {
    return JSON.parse(localStorage.getItem(cardStatsKey) || '{}') as CardStats
  } catch {
    return {}
  }
}

function App() {
  const [dateInfo, setDateInfo] = useState(createDateInfo)
  const [sessionId] = useState(() => crypto.randomUUID())
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [cardStats, setCardStats] = useState<CardStats>(loadCardStats)
  const [cards, setCards] = useState<Flashcard[]>(demoCards)
  const [cardSource, setCardSource] = useState<'demo' | 'api'>('demo')
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [authNotice, setAuthNotice] = useState('')
  const [cardIndex, setCardIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [matchedTranslation, setMatchedTranslation] = useState<string | null>(null)
  const today = dateInfo.today
  const todayProgress = progress[today] ?? { correct: 0, incorrect: 0 }
  const answeredToday = todayProgress.correct + todayProgress.incorrect
  const card = cards[cardIndex % cards.length]
  const week = dateInfo.week.map(({ key, label }) => {
    const day = progress[key] ?? { correct: 0, incorrect: 0 }
    return { label, value: day.correct + day.incorrect, correct: day.correct }
  })
  const weeklyTotal = week.reduce((sum, day) => sum + day.value, 0)

  useEffect(() => {
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timeoutId = window.setTimeout(() => setDateInfo(createDateInfo()), midnight.getTime() - now.getTime())
    return () => window.clearTimeout(timeoutId)
  }, [dateInfo.today])

  useEffect(() => {
    let active = true
    void initializeAuth()
      .then((signedInAccount) => {
        if (active) setAccount(signedInAccount)
      })
      .catch(() => setAuthNotice('Sign-in configuration could not be loaded.'))

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void fetchCards('A1')
      .then((loadedCards) => {
        if (active && loadedCards.length > 0) {
          setCards(loadedCards)
          setCardSource('api')
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!account) return
    void fetchProgress()
      .then((remote) => {
        setProgress(remote.daily)
        setCardStats(remote.cards)
      })
      .catch(() => setAuthNotice('Could not sync progress; this session stays on this device.'))
  }, [account])

  useEffect(() => {
    if (!account || cardSource !== 'api') return
    void postLearningEvent({
      id: `${sessionId}:${cardIndex}:shown`,
      type: 'shown',
      cardId: card.id,
      createdAt: new Date().toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).catch(() => undefined)
  }, [account, card.id, cardIndex, cardSource, sessionId])

  useEffect(() => {
    localStorage.setItem(progressKey, JSON.stringify(progress))
  }, [progress])

  useEffect(() => {
    localStorage.setItem(cardStatsKey, JSON.stringify(cardStats))
  }, [cardStats])

  function revealAnswer() {
    const normalized = normalizeAnswer(answer)
    const match = normalized
      ? card.translations.find((translation) => normalizeAnswer(translation) === normalized) ?? null
      : null
    setMatchedTranslation(match)
    setRevealed(true)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(match ?? card.primary)
      utterance.lang = 'fr-FR'
      window.speechSynthesis.speak(utterance)
    }
  }

  function grade(correct: boolean) {
    setProgress((current) => {
      const day = current[today] ?? { correct: 0, incorrect: 0 }
      return {
        ...current,
        [today]: {
          correct: day.correct + Number(correct),
          incorrect: day.incorrect + Number(!correct),
        },
      }
    })
    setCardStats((current) => {
      const stats = current[card.id] ?? { shown: 0, correct: 0, incorrect: 0 }
      return {
        ...current,
        [card.id]: {
          shown: stats.shown + 1,
          correct: stats.correct + Number(correct),
          incorrect: stats.incorrect + Number(!correct),
        },
      }
    })
    if (account) {
      void postLearningEvent({
        id: crypto.randomUUID(),
        type: 'answered',
        cardId: card.id,
        correct,
        createdAt: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }).catch(() => setAuthNotice('Could not sync this answer yet.'))
    }
    setCardIndex((current) => current + 1)
    setAnswer('')
    setRevealed(false)
    setMatchedTranslation(null)
  }

  function submitAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    revealAnswer()
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#study" aria-label="Le Français home">
          <span className="brand-mark">F.</span>
          <span>le français<br /><strong>est facile</strong></span>
        </a>
        <div className="sidebar-label">YOUR DESK</div>
        <nav aria-label="Main navigation">
          <a className="nav-item active" href="#study"><span className="nav-dot" />Study room</a>
          <a className="nav-item" href="#progress"><span className="nav-dot" />My progress</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-avatar">{account?.name?.slice(0, 1).toUpperCase() ?? 'V'}</div>
          <div><strong>{account?.name ?? 'Guest learner'}</strong><span>{account ? 'External ID profile' : 'Local profile'}</span></div>
          <span className="profile-menu" aria-hidden="true">···</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">LEARNING SPACE <span>/</span> STUDY ROOM</div>
          <div className="topbar-right">
            <span className="local-status"><i />{account ? 'Signed in' : 'Local demo profile'}</span>
            {authConfigured && (account
              ? <button className="auth-button" type="button" onClick={() => void signOut()}>Sign out</button>
              : <button className="auth-button" type="button" onClick={() => void signIn().catch(() => setAuthNotice('Could not start sign-in.'))}>Sign in with email</button>)}
            <button className="avatar-small" aria-label={account?.name ?? 'Guest profile'}>{account?.name?.slice(0, 1).toUpperCase() ?? 'V'}</button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">{dateInfo.label}</p>
              <h1>Bonjour, learner<span>.</span></h1>
              <p className="welcome-copy">A little French, a little more confidence.</p>
            </div>
            <div className="level-stamp"><span>YOUR LEVEL</span><strong>A1</strong><small>First steps</small></div>
          </section>

          <section className="stats-strip" aria-label="Today's learning summary">
            <div className="stat-item"><span className="stat-icon coral">↗</span><div><span className="stat-label">TODAY'S GOAL</span><strong>{answeredToday}<small> / 20 cards</small></strong></div></div>
            <div className="goal-track"><span style={{ width: `${Math.min(answeredToday / 20 * 100, 100)}%` }} /></div>
            <div className="stat-item compact"><span className="stat-icon green">✓</span><div><span className="stat-label">CORRECT TODAY</span><strong>{todayProgress.correct}<small> cards</small></strong></div></div>
            <div className="stat-item compact streak"><span className="stat-icon yellow">✳</span><div><span className="stat-label">DAY STREAK</span><strong>{answeredToday ? '1' : '0'}<small> days</small></strong></div></div>
          </section>

          <div className="section-heading" id="study">
            <div><p className="eyebrow">YOUR DAILY PRACTICE</p><h2>Let's learn something.</h2></div>
            <span className="queue-count">CARD {String(cardIndex + 1).padStart(2, '0')} <b>/</b> 20</span>
          </div>

          <div className="study-layout">
            <section className="flashcard-panel" aria-label="Flashcard">
              <div className="card-topline"><span className="tag-level">{card.level} · {card.kind}</span><span className="card-count">{cardSource === 'api' ? 'SHARED LIBRARY' : 'DEMO CARD'} · SEEN {cardStats[card.id]?.shown ?? 0}</span></div>
              <div className="prompt-area">
                <p className="prompt-label">SAY THIS IN FRENCH</p>
                <h3>{card.english}</h3>
                <p className="prompt-hint">Write the French translation.</p>
              </div>
              {!revealed ? (
                <form className="answer-form" onSubmit={submitAnswer}>
                  <label htmlFor="answer">YOUR ANSWER</label>
                  <div className="answer-input-wrap"><input id="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="French translation" autoComplete="off" required /><button type="submit" className="reveal-button" disabled={!answer.trim()}>Reveal <span aria-hidden="true">→</span></button></div>
                  <p className="speech-note">Accent marks are optional.</p>
                </form>
              ) : (
                <div className="answer-reveal" aria-live="polite">
                  <div className="answer-label">FRENCH TRANSLATION</div>
                  {card.translations.map((translation) => <p className="translation" key={translation}>{translation}{translation === card.primary && <span className="primary-label">MOST COMMON</span>}</p>)}
                  <p className="match-feedback">{matchedTranslation ? 'Your answer matches.' : 'Compare your answer with the accepted translations.'}</p>
                  <button type="button" className="play-button" onClick={() => {
                    if ('speechSynthesis' in window) {
                      window.speechSynthesis.cancel()
                      const utterance = new SpeechSynthesisUtterance(matchedTranslation ?? card.primary)
                      utterance.lang = 'fr-FR'
                      window.speechSynthesis.speak(utterance)
                    }
                  }}><span aria-hidden="true">▶</span> Hear pronunciation</button>
                  <div className="grade-row"><span>How did you do?</span><button type="button" className="grade-wrong" onClick={() => grade(false)}>Not quite</button><button type="button" className="grade-correct" onClick={() => grade(true)}>I got it <span aria-hidden="true">✓</span></button></div>
                </div>
              )}
              <div className="card-footnote"><span>TIP</span> Focus on meaning first; accents come with practice.</div>
            </section>

            <aside className="side-column">
              <section className="week-panel" id="progress">
                <div className="panel-title"><div><p className="eyebrow">A STEADY RHYTHM</p><h3>This week</h3></div><span className="week-total">{weeklyTotal}<small> cards</small></span></div>
                <div className="week-chart" aria-label={`${weeklyTotal} cards answered over the last seven days`}>
                  {week.map((day, index) => <div className="chart-day" key={`${day.label}-${index}`}><div className="bar-track"><span className={index === 6 ? 'bar today' : 'bar'} style={{ height: `${Math.max(day.value / Math.max(...week.map((item) => item.value), 5) * 100, 4)}%` }} /></div><span className={index === 6 ? 'day-label today-label' : 'day-label'}>{day.label}</span></div>)}
                </div>
                <div className="chart-legend"><span><i className="legend-dot" /> Cards answered</span><span>Last 7 days</span></div>
              </section>
              <section className="note-panel">
                <span className="note-mark">“</span>
                <p>Small steps every day add up to real fluency.</p>
                <span className="note-credit">YOUR FRENCH NOTEBOOK</span>
              </section>
            </aside>
          </div>
          <footer className="page-footer"><span>Made for curious minds.</span><span>{authNotice || (account ? 'Learning progress syncs to your profile.' : 'Progress is stored on this device for now.')}</span></footer>
        </div>
      </main>
    </div>
  )
}

export default App
