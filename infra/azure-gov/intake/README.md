# Azure Government CUI Intake Baseline

This folder provides implementation-ready Azure Government IaC for the CUI/FCI Intake path with a metadata-only Codex posture.

## What this deploys

- Storage account baseline for intake staging
  - Blob public access disabled
  - Shared Key access disabled
  - TLS 1.2 minimum
  - HTTPS required
  - Default network action deny
- Blob service data-protection settings
  - Soft delete
  - Versioning
  - Change feed
- Defender for Storage pricing plan (`DefenderForStorageV2`)
- Diagnostic settings to Log Analytics
- Project/client-scoped containers
- Optional private endpoint and private DNS zone group
- RBAC assignments for vault import managed identities

## Deployment

1. Prepare `*.bicepparam` file in `parameters/`.
2. Run:

```bash
cd infra/azure-gov/intake
chmod +x deploy.sh verify-baseline.sh
./deploy.sh <subscription-id> <resource-group> ./parameters/example.usgovvirginia.bicepparam
./verify-baseline.sh <resource-group> <storage-account-name>
```

## Operational notes

- Use Entra B2B per-project scoped access as default.
- Use short-lived upload-only user delegation SAS only as fallback.
- Never log raw SAS values in Codex; store hash/reference only.
- Keep plaintext CUI in intake storage and CUI vault only.
