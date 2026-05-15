targetScope = 'resourceGroup'

@description('Azure region for Gov deployment (example: usgovvirginia).')
param location string = resourceGroup().location

@description('Storage account name for intake staging (3-24 lowercase/numbers).')
param storageAccountName string

@description('Log Analytics workspace resource ID for diagnostic routing.')
param logAnalyticsWorkspaceResourceId string

@description('Container names mapped to client/project scopes.')
param intakeContainers array = []

@description('Optional subnet resource ID for private endpoint.')
param privateEndpointSubnetResourceId string = ''

@description('Optional private DNS zone resource ID for blob endpoint.')
param privateDnsZoneResourceId string = ''

@description('Optional managed identity object IDs that need Blob Data Contributor for import automation.')
param vaultManagedIdentityPrincipalIds array = []

module storage './modules/storage-intake.bicep' = {
  name: 'storage-intake-module'
  params: {
    location: location
    storageAccountName: storageAccountName
    intakeContainers: intakeContainers
    privateEndpointSubnetResourceId: privateEndpointSubnetResourceId
    privateDnsZoneResourceId: privateDnsZoneResourceId
    vaultManagedIdentityPrincipalIds: vaultManagedIdentityPrincipalIds
  }
}

module diagnostics './modules/diagnostics.bicep' = {
  name: 'storage-diagnostics-module'
  params: {
    targetResourceId: storage.outputs.storageAccountResourceId
    logAnalyticsWorkspaceResourceId: logAnalyticsWorkspaceResourceId
  }
}

output storageAccountResourceId string = storage.outputs.storageAccountResourceId
output storageAccountNameOut string = storage.outputs.storageAccountName
output blobEndpoint string = storage.outputs.blobEndpoint
output intakeContainerNames array = storage.outputs.intakeContainerNames
