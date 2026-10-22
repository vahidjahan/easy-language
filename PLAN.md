# Le Français Est Facile - Plan

PWA flashcards for learning French (English prompt, typed French answer with pronunciation playback). Microsoft Entra External ID sign-in, per-user progress, adaptive A1 to C2.

## 1. Decisions

| Topic | Decision | Notes |
|---|---|---|
| Hosting | Azure (approved) | Static Web Apps frontend in East US 2; separate Functions API and Cosmos DB in France Central |
| Frontend | React, Vite, TypeScript, `vite-plugin-pwa` | Installable, offline shell |
| Auth | Microsoft Entra External ID, public external tenant, email one-time code | SPA uses MSAL authorization code with PKCE; API validates its delegated access token |
| API | Azure Functions (Node, TS) | Separate Function App, managed identity to Cosmos |
| Database | Azure Cosmos DB for NoSQL, provisioned shared throughput | Free-tier account; shared database at 400 RU/s |
| Answer input | Typed French only | No microphone access or speech recognition |
| Pronunciation audio | Pre-generated with Azure AI Speech neural TTS, stored in Blob Storage (CDN) | Generated once at build time, see section 6 |
| Content generation | Azure OpenAI (or another approved model), reviewed by a French speaker | See section 6 |
| Daily goal | Count-based (cards answered per day) | Default 20, configurable |

## 2. Typed answers and pronunciation

- Users type the French answer; the app requests no microphone permission and sends no user voice audio to a service.
- Typed input works in iOS Safari and installed PWAs without browser-specific speech APIs.
- Accept any listed translation after normalization. Keep self-grade controls for cases where the matcher is wrong.
- Pronunciation remains available using pre-generated Azure AI Speech neural TTS audio (`fr-FR`), stored with the shared content. Use the browser's speech synthesis only as a local prototype fallback.
- Free tier (F0, verify current limits before launch): about 0.5M characters per month for neural TTS. Generate audio in batches and move to paid only when quotas are reached.
- iOS requires audio playback to start from a user gesture. Play pronunciation after the user taps to reveal or the playback control.

## 3. Data model

Shared content (read-only):
Shared content (read-only, partition key `level`):
```
Card {
  id, level: "A1".."C2", kind, english,
  translations: string[], primary: string,
  tags[], status: "candidate" | "approved", reviewedBy?
}
```

Per user event data (partition key `userId`):
```
LearningEvent { id, userId, type: "shown" | "answered", cardId, correct?, createdAt, timeZone }
UserProfile   { userId, displayName, currentLevel, dailyGoal, settings, createdAt }
```
The current implementation appends idempotent learning events and aggregates daily/per-card totals on read. Weekly stats derive from daily totals; no separate stats store.

## 4. Learning engine

- Scheduling: Leitner boxes. Correct moves the card up and pushes `nextDue` out. Incorrect resets it to box 1.
- Queue selection per session:
  1. Due cards, lowest accuracy (`correct / shown`) first.
  2. New cards from the current level, capped per day (default 10).
  3. A few weak cards mixed in.
- Level progression: unlock the next level when, for the current level, at least 80% of its cards are in box 3 or higher and recent accuracy is at least 75%. Both values are configurable. Manual level up/down in settings.

## 5. Answer evaluation

1. Normalize the typed answer and all accepted answers: lowercase, strip accents and punctuation, collapse whitespace, optional leading article.
2. Accept if it matches any `translations[].french`. Fuzzy matching may tolerate typos, with a stricter threshold on short words.
3. On flip: show all translations.
4. Play audio for one translation only: the one the user matched, otherwise the `primary` one.
5. Keep override buttons (I was right / I was wrong) so learners can correct a matching mistake.

## 6. Content and audio generation (pipeline, offline, in repo)

1. Seed lists: CEFR-level vocabulary and phrase topics per level (A1 to C2).
2. Generate cards with Azure OpenAI: English, common French translations, the most common marked `primary`, level, and tags. Output as JSON validated against a schema.
3. Validation: schema check, duplicate detection, level sanity checks, then human review by a French speaker before import. Do not ship unreviewed content.
4. Audio: for each card, synthesize only the primary translation (and any other translation that may be played) with Azure neural TTS (`fr-FR-DeniseNeural` or similar), as MP3. Upload to Blob Storage behind a CDN. Store `audioUrl` on the card.
5. Budget: the free TTS quota is about 0.5M characters per month. About 5,000 cards at about 20 characters each is about 100K characters, so it fits. Generate in batches and make the job idempotent (skip existing audio).
6. Import into Cosmos DB with a script. Seed first with about 500 A1/A2 cards, then expand level by level.
- Check licensing of any external word list used as a seed. Adding a source is a person's decision.

## 7. Screens

- Login (Microsoft Entra External ID email code).
- Dashboard: level, due count, daily goal progress (cards answered / goal), streak.
- Study: English prompt, required typed answer, reveal, all accepted translations, pronunciation playback, self-grade and next.
- Stats: daily record and weekly chart (7 days, 4 weeks).
- Settings: level, daily goal, new-card limit, answer-matching preferences, voice speed.

## 8. API

## 8. API
- `GET /api/cards?level=A1`: approved shared cards.
- `GET /api/progress`: current user's daily and per-card aggregates.
- `POST /api/progress`: append a shown/answered event; identity always comes from the validated Entra token, never the request body.

## 9. PWA and offline

- Manifest, install prompt, Workbox precache of the app shell.
- Cache the current card set and audio in IndexedDB / Cache Storage.
- Queue answer events offline and sync later. Send deltas, not absolute counters.
- Offline: typed answers work without a connection; cache pronunciation audio with the card set.
- iOS: no install prompt event, so show "Add to Home Screen" instructions. Test standalone mode specifically.

## 10. Security and privacy

- Server-side Entra access-token validation (issuer, audience, expiry, delegated scope). Persist only the opaque subject and learning data; display name stays client-side unless a profile feature needs it.
- No secrets in the client. TTS generation credentials stay in the offline content pipeline.
- Secrets in Key Vault or app settings, never in the repo.
- HTTPS only, CSP, rate limiting on token and progress endpoints.

## 11. Phases

1. Foundation: PWA shell, External ID sign-in, profile, IaC for Azure.
2. Content pipeline: generation, review, TTS audio, import (seed A1/A2).
3. Core study loop: typed-answer UI, multi-translation matching, pronunciation playback and progress recording.
4. Engine: scheduling, queue selection, level progression.
5. Stats: daily goal and daily/weekly views.
6. Offline and sync, iOS standalone testing.
7. Content expansion to C2, accessibility, cost monitoring on speech quotas.

## 12. Decided

## 12. Decided
- Content generation: Azure OpenAI (approved).
- Public sign-in: Microsoft Entra External ID external tenant with email one-time-code flow.
- Hosting: Static Web Apps Free in East US 2; Functions and Cosmos DB in France Central.
- Cosmos: provisioned free tier, shared database throughput set to 400 RU/s. Free tier provides up to 1,000 RU/s and 25 GB per subscription; it is unavailable for serverless accounts and only one account per subscription can receive the lifetime free discount.
- Pronunciation: Azure Speech F0 for generated neural TTS only; no speech recognition.
- Vocabulary: generated with Azure OpenAI from our own prompts, not copied from third-party lists.

## 13. Open items

- Confirm the selected subscription has no existing Cosmos DB free-tier account and that France Central offers the selected Cosmos and Speech services.
- Configure the External ID tenant, SPA registration, API registration, delegated `access_as_user` scope, and email one-time-code user flow; enter the non-secret IDs/authority in local environment config.
- Licensing: generate vocabulary from scratch. Do not paste or feed in proprietary word lists (for example official DELF/DALF or textbook lists) as source material. Confirm with company legal that publishing Azure OpenAI output and pre-generated Azure TTS audio inside the app is covered by the Microsoft terms.
