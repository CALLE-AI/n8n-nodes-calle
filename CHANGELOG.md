# Changelog

## 0.3.0

- Add published Goal selection and read-only configuration preparation with input/result fields, required flags, types, defaults, enums, and RunSpec versions.
- Validate business variables against a fixed reviewed Goal interface and report affected mappings when the publication changes. Link Goal mapping and recoverable appointment workflow examples.
- Retain accepted Goal Run IDs in polling-request errors so interrupted executions can resume with Get.

## 0.2.0

- Add node version 2 for single-target Calls API v2 with a required flat result schema and an explicit business idempotency key. Saved version 1 Call nodes retain their legacy API and response format.
- Wait for Calls and Goal Run result readiness, including unavailable results with no technical error. Include the accepted API resource ID in wait-timeout errors.
- Align Goal Run phone inputs and Goal list pagination with the current API, and verify credentials against the configured v2 endpoint.

## 0.1.4

- Update the CALL-E node icon.

## 0.1.3

- Add a credential-file test request so n8n automated verification can detect the CALL-E credential test.

## 0.1.2

- Move the canonical source repository to `CALLE-AI/n8n-nodes-calle` so n8n verification can resolve package files from the repository root.

## 0.1.1

- Include the built n8n runtime files in the repository so verification can resolve the credential and node entry points declared in `package.json`.

## 0.1.0

- Initial CALL-E n8n community node release.
