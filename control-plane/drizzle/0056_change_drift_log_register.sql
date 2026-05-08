-- Phase 2 — Configuration Drift Log register provisioning
--
-- Idempotent: copies the change_drift_log register row into every org that
-- already has change_log provisioned (i.e., orgs whose onboarding ran
-- before Phase 2). New orgs get it automatically via seed-data.ts on
-- onboarding.
--
-- Schema: see register_entry_schemas.v1.json — register_id "change_drift_log"
--   - Single entry type: change_drift_acknowledgment
--   - Pattern A lifecycle: draft → admin_signed → isso_verified
--   - Detected by EnclaveWatch's ConfigurationDriftCollector; admin
--     justifies within 72h (Sysmon Event IDs 11/12/13/14 on baseline-
--     protected paths that don't match a change_log entry within ±60min)
--
-- Backs CM 3.4.1 (baseline configuration), 3.4.2 (security configuration
-- settings), 3.4.3 (track + review changes).

INSERT INTO governance_registers (
  organization_id,
  project_id,
  register_key,
  name,
  description,
  required_columns,
  retain_for_days,
  default_cadence_days,
  control_ids
)
SELECT DISTINCT
  gr.organization_id,
  NULL,
  'change_drift_log',
  'Configuration Drift Log',
  'Auto-detected configuration changes on baseline-protected resources that did not match any change_log entry within ±60 minutes. Drafted by EnclaveWatch''s Sysmon-based ConfigurationDriftCollector; admin justifies within 72h or alert escalates to ISSO. Backs CM 3.4.1 / 3.4.2 / 3.4.3.',
  '[{"key":"actor_user","label":"Actor","type":"string"},{"key":"path","label":"Path","type":"string"},{"key":"change_type","label":"Change Type","type":"string"},{"key":"occurred_at","label":"Occurred At","type":"date"}]'::jsonb,
  365 * 3,
  0,
  '["3.4.1","3.4.2","3.4.3"]'::jsonb
FROM governance_registers gr
WHERE gr.register_key = 'change_log'
  AND gr.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM governance_registers gr2
     WHERE gr2.organization_id = gr.organization_id
       AND gr2.register_key = 'change_drift_log'
  );
