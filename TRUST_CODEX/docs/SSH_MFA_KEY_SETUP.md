# SSH key + passphrase (MFA for SSH path)

**Purpose:** Use a passphrase-protected SSH key for enclave access so the SSH path satisfies CMMC/800-171 MFA (something you have: key + something you know: passphrase). This applies to IA.L2-3.5.3, 3.5.4 and MA.L2-3.7.5 when SSH is the access method.

**Key location (created):**
- Private: `~/.ssh/enclave_mfa_key`
- Public:  `~/.ssh/enclave_mfa_key.pub`

---

## 1. Add a passphrase to the key (required for MFA)

The key was created without a passphrase. You **must** add one so it counts as two factors. Run once:

```bash
ssh-keygen -p -f ~/.ssh/enclave_mfa_key
```

- When prompted for "Enter old passphrase:", press **Enter** (current passphrase is empty).
- When prompted for "Enter new passphrase:" and "Enter same passphrase again:", enter a strong passphrase and confirm.

Do not share or store the passphrase; you will be prompted for it when you use the key (or once per session if you use `ssh-add`).

---

## 2. Install the public key on the Windows VM

**Status:** The public key for `enclave_mfa_key` has been added to the VM’s `C:\Users\admin_patrick\.ssh\authorized_keys` (all existing keys kept). You can log in with the MFA key once you’ve set a passphrase (see §1).

The line that was added:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGyEumpxwAc9rNC0ba3RHbTbJYiiZUGcUaCT4TxIMYIi enclave-mfa-cmmc
```

**If you need to re-add it later** (e.g. new VM or new user): from your Mac, with your existing key:

```bash
cat ~/.ssh/enclave_mfa_key.pub | ssh -i ~/.ssh/mactech-cmmc-windows-vm admin_patrick@<VM_IP> "echo. >> %USERPROFILE%\\.ssh\\authorized_keys & type con >> %USERPROFILE%\\.ssh\\authorized_keys"
# (paste the key line, then Ctrl+D or use PowerShell Add-Content instead)
```

Or RDP to the VM and append the line above to `C:\Users\admin_patrick\.ssh\authorized_keys`.

---

## 3. Use the MFA key for enclave SSH

**Recommended — connect script (prompts for passphrase then connects):**

```bash
bash TRUST_CODEX/tools/connect_to_vm.sh
```

Run this in Cursor’s terminal (or any terminal). You’ll be prompted for the key passphrase, then SSH will connect. You can also say: “Cursor, run connect_to_vm script” and enter the passphrase when prompted.

**Or raw SSH:** You will be prompted for the passphrase when you connect (unless the key is in the agent):

```bash
ssh -i ~/.ssh/enclave_mfa_key admin_patrick@<VM_IP>
```

**One-time per session (optional):** Add the key to the agent so you type the passphrase once; then scripts (e.g. runbook, drift guard) can use SSH without a prompt:

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/enclave_mfa_key
```

**Connect using the MFA key:**

```bash
ssh -i ~/.ssh/enclave_mfa_key admin_patrick@<VM_IP>
```

Or set it as default for this host in `~/.ssh/config`:

```
Host enclave-vm
  HostName <VM_IP>
  User admin_patrick
  IdentityFile ~/.ssh/enclave_mfa_key
```

Then: `ssh enclave-vm`

---

## 4. Use with Trust Codex runbook and drift guard

Point the runbook at the MFA key:

```bash
export TRUST_CODEX_VM_HOST=20.57.129.142   # or your VM IP
export TRUST_CODEX_VM_USER=admin_patrick
export TRUST_CODEX_SSH_KEY=~/.ssh/enclave_mfa_key

bash TRUST_CODEX/tools/run_evidence_runbook_via_ssh.sh
```

Or for drift guard / connect:

```bash
export TRUST_CODEX_VM_HOST=20.57.129.142 TRUST_CODEX_VM_USER=admin_patrick TRUST_CODEX_SSH_KEY=~/.ssh/enclave_mfa_key
bash TRUST_CODEX/tools/connect_vm_ssh.sh
```

---

## 5. Let Cursor agent use the VM (run scripts without typing passphrase)

So that **Cursor agent** (or other non-interactive runs) can run the runbook, drift guard, etc. with the MFA key:

1. **Once per session**, in your terminal run:
   ```bash
   bash TRUST_CODEX/tools/load_mfa_key_for_agent.sh
   ```
   Enter the key passphrase when prompted. The script starts `ssh-agent`, loads the key, and writes the agent socket to `~/.trust-codex-ssh-agent.env`.

2. After that, any script that SSHs to the VM (e.g. `run_evidence_runbook_via_ssh.sh`, `connect_vm_ssh.sh`, `continuous_drift_guard.sh`) will **source that file** and use the key from the agent — so **Cursor agent can run those scripts** without a passphrase prompt.

3. When asking Cursor to run VM commands, use the MFA key by setting the env (or rely on the script default when you’ve loaded the key):
   ```bash
   TRUST_CODEX_SSH_KEY=~/.ssh/enclave_mfa_key bash TRUST_CODEX/tools/run_evidence_runbook_via_ssh.sh
   ```
   Or: “Cursor, run the evidence runbook via SSH; use the MFA key (I already ran load_mfa_key_for_agent).”

The agent keeps running until you close the terminal or run `kill $SSH_AGENT_PID`. To load the key again in a new session, run `load_mfa_key_for_agent.sh` again.

---

## 6. Policy and evidence (for assessors)

- **Policy:** Document that SSH keys used for CUI enclave access must be passphrase-protected (something you have + something you know = MFA). Reference this guide and MAC-POL-211 / MA 3.7.5.
- **Evidence:** Procedure (this doc), and attestation that the key in use is `enclave_mfa_key` and is passphrase-protected. The Azure/Entra validator still requires `mfa-in-path-attested.txt` for the five IA/MA checks; for SSH-only MFA (key+passphrase), document in the attestation that “SSH path uses passphrase-protected key (MFA)” and keep the attestation file in the run if you want the validator to pass (or document SSH MFA separately for the assessor).
