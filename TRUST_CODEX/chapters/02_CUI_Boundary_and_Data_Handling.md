# CUI Boundary Definition & Data Handling

## Boundary statement (pilot)

This pilot is a **contained CUI enclave**. CUI is permitted only within the enclave boundary and approved storage mechanisms inside the enclave.

### In-scope boundary components (pilot defaults)

- **Compute/OS**: Windows Server 2025 Datacenter systems that comprise the enclave
- **Identity**: Microsoft Entra ID as the identity source of truth for authentication and privileged access governance
- **Administrative access**: VPN + RDP to enclave VM (no public RDP)
- **Networking**: Azure virtual network segmentation supporting enclave isolation and controlled ingress
- **Logging**: Centralized log collection and retention (1-year baseline)

### Explicit out-of-scope components (pilot defaults)

- Unmanaged endpoints and personal devices (no direct access path)
- Public networks as trust anchors (internet is transit, not trust)
- Removable media workflows (disallowed in pilot)
- Any customer-facing application layer (not in pilot scope)

## Data handling rules (pilot defaults)

### Allowed data types

- Controlled Unclassified Information (CUI) as defined by applicable contracts and the CUI Registry
- System/security telemetry required to operate and assess the enclave (audit logs, configuration state, inventory)

### Prohibited data types (pilot baseline)

- Classified information (any level)
- Prohibited personally identifiable information (PII) beyond what is explicitly authorized by contract/system purpose

## Movement of CUI

The pilot baseline is designed to reduce audit ambiguity:
- **No removable media**
- **No clipboard/drive redirection**
- **File movement only via approved, logged mechanisms**

Where “approved mechanisms” exist, they must:
- Be explicitly documented
- Produce audit-relevant logs
- Have defined retention and ownership

