using '../main.bicep'

param location = 'usgovvirginia'
param storageAccountName = 'mactechcuiintake001'
param logAnalyticsWorkspaceResourceId = '/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.OperationalInsights/workspaces/<workspace>'
param intakeContainers = [
  'clienta-projectx-intake'
  'clientb-projecty-intake'
]
param privateEndpointSubnetResourceId = '/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.Network/virtualNetworks/<vnet>/subnets/<subnet>'
param privateDnsZoneResourceId = '/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.Network/privateDnsZones/privatelink.blob.core.usgovcloudapi.net'
param vaultManagedIdentityPrincipalIds = [
  '<vault-vm-managed-identity-principal-id>'
]
