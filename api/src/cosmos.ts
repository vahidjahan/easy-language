import { CosmosClient, type Container } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'

let client: CosmosClient | undefined

function getClient() {
  const endpoint = process.env.COSMOS_ENDPOINT
  if (!endpoint) throw new Error('COSMOS_ENDPOINT is not configured.')

  if (!client) {
    client = new CosmosClient({
      endpoint,
      aadCredentials: new DefaultAzureCredential(),
      userAgentSuffix: 'le-francais-est-facile',
    })
  }

  return client
}

export function getContainer(name: string): Container {
  const databaseName = process.env.COSMOS_DATABASE ?? 'le-francais-est-facile'
  return getClient().database(databaseName).container(name)
}
