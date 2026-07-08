# Agent Instructions

This repository contains the standalone `@call-e/n8n-nodes-calle` n8n community node package.

## Language

All repository-facing content must be written in English.

## Scope

Keep this repository focused on the CALL-E n8n community node:

- n8n node source under `nodes/`
- n8n credential source under `credentials/`
- icons under `icons/`
- tests under `test/`
- built runtime files under `dist/`
- package and release workflow files

Do not add unrelated phone-call workflow examples, applications, or generated local state.

## Safety

Phone calls are real-world side effects. Any user-facing documentation or behavior that can create a call must preserve these rules:

- require explicit user intent
- use E.164 phone numbers
- keep credentials out of logs and examples
- support idempotency keys to prevent duplicate call tasks
- avoid hidden recurring schedules
- document timeout and cancellation boundaries
- avoid emergency, medical, legal, or financial advice workflows without human-reviewed safeguards

## Validation

After editing, run the most relevant checks:

```bash
npm run lint
npm test
npm pack --dry-run
```

If local dependency installation is blocked by a local Node.js version issue, state that clearly and rely on the GitHub Actions workflow for the full install, lint, test, build, and publish path.
