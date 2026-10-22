import { readFile } from 'node:fs/promises'
import { CosmosClient } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'

const inputPath = process.argv[2]
if (!inputPath) throw new Error('Usage: node scripts/import-cards.mjs <reviewed-cards.json>')

const cards = JSON.parse(await readFile(inputPath, 'utf8'))
if (!Array.isArray(cards) || cards.length === 0) throw new Error('Input must be a non-empty card array.')
for (const card of cards) {
  if (
    card.status !== 'approved' ||
    typeof card.reviewedBy !== 'string' || !card.reviewedBy.trim() ||
    !['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(card.level) ||
    !Array.isArray(card.translations) ||
    !card.translations.includes(card.primary)
  ) {
    throw new Error(`Card ${card.id ?? '(unknown)'} is not approved or does not match the content contract.`)
  }
}

const endpoint = process.env.COSMOS_ENDPOINT
if (!endpoint) throw new Error('COSMOS_ENDPOINT is required.')
const databaseName = process.env.COSMOS_DATABASE ?? 'le-francais-est-facile'
const containerName = process.env.COSMOS_CARDS_CONTAINER ?? 'cards'
const client = new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() })
const container = client.database(databaseName).container(containerName)

for (const card of cards) {
  await container.items.upsert(card, { partitionKey: card.level })
}

console.log(`Imported ${cards.length} reviewed cards into ${databaseName}/${containerName}.`)
