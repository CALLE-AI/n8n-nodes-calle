import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { Calle } = require('../dist/nodes/Calle/Calle.node.js');
const schema = {
	type: 'object',
	properties: { confirmed: { type: 'string', enum: ['yes', 'no', 'unknown'] } },
	required: ['confirmed'],
	additionalProperties: false,
};
const pending = {
	id: 'call_api_id',
	call_id: 'billing_id',
	status: 'queued',
	result_status: 'pending',
	result: null,
	error: null,
};

function execution(parameters, responses, { version = 2, continueOnFail = false } = {}) {
	const items = Array.isArray(parameters) ? parameters : [parameters];
	const requests = [];
	const node = new Calle();
	const context = {
		getNode: () => ({
			name: 'CALL-E',
			type: '@call-e/n8n-nodes-calle.calle',
			typeVersion: version,
		}),
		getInputData: () => items.map(() => ({ json: {} })),
		getNodeParameter: (name, index, fallback) => items[index][name] ?? fallback,
		getCredentials: async () => ({
			apiKey: 'test_key',
			baseUrl: 'https://api.example.com',
			timeout: 30000,
		}),
		continueOnFail: () => continueOnFail,
		helpers: {
			async httpRequestWithAuthentication(credential, options) {
				assert.equal(credential, 'calleApi');
				requests.push(structuredClone(options));
				assert.ok(responses.length, 'Unexpected API request');
				return responses.shift();
			},
		},
	};
	return { requests, run: () => node.execute.call(context) };
}

function callParameters(extra = {}) {
	return {
		resource: 'call',
		operation: 'create',
		phoneNumber: '+14155550100',
		task: 'Ask in English whether the appointment is confirmed; use unknown when no answer is recorded.',
		idempotencyKey: 'appointment:8472:confirm:1',
		resultSchema: schema,
		additionalFields: {},
		pollingInterval: 1,
		timeout: 1000,
		...extra,
	};
}

describe('CALL-E Calls v2 execution', () => {
	it('keeps saved version 1 nodes and makes version 2 available', () => {
		const node = new Calle();
		assert.deepEqual(node.description.version, [1, 2]);
		const field = node.description.properties.find((property) => property.name === 'resultSchema');
		assert.equal(field.required, true);
		assert.deepEqual(field.displayOptions.show['@version'], [2]);
	});

	it('sends a single-target v2 body with a stable key and preserves raw output', async () => {
		const response = { ...pending, phone: '+14155550100' };
		const run = execution(
			callParameters({
				additionalFields: {
					locale: 'en-US',
					region: 'US',
					metadata: '{"order":"8472"}',
					webhookUrl: 'https://example.com/hook',
				},
			}),
			[response],
		);
		assert.deepEqual(await run.run(), [[{ json: response, pairedItem: { item: 0 } }]]);
		assert.equal(run.requests[0].url, 'https://api.example.com/v2/calls');
		assert.equal(run.requests[0].headers['Idempotency-Key'], 'appointment:8472:confirm:1');
		assert.deepEqual(run.requests[0].body, {
			task: callParameters().task,
			phone: '+14155550100',
			result_schema: schema,
			locale: 'en-US',
			region: 'US',
			metadata: { order: '8472' },
			webhook_url: 'https://example.com/hook',
		});
	});

	it('rejects missing, open, nested, and oversized schemas before creating a call', async () => {
		const invalidSchemas = [
			undefined,
			{},
			{ ...schema, additionalProperties: true },
			{ ...schema, oneOf: [{ type: 'object' }] },
			{ ...schema, properties: { answer: { type: ['string'] } } },
			{ ...schema, properties: { nested: { type: 'object' } } },
			{ ...schema, properties: { list: { type: 'array', items: { type: 'string' } } } },
			{
				...schema,
				properties: Object.fromEntries(
					Array.from({ length: 33 }, (_, i) => [String(i), { type: 'string' }]),
				),
			},
		];
		for (const resultSchema of invalidSchemas) {
			const run = execution(callParameters({ resultSchema }), []);
			await assert.rejects(run.run(), /Result Schema/);
			assert.equal(run.requests.length, 0);
		}
	});

	it('requires explicit migration of a legacy recipient schema', async () => {
		const run = execution(
			callParameters({ additionalFields: { recipientResultSchema: schema } }),
			[],
		);
		await assert.rejects(run.run(), /Recipient Result Schema/);
		assert.equal(run.requests.length, 0);
	});

	it('waits past telephone completion and returns an empty available result', async () => {
		const final = {
			...pending,
			status: 'completed',
			result_status: 'available',
			result: {},
			transcript: [{ speaker: 'user', offset_seconds: 2, text: 'Yes.' }],
		};
		const run = execution(callParameters({ operation: 'createAndWait' }), [
			pending,
			{ ...pending, status: 'completed' },
			final,
		]);
		assert.deepEqual((await run.run())[0][0].json, final);
		assert.deepEqual(
			run.requests.map((request) => request.method),
			['POST', 'GET', 'GET'],
		);
		assert.equal(run.requests[1].url, 'https://api.example.com/v2/calls/call_api_id');
	});

	it('finishes unavailable and not-applicable results without waiting for result or error', async () => {
		for (const result_status of ['unavailable', 'not_applicable']) {
			const final = {
				...pending,
				status: result_status === 'unavailable' ? 'completed' : 'canceled',
				result_status,
			};
			const run = execution(callParameters({ operation: 'createAndWait' }), [final]);
			assert.deepEqual((await run.run())[0][0].json, final);
			assert.equal(run.requests.length, 1);
		}
	});

	it('keeps the accepted API ID on timeout and recovers with Get without another POST', async (context) => {
		let now = 0;
		context.mock.method(Date, 'now', () => now++);
		const run = execution(
			callParameters({ operation: 'createAndWait', timeout: 1, pollingInterval: 2 }),
			[pending],
		);
		await assert.rejects(run.run(), /call_api_id/);
		assert.equal(run.requests.filter((request) => request.method === 'POST').length, 1);
		const recovered = execution({ resource: 'call', operation: 'get', callId: pending.id }, [
			pending,
		]);
		await recovered.run();
		assert.deepEqual(
			recovered.requests.map((request) => request.method),
			['GET'],
		);
		assert.equal(recovered.requests[0].url, 'https://api.example.com/v2/calls/call_api_id');
	});

	it('passes event cursor and limit to the v2 API', async () => {
		const run = execution(
			{
				resource: 'call',
				operation: 'listEvents',
				callId: 'call/one',
				cursor: 'event:42',
				limit: 10,
			},
			[{ data: [], next_cursor: null }],
		);
		await run.run();
		assert.equal(run.requests[0].url, 'https://api.example.com/v2/calls/call%2Fone/events');
		assert.deepEqual(run.requests[0].qs, { cursor: 'event:42', limit: 10 });
	});

	it('preserves legacy creation and historical reads on saved version 1 nodes', async () => {
		const legacyFields = { resultSchema: schema, recipientResultSchema: schema, locale: 'en-US' };
		const run = execution(
			callParameters({ additionalFields: legacyFields }),
			[{ id: 'old_call' }],
			{ version: 1 },
		);
		await run.run();
		assert.equal(run.requests[0].url, 'https://api.example.com/v1/calls');
		assert.deepEqual(run.requests[0].body.recipients, [
			{ phones: ['+14155550100'], locale: 'en-US' },
		]);
		assert.deepEqual(run.requests[0].body.recipient_result_schema, schema);
		for (const operation of ['get', 'listEvents']) {
			const read = execution({ resource: 'call', operation, callId: 'old_call', limit: 10 }, [{}], {
				version: 1,
			});
			await read.run();
			assert.equal(
				read.requests[0].url,
				`https://api.example.com/v1/calls/old_call${operation === 'listEvents' ? '/events' : ''}`,
			);
		}
	});

	it('keeps Continue On Fail and item pairing when local v2 validation fails', async () => {
		const run = execution([callParameters({ resultSchema: {} }), callParameters()], [pending], {
			continueOnFail: true,
		});
		const [items] = await run.run();
		assert.match(items[0].json.error, /Result Schema/);
		assert.deepEqual(items[1], { json: pending, pairedItem: { item: 1 } });
		assert.equal(run.requests.length, 1);
	});
});

describe('CALL-E current Goal contract', () => {
	it('keeps Goal paths on v1 and uses after for list pagination', async () => {
		const run = execution(
			{ resource: 'goal', operation: 'list', goalCursor: 'opaque_cursor', goalLimit: 20 },
			[{ data: [], next_cursor: null }],
		);
		await run.run();
		assert.equal(run.requests[0].url, 'https://api.example.com/v1/goals');
		assert.deepEqual(run.requests[0].qs, { after: 'opaque_cursor', limit: 20 });
	});

	it('sends phone and finishes a Goal Run with an unavailable result', async () => {
		const final = {
			id: 'rgrp_one',
			status: 'completed',
			result_status: 'unavailable',
			result: null,
			error: null,
		};
		const run = execution(
			{
				resource: 'goalRun',
				operation: 'createGoalRunAndWait',
				goalId: 'goal/one',
				goalRunPhoneNumber: '+14155550100',
				goalRunIdempotencyKey: 'order:8472:goal:1',
				goalRunVariables: '{"order_id":"8472"}',
				pollingInterval: 1,
				timeout: 1000,
			},
			[{ ...final, result_status: 'pending', run_id: 'telephone_run' }, final],
		);
		assert.deepEqual((await run.run())[0][0].json, final);
		assert.equal(run.requests[0].url, 'https://api.example.com/v1/goals/goal%2Fone/runs');
		assert.deepEqual(run.requests[0].body, {
			phone: '+14155550100',
			variables: { order_id: '8472' },
		});
		assert.equal(run.requests[0].headers['Idempotency-Key'], 'order:8472:goal:1');
		assert.equal(run.requests[1].url, 'https://api.example.com/v1/goals/goal%2Fone/runs/rgrp_one');
	});
});
