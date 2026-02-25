#!/usr/bin/env bash
# Used by connect_to_vm.sh to supply the key passphrase to ssh/ssh-add.
# Reads passphrase from the file in SSH_ASKPASS_PASSPHRASE_FILE and prints to stdout; then removes the file.
# Do not run directly; connect_to_vm.sh sets SSH_ASKPASS to this script.

[[ -z "${SSH_ASKPASS_PASSPHRASE_FILE:-}" ]] && exit 1
[[ ! -r "$SSH_ASKPASS_PASSPHRASE_FILE" ]] && exit 1
cat "$SSH_ASKPASS_PASSPHRASE_FILE"
rm -f "$SSH_ASKPASS_PASSPHRASE_FILE"
