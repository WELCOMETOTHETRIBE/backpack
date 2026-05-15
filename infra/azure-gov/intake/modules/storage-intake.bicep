targetScope = 'resourceGroup'

@description('Azure region for the storage account.')
param location string

@description('Storage account name for CUI intake.')
param storageAccountName string

@description('Container names mapped to customer/project scopes.')
param intakeContainers array = []

@description('Optional subnet resource ID for private endpoint creation.')
param privateEndpointSubnetResourceId string = ''

@description('Optional private DNS zone resource ID for privatelink.blob.core.usgovcloudapi.net.')
param privateDnsZoneResourceId string = ''

@description('Principal IDs granted Storage Blob Data Contributor at account scope for vault import automation.')
param vaultManagedIdentityPrincipalIds array = []

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
      ipRules: []
      virtualNetworkRules: []
    }
    encryption: {
      keySource: 'Microsoft.Storage'
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
        file: {
          enabled: true
          keyType: 'Account'
        }
      }
    }
    isHnsEnabled: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  name: '${storageAccount.name}/default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 30
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 30
    }
    isVersioningEnabled: true
    changeFeed: {
      enabled: true
      retentionInDays: 30
    }
  }
}

resource defenderPlan 'Microsoft.Security/pricings@2023-01-01' = {
  name: 'StorageAccounts'
  properties: {
    pricingTier: 'Standard'
    subPlan: 'DefenderForStorageV2'
  }
}

resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [
  for containerName in intakeContainers: {
    name: '${storageAccount.name}/default/${containerName}'
    properties: {
      publicAccess: 'None'
      immutableStorageWithVersioning: {
        enabled: false
      }
    }
    dependsOn: [blobService]
  }
]

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = if (!empty(privateEndpointSubnetResourceId)) {
  name: '${storageAccount.name}-blob-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetResourceId
    }
    privateLinkServiceConnections: [
      {
        name: '${storageAccount.name}-blob-connection'
        properties: {
          privateLinkServiceId: storageAccount.id
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
}

resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-05-01' = if (!empty(privateEndpointSubnetResourceId) && !empty(privateDnsZoneResourceId)) {
  name: '${privateEndpoint.name}/default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob-private-dns'
        properties: {
          privateDnsZoneId: privateDnsZoneResourceId
        }
      }
    ]
  }
}

resource rbacAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in vaultManagedIdentityPrincipalIds: {
    name: guid(storageAccount.id, principalId, 'StorageBlobDataContributor')
    scope: storageAccount
    properties: {
      roleDefinitionId: subscriptionResourceId(
        'Microsoft.Authorization/roleDefinitions',
        'ba92f5b4-2d11-453d-a403-e96b0029c9fe',
      )
      principalId: principalId
      principalType: 'ServicePrincipal'
    }
  }
]

output storageAccountResourceId string = storageAccount.id
output storageAccountName string = storageAccount.name
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
output intakeContainerNames array = [for c in intakeContainers: c]
