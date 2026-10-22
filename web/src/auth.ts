import {
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
} from '@azure/msal-browser'

const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined
const authority = import.meta.env.VITE_ENTRA_AUTHORITY as string | undefined
const apiScope = import.meta.env.VITE_ENTRA_API_SCOPE as string | undefined

export const authConfigured = Boolean(clientId && authority && apiScope)

let clientPromise: Promise<PublicClientApplication> | undefined

function getClient() {
  if (!authConfigured || !clientId || !authority) {
    throw new Error('Microsoft Entra External ID is not configured.')
  }

  if (!clientPromise) {
    const config: Configuration = {
      auth: {
        clientId,
        authority,
        knownAuthorities: [new URL(authority).hostname],
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    }

    clientPromise = (async () => {
      const client = new PublicClientApplication(config)
      await client.initialize()
      const result = await client.handleRedirectPromise()
      const account = result?.account ?? client.getAllAccounts()[0]
      if (account) client.setActiveAccount(account)
      return client
    })()
  }

  return clientPromise
}

export async function initializeAuth(): Promise<AccountInfo | null> {
  if (!authConfigured) return null
  const client = await getClient()
  return client.getActiveAccount()
}

export async function signIn() {
  if (!apiScope) throw new Error('Microsoft Entra API scope is not configured.')
  const client = await getClient()
  await client.loginRedirect({ scopes: ['openid', 'profile', apiScope] })
}

export async function signOut() {
  const client = await getClient()
  const account = client.getActiveAccount()
  await client.logoutRedirect({ account })
}

export async function getAccessToken(): Promise<string | null> {
  if (!apiScope || !authConfigured) return null
  const client = await getClient()
  const account = client.getActiveAccount()
  if (!account) return null

  const result = await client.acquireTokenSilent({ account, scopes: [apiScope] })
  return result.accessToken
}
