# Security Policy

Atlas runs shells, reads and writes files, stores API keys, and can execute agent-suggested commands after approval. Security issues matter.

## Reporting A Vulnerability

Do not open a public issue for security reports.

Use GitHub's private vulnerability reporting for [MDSD0/Atlas-ai](https://github.com/MDSD0/Atlas-ai/security/advisories/new) if available. If that is unavailable, contact the maintainer through the public GitHub profile and request a private disclosure channel.

Please include:

- Atlas version or commit
- Operating system and architecture
- Clear impact
- Reproduction steps or proof of concept
- Whether the issue requires local access, workspace access, provider access, or a malicious file

We will confirm receipt, investigate, and coordinate disclosure when a fix is ready.

## Supported Versions

Until Atlas reaches `1.0.0`, security fixes target the latest public minor release and `main`.

## In Scope

- Tauri commands and IPC boundaries
- PTY, shell, and background process handling
- Workspace authorization and filesystem guards
- Git command argument handling
- AI tool approval and execution surfaces
- API key storage and provider request handling
- Updater signing and release artifacts

## Out Of Scope

- Vulnerabilities in upstream dependencies that should be reported upstream first
- Issues requiring an already-compromised local machine
- Provider-side model behavior or retention policies
- User-approved shell commands that behave as the command itself is designed to behave

## Security Posture

- API keys are stored in the OS keychain.
- The webview does not get direct filesystem or shell access.
- File writes and shell commands from the agent are approval-gated.
- Obvious secret paths are denied on read and write.
- Network provider calls go through a Rust-side guard.
- Updates require signed updater metadata before automatic release use.
