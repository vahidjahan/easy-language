import type { JWTPayload } from 'jose'

export class AuthenticationError extends Error {}

type OpenIdMetadata = {
  issuer: string
  jwks_uri: string
}

let metadataPromise: Promise<OpenIdMetadata> | undefined
let jwks: ReturnType<typeof import('jose').createRemoteJWKSet> | undefined

async function getMetadata(): Promise<OpenIdMetadata> {
  const metadataUrl = process.env.ENTRA_METADATA_URL
  if (!metadataUrl) throw new Error('ENTRA_METADATA_URL is not configured.')

  metadataPromise ??= fetch(metadataUrl).then(async (response) => {
    if (!response.ok) throw new Error(`OpenID metadata request failed (${response.status}).`)
    const metadata = await response.json() as OpenIdMetadata
    if (!metadata.issuer || !metadata.jwks_uri) throw new Error('OpenID metadata is missing issuer or jwks_uri.')
    return metadata
  })

  return metadataPromise
}

export async function authenticate(authorization: string | null): Promise<{ userId: string; claims: JWTPayload }> {
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  if (!match) throw new AuthenticationError('Bearer token required.')

  const audience = process.env.ENTRA_API_AUDIENCE
  const requiredScope = process.env.ENTRA_API_SCOPE ?? 'access_as_user'
  if (!audience) throw new Error('ENTRA_API_AUDIENCE is not configured.')

  const metadata = await getMetadata()
  const jose = await import('jose')
  jwks ??= jose.createRemoteJWKSet(new URL(metadata.jwks_uri))

  try {
    const { payload } = await jose.jwtVerify(match[1], jwks, {
      issuer: metadata.issuer,
      audience,
    })
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new AuthenticationError('Token subject is missing.')
    }
    if (typeof payload.scp !== 'string' || !payload.scp.split(' ').includes(requiredScope)) {
      throw new AuthenticationError('Required delegated scope is missing.')
    }
    return { userId: payload.sub, claims: payload }
  } catch (error) {
    if (error instanceof AuthenticationError) throw error
    throw new AuthenticationError('Bearer token is invalid.')
  }
}
