# @call-e/n8n-nodes-calle

This package provides an n8n community node for CALL-E AI-agent phone-call workflows. New nodes use Calls API v2 to create one call, read its result and events, or wait for its business result. The node also executes published Goals.

[n8n](https://n8n.io/) is a workflow automation platform. [CALL-E](https://www.heycall-e.com/) provides a Developer API for server-side AI-agent phone-call tasks.

## Installation

Install this package as an n8n community node:

```bash
npm install @call-e/n8n-nodes-calle
```

For local development, run:

```bash
npm install
npm run build
npm run dev
```

The development server starts n8n with the CALL-E node linked into the local custom nodes directory.

## Credentials

Create a `CALL-E API` credential in n8n with:

- `API Key`: Open [CALL-E dashboard → API Keys](https://dashboard.heycall-e.com/account/api-keys), then select **Create API key** in the upper-right corner. The value is stored as a password field.
- `Base URL`: Defaults to `https://api.heycall-e.com`.
- `Request Timeout (MS)`: Timeout for each individual CALL-E API request.

Do not expose CALL-E API keys in browser code, workflow logs, screenshots, or issue reports.
Saving credentials checks the configured API with a read-only `GET /v2/calls/__n8n_credential_test__`. A documented `404 not_found` confirms authentication without placing a call. Authentication and server failures are reported as errors.

## Operations

The node provides `Call`, `Goal`, and `Goal Run` resources.

`Call` operations:

- `Create`: Submits one call to `POST /v2/calls`. HTTP `202` means accepted, not answered or completed.
- `Get`: Reads the current Call by its API resource ID.
- `Create and Wait`: Submits one call, then waits until `result_status` is `available`, `unavailable`, or `not_applicable`.
- `List Events`: Reads one page of persisted Call events using `cursor` and `limit`. Pass `next_cursor` to read more pages. To poll for new events, keep the last event ID even when `next_cursor` is null or a subsequent page is empty.

The node does not expose a Cancel operation. The API supports [cancellation before provider submission](https://docs.heycall-e.com/calls#read-events-and-cancellation); it cannot hang up an active call. Stopping an n8n execution does not cancel the telephone call.

`Goal` operations:

- `List`: Lists published Goals. Its Cursor input sends the previous `next_cursor` as the API's `after` parameter.
- `Get`: Gets one published Goal by ID.

`Goal Run` operations:

- `Create`: Creates one phone-specific execution of a published Goal.
- `Get`: Gets one Goal Run by Goal ID and Goal Run ID.
- `Create and Wait`: Creates a Goal Run, then waits until `result_status` is `available`, `unavailable`, or `not_applicable`.

Goal endpoints remain under `/v1/goals`. Goal Run requests send `phone` and optional `variables`; their result schema belongs to the published Goal.

## Call Parameters

`Create` and `Create and Wait` support:

- `Phone Number`: Required E.164 number, for example `+14155550100`.
- `Task`: Required phone agent task boundary and expected outcome.
- `Idempotency Key`: Required, 1–255 characters. Supply a durable business key such as `order-8472-confirmation-1`. Keep the same key and exact original inputs across workflow retries; an n8n execution ID changes when a workflow is executed again.
- `Result Schema`: Required. A closed object with `additionalProperties: false` and at most 32 string, boolean, integer, or number properties. Nested objects, arrays, null values, and schema combinators are unsupported.
- `Locale`: Optional language and locale hint, for example `en-US`.
- `Region`: Optional routing or country/region hint, for example `US`.
- `Metadata`: Optional JSON object returned with the call task for business-system correlation.
- `Webhook URL`: Optional callback URL for terminal CALL-E events.

For example, use this Result Schema and include instructions in Task to return `unknown` when the call does not establish an answer:

```json
{
  "type": "object",
  "properties": {
    "confirmed": { "type": "string", "enum": ["yes", "no", "unknown"] }
  },
  "required": ["confirmed"],
  "additionalProperties": false
}
```

`Create and Wait` also supports:

- `Polling Interval (MS)`: How often n8n polls CALL-E for the current call status.
- `Timeout (MS)`: Maximum total wait time before the node fails.

## Goal Run Parameters

`Create` and `Create and Wait` require:

- `Goal ID`: The public ID of a published CALL-E Goal.
- `Phone Number`: An authorized E.164 recipient number.
- `Idempotency Key`: A durable key for exactly one business event. Reuse the same key only to retry the identical Goal Run request.
- `Variables`: An optional flat JSON object of finite strings, booleans, or numbers accepted by the Goal's published input schema.

`Create and Wait` continues after `status=completed` while `result_status=pending`. It finishes for an unavailable result even when both `result` and `error` are null. A timeout does not cancel the Goal Run. Use `Get` with its Goal Run ID rather than creating another run.

## Outputs

The node returns the raw CALL-E API response for the selected operation:

- `Create` returns the accepted Call.
- `Get` returns the current Call.
- `Create and Wait` returns the Call once `result_status` is `available`, `unavailable`, or `not_applicable`.
- `List Events` returns the CALL-E events response.

If n8n `Continue On Fail` is enabled, the node returns an item with an `error` field instead of stopping the workflow.

Calls v2 and Goal Runs return `result`, `result_status`, `call_outcome`, `error`, and a separate top-level `transcript`. An available result can be `{}`. No answer, busy, or declined can produce `status=completed` with an unavailable business result and no technical error; evaluate the result fields to determine business success.

For Calls, use response `id` for Get and List Events. Response `call_id` is a separate Billing identifier and can be null. Never substitute it for the API resource ID.

## Migrating existing workflows

Saved nodes with `typeVersion: 1` keep the legacy `/v1/calls` creation, read, event, and result formats. New nodes use version 2. Package updates do not convert old Call IDs or automatically migrate a saved node.

To move a workflow to node version 2:

1. Move the needed fields from the old task and recipient schemas into the required Result Schema field. Flatten nested data; use explicit scalar unknown values where needed. Remove Recipient Result Schema from Additional Fields.
2. Configure a stable business idempotency key and update downstream nodes to read `result`, `error`, `call_outcome`, `result_status`, and top-level `transcript`.
3. Test an authorized call, then switch new work to version 2. Keep version 1 readers and the existing webhook receiver for accepted legacy calls. Do not submit the same task through both interfaces.

Goal requests, pagination, and result-readiness handling are updated in both node versions. Existing saved Goal inputs remain usable; new Goal Run nodes require an explicit business key.

See the [migration guide](https://docs.heycall-e.com/migration) and [legacy retirement notice](https://docs.heycall-e.com/retirement) for the API boundaries and support deadline.

## Safety

Phone calls are real-world side effects. Use this node only when the workflow has explicit user intent to place the call.

Operational safeguards:

- Use E.164 phone numbers.
- Use stable idempotency keys to prevent duplicate call tasks.
- Keep API keys in n8n credentials only.
- Avoid logging full phone numbers or secrets in workflow outputs.
- For recurring reminders, let the n8n workflow or host scheduler manage recurrence. CALL-E should handle one call task per scheduled workflow run.
- Keep workflows inactive until credentials, recipient numbers, task wording, and test paths are reviewed.
- Stop an n8n execution to stop its polling, then check the Call separately; this does not hang up the call.
- Do not use this node for emergency, medical, legal, or financial advice workflows without an appropriate human-reviewed safety process.

`Create and Wait` has a node-level timeout. If it expires, the error includes the accepted API resource ID; resume with Get. A client timeout does not cancel the call. If a creation response was lost before an ID was returned, replay the same key and unchanged request. Do not copy inferred region or locale from a response into the retry, generate a replacement key, or fall back to legacy creation.

## Compatibility

This package is intended for current n8n community node development flows using `@n8n/node-cli`.

Run the local checks before submitting changes:

```bash
npm run lint
npm test
npm pack --dry-run
```

## Release

This package is published from this repository through `.github/workflows/publish.yml`.

To publish a release, make sure `package.json` and `package-lock.json` have the target version, then push a matching tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The workflow validates that the tag version matches `package.json`, runs lint, tests, build, and publishes with npm provenance.

For npm Trusted Publishing, configure npm with:

- Repository owner: `CALLE-AI`
- Repository name: `n8n-nodes-calle`
- Workflow filename: `publish.yml`
- Environment: leave blank unless the workflow is later changed to use one

If Trusted Publishing is not configured, add an npm automation token as the GitHub Actions secret `NPM_TOKEN`.

## Resources

- [Create or manage CALL-E API keys](https://dashboard.heycall-e.com/account/api-keys) — select **Create API key** in the upper-right corner.
- [CALL-E API Reference](https://docs.heycall-e.com/api-reference)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
