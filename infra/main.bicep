targetScope = 'resourceGroup'

@description('France Central is the approved app-data region.')
param location string = 'francecentral'

@description('Static Web Apps region; API and database remain in France Central.')
param staticWebAppLocation string = 'eastus2'

@description('Create a new Cosmos account with the subscription lifetime free-tier flag. This is limited to one account per subscription and cannot be enabled later.')
param enableCosmosFreeTier bool = true

@description('OpenID configuration URL for the Microsoft Entra External ID external tenant.')
param entraMetadataUrl string

@description('Audience value from the API access token.')
param entraApiAudience string = '241bccf8-ca09-44d8-ade2-958adc1d18d6'

param entraApiScope string = 'access_as_user'

var suffix = take(uniqueString(resourceGroup().id), 12)
var databaseName = 'le-francais-est-facile'
var cosmosName = 'cosmos-lfe-${suffix}'
var functionName = 'func-lfe-${suffix}'
var storageName = toLower('stlfe${uniqueString(resourceGroup().id)}')
var staticWebAppName = 'swa-lfe-${suffix}'
var cosmosContributorRole = '00000000-0000-0000-0000-000000000002'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosName
  location: location
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: enableCosmosFreeTier
    disableLocalAuth: true
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    publicNetworkAccess: 'Enabled'
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: databaseName
  properties: {
    resource: { id: databaseName }
    options: { throughput: 400 }
  }
}

resource cards 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'cards'
  properties: {
    resource: {
      id: 'cards'
      partitionKey: { paths: ['/level'], kind: 'Hash' }
    }
  }
}

resource learningEvents 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'learning-events'
  properties: {
    resource: {
      id: 'learning-events'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
    }
  }
}

resource functionPlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: 'plan-lfe-${suffix}'
  location: location
  kind: 'linux'
  sku: { name: 'Y1', tier: 'Dynamic' }
  properties: { reserved: true }
}

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: staticWebAppLocation
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: functionName
  location: location
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    httpsOnly: true
    serverFarmId: functionPlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|22'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      cors: {
        allowedOrigins: [ 'https://${staticWebApp.properties.defaultHostname}' ]
        supportCredentials: false
      }
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}' }
        { name: 'COSMOS_ENDPOINT', value: cosmos.properties.documentEndpoint }
        { name: 'COSMOS_DATABASE', value: databaseName }
        { name: 'COSMOS_CARDS_CONTAINER', value: 'cards' }
        { name: 'COSMOS_EVENTS_CONTAINER', value: 'learning-events' }
        { name: 'ENTRA_METADATA_URL', value: entraMetadataUrl }
        { name: 'ENTRA_API_AUDIENCE', value: entraApiAudience }
        { name: 'ENTRA_API_SCOPE', value: entraApiScope }
      ]
    }
  }
  dependsOn: [cards, learningEvents]
}

resource cosmosDataRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, functionApp.id, cosmosContributorRole)
  properties: {
    principalId: functionApp.identity.principalId
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosContributorRole}'
    scope: cosmos.id
  }
}

output staticWebAppName string = staticWebApp.name
output staticWebAppHostname string = staticWebApp.properties.defaultHostname
output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}/api'
output cosmosAccountName string = cosmos.name
output cosmosEndpoint string = cosmos.properties.documentEndpoint
