export type Flashcard = {
  id: string
  english: string
  translations: string[]
  primary: string
  level: string
  kind: string
}

export const demoCards: Flashcard[] = [
  { id: 'miss-train', english: 'to miss (a train)', translations: ['rater le train', 'manquer le train'], primary: 'rater le train', level: 'A1', kind: 'verb phrase' },
  { id: 'little-bit', english: 'a little bit', translations: ['un peu', 'un petit peu'], primary: 'un peu', level: 'A1', kind: 'expression' },
  { id: 'nearest-bakery', english: 'Where is the nearest bakery?', translations: ['Où est la boulangerie la plus proche ?', 'Où se trouve la boulangerie la plus proche ?'], primary: 'Où est la boulangerie la plus proche ?', level: 'A2', kind: 'question' },
  { id: 'get-used-to', english: 'to get used to', translations: ["s'habituer à"], primary: "s'habituer à", level: 'B1', kind: 'verb phrase' },
]
