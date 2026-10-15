import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	assertValidE164PhoneNumber,
	assertRequiredIdempotencyKey,
	assertGoalRunVariables,
	buildGoalRunBody,
	buildCreateCallBody,
	buildLegacyCreateCallBody,
	getPollingSleepMs,
	getGoalPath,
	getGoalRunPath,
	isResultReady,
	isTerminalCallStatus,
	maskPhoneNumber,
	parseJsonObject,
	validateCalleBaseUrl,
} from '../dist/nodes/Calle/shared/utils.js';

describe('CALL-E utility helpers', () => {
	it('accepts valid E.164 phone numbers and rejects local formats', () => {
		assert.equal(assertValidE164PhoneNumber('+14155550100'), '+14155550100');
		assert.throws(() => assertValidE164PhoneNumber('4155550100'), /E\.164/);
		assert.throws(() => assertValidE164PhoneNumber('+1 415 555 0100'), /E\.164/);
	});

	it('parses optional JSON object parameters', () => {
		assert.deepEqual(parseJsonObject('', 'Metadata'), undefined);
		assert.deepEqual(parseJsonObject('{"workflow_run_id":"wf_123"}', 'Metadata'), {
			workflow_run_id: 'wf_123',
		});
		assert.throws(() => parseJsonObject('[]', 'Metadata'), /JSON object/);
	});

	it('builds a CALL-E create call body with recipient, schemas, metadata, and webhook URL', () => {
		assert.deepEqual(
			buildLegacyCreateCallBody({
				task: 'Call the recipient to confirm appointment details.',
				phoneNumber: '+14155550100',
				locale: 'en-US',
				region: 'US',
				metadata: { workflow_run_id: 'wf_123' },
				resultSchema: {
					type: 'object',
					required: ['completed_count'],
					properties: { completed_count: { type: 'integer' } },
				},
				recipientResultSchema: {
					type: 'object',
					required: ['confirmed'],
					properties: { confirmed: { type: 'boolean' } },
				},
				webhookUrl: 'https://example.com/calle/webhook',
			}),
			{
				task: 'Call the recipient to confirm appointment details.',
				recipients: [{ phones: ['+14155550100'], locale: 'en-US', region: 'US' }],
				metadata: { workflow_run_id: 'wf_123' },
				result_schema: {
					type: 'object',
					required: ['completed_count'],
					properties: { completed_count: { type: 'integer' } },
				},
				recipient_result_schema: {
					type: 'object',
					required: ['confirmed'],
					properties: { confirmed: { type: 'boolean' } },
				},
				webhook_url: 'https://example.com/calle/webhook',
			},
		);
	});

	it('builds a Goal Run body with its documented phone and scalar variables', () => {
		assert.deepEqual(
			buildGoalRunBody({
				phoneNumber: '+14155550100',
				variables: { order_id: 'ORD-8472', expedited: true },
			}),
			{
				phone: '+14155550100',
				variables: { order_id: 'ORD-8472', expedited: true },
			},
		);
	});

	it('rejects nested and non-finite Goal Run variables', () => {
		assert.throws(() => assertGoalRunVariables({ order: { id: 'ORD-8472' } }), /flat object/);
		assert.throws(() => assertGoalRunVariables({ score: Number.NaN }), /finite/);
	});

	it('uses result_status for Calls and Goal Runs, including unavailable and canceled results', () => {
		assert.equal(isResultReady({ status: 'completed', result_status: 'pending' }), false);
		assert.equal(isResultReady({ result: {}, error: null }), false);
		assert.equal(isResultReady({ result_status: ['available'] }), false);
		for (const result_status of ['available', 'unavailable', 'not_applicable']) {
			assert.equal(isResultReady({ result_status, result: null, error: null }), true);
		}
	});

	it('keeps omitted region and locale absent from immutable v2 request bodies', () => {
		const body = buildCreateCallBody({ task: 'Ask whether the appointment is confirmed.', phoneNumber: '+14155550100', resultSchema: { type: 'object', properties: {}, additionalProperties: false } });
		assert.equal(Object.hasOwn(body, 'region'), false);
		assert.equal(Object.hasOwn(body, 'locale'), false);
		assert.equal(Object.hasOwn(body, 'recipients'), false);
	});

	it('encodes public Goal and Goal Run identifiers in documented paths', () => {
		assert.equal(getGoalPath('goal/1'), '/v1/goals/goal%2F1');
		assert.equal(getGoalRunPath('goal/1', 'goal_run/2'), '/v1/goals/goal%2F1/runs/goal_run%2F2');
	});

	it('requires a business-stable Goal Run idempotency key', () => {
		assert.equal(assertRequiredIdempotencyKey('delivery:ORD-8472:v1'), 'delivery:ORD-8472:v1');
		assert.throws(() => assertRequiredIdempotencyKey(''), /Idempotency Key is required/);
		assert.throws(() => assertRequiredIdempotencyKey('x'.repeat(256)), /255/);
	});

	it('detects terminal call statuses', () => {
		assert.equal(isTerminalCallStatus('completed'), true);
		assert.equal(isTerminalCallStatus('failed'), true);
		assert.equal(isTerminalCallStatus('canceled'), true);
		assert.equal(isTerminalCallStatus('queued'), false);
	});

	it('masks phone numbers for errors and summaries', () => {
		assert.equal(maskPhoneNumber('+14155550100'), '+1415***0100');
		assert.equal(maskPhoneNumber('1234'), '***');
	});

	it('requires HTTPS base URLs except for loopback local development hosts', () => {
		assert.deepEqual(validateCalleBaseUrl('https://api.heycall-e.com/'), {
			ok: true,
			baseUrl: 'https://api.heycall-e.com',
		});
		assert.deepEqual(validateCalleBaseUrl('http://localhost:5678/'), {
			ok: true,
			baseUrl: 'http://localhost:5678',
		});
		assert.deepEqual(validateCalleBaseUrl('http://127.0.0.1:5678/'), {
			ok: true,
			baseUrl: 'http://127.0.0.1:5678',
		});
		assert.deepEqual(validateCalleBaseUrl('http://[::1]:5678/'), {
			ok: true,
			baseUrl: 'http://[::1]:5678',
		});
		assert.deepEqual(validateCalleBaseUrl('http://api.heycall-e.com'), {
			ok: false,
			message: 'Base URL must use HTTPS unless it points to localhost, 127.0.0.1, or ::1.',
		});
		assert.deepEqual(validateCalleBaseUrl('ftp://api.heycall-e.com'), {
			ok: false,
			message: 'Base URL must use HTTPS unless it points to localhost, 127.0.0.1, or ::1.',
		});
	});

	it('caps create-and-wait sleep duration to the remaining timeout', () => {
		assert.equal(getPollingSleepMs(2000, 10_000, 9_250), 750);
		assert.equal(getPollingSleepMs(2000, 10_000, 8_000), 2000);
		assert.equal(getPollingSleepMs(2000, 10_000, 10_000), 0);
		assert.equal(getPollingSleepMs(2000, 10_000, 10_500), 0);
	});
});
