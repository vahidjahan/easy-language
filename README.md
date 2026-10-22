# Le Français Est Facile

An installable French-learning flashcard PWA. Learners type an English-to-French answer, reveal all accepted translations, hear a pronunciation, and record a self-grade.

## Current state

- The frontend uses four clearly labeled demo cards when the cards API is unavailable.
- Demo progress is stored in browser local storage; it is not synced across devices.
- Microsoft Entra External ID and the Azure Functions/Cosmos API are wired in code but require local settings and a published API to sign in and sync.
- Azure infrastructure is defined in `infra/main.bicep`. The template provisions resources; it does not publish the web or API code.
- Local Vite HTTPS uses a self-signed development certificate. Browser sign-in requires a trusted development certificate; do not bypass the browser's certificate warning.

## Frontend

Requirements: Node.js 22.12 or later and npm.

```powershell
cd web
npm install
Copy-Item .env.example .env
npm run dev
```

Vite serves `https://localhost:5173`. The API proxy expects Azure Functions Core Tools on port 7071.

Set these values in `web/.env`:

- `VITE_ENTRA_CLIENT_ID`: SPA app registration's client ID.
- `VITE_ENTRA_AUTHORITY`: External ID authority, for example `https://<tenant-subdomain>.ciamlogin.com/`.
- `VITE_ENTRA_API_SCOPE`: the API's delegated scope URI.
- `VITE_API_BASE_URL`: leave blank for local development; set to the deployed API base URL when hosting separately.

## Functions API

Requirements: Azure Functions Core Tools v4, Azurite, and Azure CLI sign-in for local Cosmos access.

```powershell
cd api
npm install
Copy-Item local.settings.example.json local.settings.json
npm start
```

Fill `api/local.settings.json` with the External ID OpenID metadata URL, API audience, and Cosmos endpoint. This file is ignored by Git. The local Functions host uses Azurite for its storage binding and listens on port 7071.

Run the API tests with:

```powershell
npm test
```

## Vocabulary candidates

Set `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, and `AZURE_OPENAI_DEPLOYMENT` in the process environment, then generate unreviewed candidates:

```powershell
cd api
node scripts/generate-cards.mjs A1 20 "everyday greetings"
```

Review the generated JSON with a French speaker. Only reviewed cards with `status: "approved"` and a non-empty `reviewedBy` value can be imported. The importer uses Azure CLI credentials and the Cosmos managed-identity data role; it does not accept a connection key in the file.

## Azure infrastructure

`infra/main.bicep` targets an existing resource group. It configures the Static Web App in East US 2 and Functions/Cosmos DB in France Central. Cosmos DB uses provisioned shared throughput and requests the subscription's lifetime free-tier account; eligibility is limited to one free-tier Cosmos account per subscription. Review the Bicep `what-if` output before deploying, and expect possible charges for storage or usage beyond free allowances.

## Publish from GitHub

The `.github/workflows/deploy.yml` workflow is manual-only and deploys the API first, then the frontend. It does not run on each push. In the repository's **Settings → Secrets and variables → Actions**, add these repository variables:

- `VITE_ENTRA_CLIENT_ID`: SPA app registration client ID.
- `VITE_ENTRA_AUTHORITY`: External ID authority URL.
- `VITE_ENTRA_API_SCOPE`: API delegated scope URI.

Add these repository secrets using values copied directly from the Azure portal. Never commit or paste their values into chat:

- `AZURE_STATIC_WEB_APPS_API_TOKEN`: Static Web App deployment token.
- `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`: Function App publish profile XML.

After configuring them, open **Actions → Deploy Le Français Est Facile → Run workflow** on the default branch. The workflow builds and tests the API, deploys it, builds the PWA with the configured variables, then uploads the static frontend. A successful workflow run is required before the deployment is considered published.
