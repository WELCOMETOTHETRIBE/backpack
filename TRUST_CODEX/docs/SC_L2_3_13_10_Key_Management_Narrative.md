# SC.L2-3.13.10 — Cryptographic key management

**Control:** NIST SP 800-171 Rev.2 § 3.13.10 — Control and manage cryptographic keys.

**Document purpose:** Implementation narrative and evidence reference for CMMC Level 2. Describes how the pilot implements key management and how to collect evidence.

---

## 1. Implementation summary

The CUI pilot uses **Azure Key Vault** as the cryptographic key management solution for the enclave. A dedicated Key Vault (e.g. `codex-cui-kv-pilot`) is provisioned in the enclave resource group. Keys, secrets, and certificates used to protect CUI (e.g. encryption keys, API keys, TLS certs) are stored and accessed through Key Vault with access controlled via Azure RBAC and/or Key Vault access policies. Key Vault provides FIPS 140-2 validated cryptographic operations and audit logging of access.

---

## 2. Key management practices

- **Provisioning:** Key Vault is created in the same subscription and resource group as the enclave (e.g. `rg-cui-pilot-envclave`). The Microsoft.KeyVault resource provider must be registered before creation.
- **Access control:** Access to keys/secrets/certificates is restricted by:
  - **Key Vault Access Policy** and/or **Azure RBAC for Key Vault** (Key Vault Administrator, Crypto User, etc.). Only designated identities (managed identities, service principals, or user accounts) are granted get/list/encrypt/decrypt as needed.
  - Network restrictions (Key Vault firewall / private endpoint) can be configured to limit access to enclave networks.
- **Key lifecycle:** Keys are created, rotated, and revoked within Key Vault. Key Vault supports key rotation and versioning. Disabled or expired keys are not used for new operations.
- **Audit:** Key Vault integrates with Azure Monitor / Log Analytics; access to vault, keys, and secrets can be logged for audit (diagnostic settings).

---

## 3. Evidence and validation

| Evidence type | Location / artifact | Use |
|---------------|---------------------|-----|
| Key Vault list | `evidence/runs/<RunId>/raw/azure/keyvault-list.json` | Proves at least one Key Vault exists in scope (validator AZ-KEYVAULT PASS when non-empty). |
| Key Vault access policy (optional) | `evidence/runs/<RunId>/raw/azure/keyvault-<name>-access-policies.json` | Documents who can access keys/secrets; strengthens assessor narrative. |
| RBAC on Key Vault (optional) | `evidence/runs/<RunId>/raw/azure/role-assignments-all.json` (filter by Key Vault scope) or dedicated export | Shows role assignments scoped to the vault. |

**Regeneration:**

- **Key Vault list:** Produced by `TRUST_CODEX/tools/export_azure_evidence.sh` (calls `az keyvault list -o json`). Stored in run `raw/azure/keyvault-list.json`.
- **Access policy export (recommended for full defensibility):** Run the commands in §4 below and place outputs in the same run `raw/azure/` folder.

**Validator:** `validate_azure_entra.py` — AZ-KEYVAULT check PASS when `keyvault-list.json` exists and contains at least one vault.

---

## 4. Exporting Key Vault access policy and RBAC (hardening step)

Run these after `export_azure_evidence.sh` (or as part of a monthly evidence run). Replace `<RunId>`, `<keyvault-name>`, and `<resource-group>` with your values (e.g. `codex-cui-kv-pilot`, `rg-cui-pilot-envclave`).

```bash
# From repo root, with OUT_DIR set to the run’s raw/azure folder
OUT_DIR="evidence/runs/<RunId>/raw/azure"
KV_NAME="codex-cui-kv-pilot"
AZURE_RG="rg-cui-pilot-envclave"

# Access policies (if using vault access policies)
az keyvault show --name "$KV_NAME" -o json > "$OUT_DIR/keyvault-${KV_NAME}-show.json"
az keyvault show --name "$KV_NAME" --query "properties.accessPolicies" -o json > "$OUT_DIR/keyvault-${KV_NAME}-access-policies.json" 2>/dev/null || true

# Role assignments scoped to the Key Vault (RBAC)
KV_ID=$(az keyvault show --name "$KV_NAME" --query id -o tsv)
az role assignment list --scope "$KV_ID" -o json > "$OUT_DIR/keyvault-${KV_NAME}-role-assignments.json" 2>/dev/null || echo "[]" > "$OUT_DIR/keyvault-${KV_NAME}-role-assignments.json"
```

Store the resulting JSON files in the evidence run and reference them in the control bundle for SC.L2-3.13.10.

---

## 5. References

- **Evidence Index:** `tables/EVIDENCE_INDEX.md` — SC.L2-3.13.10 row.
- **Runbook:** `docs/EVIDENCE_RUNBOOK.md` §5a; `docs/SC.L2-3.13.10-KEYVAULT-POAM-CLOSEOUT.md`.
- **Validator:** `tools/validate_azure_entra.py` (AZ-KEYVAULT).
- **Policy:** Organization policy on cryptographic key management (governance bundle); this narrative is the technical implementation description.
