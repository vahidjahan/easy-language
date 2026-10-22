import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DefaultAzureCredential } from "@azure/identity";

const [level, countText, ...topicParts] = process.argv.slice(2);
const allowedLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const count = Number(countText);
const topic = topicParts.join(" ").trim();
const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "");
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

if (
  !allowedLevels.has(level) ||
  !Number.isInteger(count) ||
  count < 1 ||
  count > 100 ||
  !topic
) {
  throw new Error(
    "Usage: node scripts/generate-cards.mjs <A1-C2> <count 1-100> <topic>",
  );
}
if (!endpoint || !deployment) {
  throw new Error(
    "Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT in the process environment.",
  );
}

const credential = new DefaultAzureCredential();
const accessToken = await credential.getToken(
  "https://cognitiveservices.azure.com/.default",
);
if (!accessToken)
  throw new Error("Could not acquire an Azure AI access token.");

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      minItems: count,
      maxItems: count,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "english",
          "level",
          "kind",
          "translations",
          "primary",
          "tags",
        ],
        properties: {
          english: { type: "string" },
          level: { type: "string", enum: [level] },
          kind: { type: "string" },
          translations: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
          primary: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const response = await fetch(`${endpoint}/openai/v1/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken.token}`,
  },
  body: JSON.stringify({
    model: deployment,
    temperature: 0.3,
    response_format: {
      type: "json_schema",
      json_schema: { name: "french_cards", strict: true, schema },
    },
    messages: [
      {
        role: "system",
        content:
          "Create original French-learning flashcards. Do not reproduce or cite copyrighted textbook, exam, or proprietary vocabulary lists. Keep the translations natural and include common valid alternatives. Return only schema-conforming JSON.",
      },
      {
        role: "user",
        content: `Create exactly ${count} original English-to-French ${level} flashcards about: ${topic}. For each card, include all common French translations, choose the most common translation as primary, and use appropriate tags.`,
      },
    ],
  }),
});

if (!response.ok)
  throw new Error(
    `Azure OpenAI request failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
  );
const completion = await response.json();
const content = completion.choices?.[0]?.message?.content;
if (typeof content !== "string")
  throw new Error("Azure OpenAI returned no card content.");
const result = JSON.parse(content);
const seen = new Set();
const cards = result.cards.map((card) => {
  const key = card.english.toLocaleLowerCase("en-US").trim();
  if (seen.has(key))
    throw new Error(`Duplicate English prompt: ${card.english}`);
  seen.add(key);
  if (!card.translations.includes(card.primary))
    throw new Error(
      `Primary translation missing from alternatives: ${card.english}`,
    );
  const id = `${level}-${key
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`.slice(0, 100);
  return { id, ...card, status: "candidate", reviewedBy: null };
});

const outputDirectory = resolve("content/generated");
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(
  outputDirectory,
  `${new Date().toISOString().replace(/[:.]/g, "-")}-${level}.json`,
);
await writeFile(outputPath, `${JSON.stringify(cards, null, 2)}\n`, "utf8");
console.log(`Wrote ${cards.length} unreviewed candidates to ${outputPath}`);
