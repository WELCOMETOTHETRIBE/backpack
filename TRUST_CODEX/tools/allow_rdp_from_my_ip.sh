#!/usr/bin/env bash
# Add an NSG rule to allow RDP (3389) from this machine's current public IP.
# Use when you need to RDP to the CUI pilot VM from your laptop (no VPN).
# Requires: az login, and permissions on the VM's NSG.
#
# Usage:
#   AZURE_RG=rg-cui-pilot-envclave NSG_NAME=nsg-cui-pilot ./allow_rdp_from_my_ip.sh
#   # Or set your IP explicitly:
#   MY_IP=1.2.3.4 AZURE_RG=... NSG_NAME=... ./allow_rdp_from_my_ip.sh
#
# To remove the rule later: az network nsg rule delete -g $AZURE_RG --nsg-name $NSG_NAME -n Allow-RDP-From-MyIP

set -euo pipefail

AZURE_RG="${AZURE_RG:-rg-cui-pilot-envclave}"
NSG_NAME="${NSG_NAME:-nsg-cui-pilot}"
RULE_NAME="${RULE_NAME:-Allow-RDP-From-MyIP}"
PRIORITY=100
DENY_RULE_NAME="${DENY_RULE_NAME:-Deny-RDP-From-Public-Codex}"
DENY_PRIORITY=200

if [[ -z "${MY_IP:-}" ]]; then
  echo "Detecting your public IP (IPv4 preferred for Azure NSG)..."
  MY_IP=$(curl -sS --max-time 5 -4 https://ipv4.icanhazip.com 2>/dev/null || curl -sS --max-time 5 https://ifconfig.me/ip 2>/dev/null || curl -sS --max-time 5 https://api.ipify.org 2>/dev/null || true)
  if [[ -z "$MY_IP" ]]; then
    echo "Could not detect public IP. Set MY_IP=your.ip.addr and re-run."
    exit 1
  fi
fi

# Azure NSG: IPv4 uses /32, IPv6 uses /128 (many NSGs only support IPv4 for source)
if [[ "$MY_IP" == *:* ]]; then
  PREFIX="${MY_IP}/128"
else
  PREFIX="${MY_IP}/32"
fi

echo "Your public IP: $MY_IP ($PREFIX)"
echo "Adding NSG rule: Allow TCP 3389 from $PREFIX (priority $PRIORITY) to $NSG_NAME in $AZURE_RG..."

# Ensure Deny rule is lower priority than our Allow (Azure priority 100-4096; lower = evaluated first)
CURRENT_DENY_PRIORITY=$(az network nsg rule show -g "$AZURE_RG" --nsg-name "$NSG_NAME" -n "$DENY_RULE_NAME" --query priority -o tsv 2>/dev/null || true)
if [[ -n "$CURRENT_DENY_PRIORITY" ]] && [[ "$CURRENT_DENY_PRIORITY" -le "$PRIORITY" ]]; then
  echo "Setting $DENY_RULE_NAME priority to $DENY_PRIORITY so Allow is evaluated first..."
  az network nsg rule update -g "$AZURE_RG" --nsg-name "$NSG_NAME" -n "$DENY_RULE_NAME" --priority "$DENY_PRIORITY" -o none
fi

# Remove existing allow rule with same name so re-run updates the IP
if az network nsg rule show -g "$AZURE_RG" --nsg-name "$NSG_NAME" -n "$RULE_NAME" &>/dev/null; then
  echo "Removing existing rule $RULE_NAME to update source IP..."
  az network nsg rule delete -g "$AZURE_RG" --nsg-name "$NSG_NAME" -n "$RULE_NAME" -o none
fi

az network nsg rule create \
  --resource-group "$AZURE_RG" \
  --nsg-name "$NSG_NAME" \
  --name "$RULE_NAME" \
  --priority "$PRIORITY" \
  --direction Inbound \
  --access Allow \
  --protocol Tcp \
  --source-address-prefixes "$PREFIX" \
  --source-port-ranges '*' \
  --destination-address-prefixes '*' \
  --destination-port-ranges 3389 \
  -o table

echo "Done. You can RDP to the VM from this IP."
echo "To remove access: az network nsg rule delete -g $AZURE_RG --nsg-name $NSG_NAME -n $RULE_NAME"
echo "To restore Deny priority to 100: az network nsg rule update -g $AZURE_RG --nsg-name $NSG_NAME -n $DENY_RULE_NAME --priority 100"
