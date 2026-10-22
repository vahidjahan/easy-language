import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { getContainer } from './cosmos.js'
import { authenticate, AuthenticationError } from './identity.js'
import { aggregateProgress, type LearningEvent } from './progress.js'

const levels = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' }

function json(status: number, body: unknown): HttpResponseInit {
  return { status, headers: jsonHeaders, jsonBody: body }
}

async function handleError(error: unknown, context: InvocationContext): Promise<HttpResponseInit> {
  if (error instanceof AuthenticationError) return json(401, { error: 'unauthorized' })
  context.error(error)
  return json(503, { error: 'service_unavailable' })
}

app.http('cards', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cards',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const level = request.query.get('level') ?? 'A1'
    if (!levels.has(level)) return json(400, { error: 'invalid_level' })

    try {
      const container = getContainer(process.env.COSMOS_CARDS_CONTAINER ?? 'cards')
      const query = {
        query: 'SELECT c.id, c.level, c.kind, c.english, c.translations, c.primary FROM c WHERE c.level = @level AND c.status = @status',
        parameters: [
          { name: '@level', value: level },
          { name: '@status', value: 'approved' },
        ],
      }
      const { resources } = await container.items.query(query, { partitionKey: level }).fetchAll()
      return json(200, resources)
    } catch (error) {
      return handleError(error, context)
    }
  },
})

app.http('progress', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'progress',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const { userId } = await authenticate(request.headers.get('authorization'))
      const container = getContainer(process.env.COSMOS_EVENTS_CONTAINER ?? 'learning-events')

      if (request.method === 'POST') {
        const body = await request.json().catch(() => null) as Partial<LearningEvent> | null
        if (
          !body ||
          typeof body.id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(body.id) ||
          typeof body.cardId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(body.cardId) ||
          (body.type !== 'shown' && body.type !== 'answered') ||
          (body.type === 'answered' && typeof body.correct !== 'boolean') ||
          typeof body.createdAt !== 'string' || !Number.isFinite(Date.parse(body.createdAt)) ||
          typeof body.timeZone !== 'string'
        ) {
          return json(400, { error: 'invalid_learning_event' })
        }

        try {
          new Intl.DateTimeFormat('en', { timeZone: body.timeZone })
        } catch {
          return json(400, { error: 'invalid_time_zone' })
        }

        const createdAt = new Date(body.createdAt).toISOString()
        if (Date.parse(createdAt) > Date.now() + 5 * 60 * 1000) {
          return json(400, { error: 'event_date_in_future' })
        }

        const event: LearningEvent = {
          id: body.id,
          userId,
          type: body.type,
          cardId: body.cardId,
          ...(body.type === 'answered' ? { correct: body.correct } : {}),
          createdAt,
          timeZone: body.timeZone,
        }

        try {
          await container.items.create(event)
        } catch (error) {
          if ((error as { code?: number }).code === 409) return json(200, { duplicate: true })
          throw error
        }

        return json(201, { accepted: true })
      }

      const query = {
        query: 'SELECT c.id, c.userId, c.type, c.cardId, c.correct, c.createdAt FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: userId }],
      }
      const { resources } = await container.items.query<LearningEvent>(query, {
        partitionKey: userId,
      }).fetchAll()
      return json(200, aggregateProgress(resources))
    } catch (error) {
      return handleError(error, context)
    }
  },
})
