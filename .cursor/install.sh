#!/usr/bin/env bash
#
# Cloud Agent bootstrap for CAVAL Studio.
# Idempotent: safe to re-run on every boot or during a build snapshot.
set -euo pipefail

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# nvm / npm_config_prefix guard.
#
# The base image resolves `node` from /exec-daemon/node, so npm computes a
# global prefix of "/" and exports `npm_config_prefix=/` into every child
# process it spawns. When CAVAL spawns a login shell (`bash -lc ...`) — which
# the terminal manager and the allowlisted workspace-command runner both do —
# ~/.bashrc sources nvm, and nvm aborts with "not compatible with the
# npm_config_prefix environment variable", leaving `npm` off PATH. That breaks
# in-app terminals and makes tests/security/lot-b-command-ipc.test.ts fail.
#
# Unset any inherited npm_config_prefix before nvm loads so login shells keep a
# working `npm`.
# ---------------------------------------------------------------------------
BASHRC="$HOME/.bashrc"
GUARD_MARKER="caval-nvm-guard"
GUARD_LINE='[ -n "$npm_config_prefix" ] && unset npm_config_prefix  # caval-nvm-guard'
if [ -f "$BASHRC" ] && ! grep -q "$GUARD_MARKER" "$BASHRC"; then
  printf '%s\n%s\n' "$GUARD_LINE" "$(cat "$BASHRC")" > "$BASHRC.caval.tmp"
  mv "$BASHRC.caval.tmp" "$BASHRC"
  echo "[caval-install] added npm_config_prefix/nvm guard to $BASHRC"
fi

# Project dependencies (deterministic install from the committed lockfile).
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "[caval-install] done"
