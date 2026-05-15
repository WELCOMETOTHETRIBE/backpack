targetScope = 'resourceGroup'

@description('Resource ID that should emit diagnostics.')
param targetResourceId string

@description('Log Analytics workspace resource ID.')
param logAnalyticsWorkspaceResourceId string

resource target 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  scope: resourceGroup()
  name: last(split(targetResourceId, '/'))
}

resource diagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${target.name}-diag'
  scope: target
  properties: {
    workspaceId: logAnalyticsWorkspaceResourceId
    logs: [
      {
        category: 'StorageRead'
        enabled: true
      }
      {
        category: 'StorageWrite'
        enabled: true
      }
      {
        category: 'StorageDelete'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'Transaction'
        enabled: true
      }
      {
        category: 'Capacity'
        enabled: true
      }
    ]
  }
}
