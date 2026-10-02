# Toolkit installation and runtime boundary

This project lives in the owner monorepo. Shared pre-shipped toolkit files resolve
through relative symlinks to ../../.claude; .p-replicator.json inherits root installed
metadata, not a claim of a separate installation. Clone the full repository.
Never modify shared targets through project links. Generated local agents/rules/skills
and feature-roadmap are N7-owned. Roothooks are not newly registered by this task.

F01 supplies npm/Docker runtime setup, names-only .env.example and local test adapters.
No secrets needed to inspect toolkit/docs. Real provider, charge and deployment remain
disabled; do not paste production secrets into documentation or tool output.
