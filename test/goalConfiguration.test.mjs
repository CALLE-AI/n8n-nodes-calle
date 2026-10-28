import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { prepareGoalConfiguration } = require('../dist/nodes/Calle/shared/goalConfiguration.js');
const { Calle } = require('../dist/nodes/Calle/Calle.node.js');
const goal = {
	object: 'goal',
	id: 'goal_test',
	status: 'active',
	title: 'Appointment confirmation',
	published_run_spec: {
		id: 'rspec_v1',
		version: 1,
		input_schema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				reference: { type: 'string' },
				count: { type: 'integer', default: 2 },
				approved: { type: 'boolean', default: false },
				mode: { type: 'string', enum: ['voice'], default: 'voice' },
			},
			required: ['reference', 'count'],
		},
		result_schema: {
			type: 'object',
			additionalProperties: false,
			properties: { confirmed: { type: ['string', 'null'], enum: ['yes', 'no', 'unknown', null] } },
			required: ['confirmed'],
		},
	},
};
const prepare = (variables = { reference: 'booking-8472' }, current = goal, baseline = goal) =>
	prepareGoalConfiguration(current, variables, baseline, current.id);

describe('published Goal configuration', () => {
	it('shows fields and version and requires a saved interface before emitting a creation ID', () => {
		const output = prepareGoalConfiguration(goal, { reference: 'booking-8472' }, '', goal.id);
		assert.equal(output.ready, false);
		assert.equal(output.goal_id, '');
		assert.equal(output.variables_json, '');
		assert.equal(output.run_spec_version, 1);
		assert.deepEqual(output.result_fields[0].type, ['string', 'null']);
		assert.equal(output.input_fields[1].required, true);
		assert.deepEqual(JSON.parse(output.goal_json), goal);
	});

	it('applies published defaults before required and type validation without coercion', () => {
		const output = prepare();
		assert.equal(output.ready, true);
		assert.equal(output.goal_id, goal.id);
		assert.deepEqual(JSON.parse(output.variables_json), {
			reference: 'booking-8472',
			count: 2,
			approved: false,
			mode: 'voice',
		});
		assert.equal(prepare({ reference: 'x', count: 0, approved: true }).ready, true);
	});

	for (const [label, variables, path] of [
		['missing input', {}, 'variables.reference'],
		['unknown input', { reference: 'x', undeclared: 1 }, 'variables.undeclared'],
		['boolean as integer', { reference: 'x', count: true }, 'variables.count'],
		['fractional integer', { reference: 'x', count: 1.5 }, 'variables.count'],
		['string as boolean', { reference: 'x', approved: 'false' }, 'variables.approved'],
		['enum mismatch', { reference: 'x', mode: 'text' }, 'variables.mode'],
		['nested value', { reference: {} }, 'variables.reference'],
		['null value', { reference: null }, 'variables.reference'],
		['non-finite value', { reference: 'x', count: Infinity }, 'variables.count'],
		['array variables', [], 'variables'],
		['invalid JSON', '{', 'variables'],
	]) {
		it(`blocks ${label}`, () => {
			const output = prepare(variables);
			assert.equal(output.ready, false);
			assert.equal(output.goal_id, '');
			assert.ok(
				output.errors.some((error) => error.path === path),
				JSON.stringify(output.errors),
			);
		});
	}

	it('reports publication and affected input/result mapping paths', () => {
		const changed = structuredClone(goal);
		changed.published_run_spec.id = 'rspec_v2';
		changed.published_run_spec.version = 2;
		changed.published_run_spec.input_schema.properties.reference.type = 'number';
		changed.published_run_spec.input_schema.properties.count.default = 3;
		changed.published_run_spec.result_schema.properties.confirmed.enum = ['yes', 'no', null];
		const output = prepare({ reference: 8472 }, changed);
		assert.equal(output.ready, false);
		assert.deepEqual(
			output.changes.map(({ path }) => path),
			[
				'published_run_spec',
				'input_schema.reference',
				'input_schema.count',
				'result_schema.confirmed',
			],
		);
	});

	it('ignores JSON property order when comparing reviewed fields', () => {
		const reversed = structuredClone(goal);
		reversed.published_run_spec.input_schema.properties.reference = {
			description: 'Business reference',
			type: 'string',
		};
		const current = structuredClone(reversed);
		current.published_run_spec.input_schema.properties.reference = {
			type: 'string',
			description: 'Business reference',
		};
		assert.equal(prepare({ reference: 'x' }, current, reversed).ready, true);
	});

	for (const [label, mutate, path] of [
		[
			'nested schema',
			(g) => {
				g.published_run_spec.input_schema.properties.reference.type = 'object';
			},
			'input_schema.reference',
		],
		[
			'unsupported constraint',
			(g) => {
				g.published_run_spec.input_schema.properties.reference.minLength = 1;
			},
			'input_schema.reference',
		],
		[
			'future root keyword',
			(g) => {
				g.published_run_spec.input_schema.allOf = [];
			},
			'input_schema',
		],
		[
			'open schema',
			(g) => {
				g.published_run_spec.input_schema.additionalProperties = true;
			},
			'input_schema',
		],
		[
			'optional without default',
			(g) => {
				g.published_run_spec.input_schema.required = ['count'];
			},
			'input_schema.reference',
		],
		[
			'bad enum',
			(g) => {
				g.published_run_spec.input_schema.properties.mode.enum = [true];
			},
			'input_schema.mode',
		],
		[
			'invalid version',
			(g) => {
				g.published_run_spec.version = 0;
			},
			'published_run_spec',
		],
		[
			'inactive Goal',
			(g) => {
				g.status = 'draft';
			},
			'goal',
		],
	]) {
		it(`rejects ${label} with its interface path`, () => {
			const changed = structuredClone(goal);
			mutate(changed);
			assert.throws(
				() => prepare({}, changed),
				(error) => error.message.startsWith(`${path}:`),
			);
		});
	}

	it('rejects an unexpected Goal response and a baseline for another Goal', () => {
		assert.throws(() => prepareGoalConfiguration(goal, {}, goal, 'goal_other'), /does not match/);
		assert.equal(prepare({ reference: 'x' }, goal, { ...goal, id: 'goal_other' }).ready, false);
	});
});

describe('Goal preparation node integration', () => {
	function context(parameters, responses) {
		const requests = [];
		return {
			requests,
			getNode: () => ({ name: 'CALL-E', typeVersion: 2 }),
			getInputData: () => [{ json: {} }],
			getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
			getCredentials: async () => ({
				apiKey: 'fixture',
				baseUrl: 'https://api.example.com',
				timeout: 30000,
			}),
			continueOnFail: () => false,
			helpers: {
				async httpRequestWithAuthentication(_credential, options) {
					requests.push(options);
					assert.ok(responses.length);
					return responses.shift();
				},
			},
		};
	}

	it('performs only GET for a ready preparation and keeps per-item pairing', async () => {
		const ctx = context(
			{
				resource: 'goalRun',
				operation: 'prepareGoalRun',
				publishedGoal: goal.id,
				goalRunVariables: { reference: 'x' },
				reviewedGoalInterface: JSON.stringify(goal),
			},
			[goal],
		);
		const output = await new Calle().execute.call(ctx);
		assert.equal(output[0][0].json.ready, true);
		assert.deepEqual(output[0][0].pairedItem, { item: 0 });
		assert.deepEqual(
			ctx.requests.map(({ method, url }) => ({ method, url })),
			[{ method: 'GET', url: 'https://api.example.com/v1/goals/goal_test' }],
		);
	});

	it('searches published Goals with opaque pagination and does not select the first result', async () => {
		const ctx = context({}, [
			{ data: [goal, { ...goal, id: 'hidden', status: 'draft' }], next_cursor: 'opaque-next' },
			{ data: [goal], next_cursor: null },
		]);
		const search = new Calle().methods.listSearch.getPublishedGoals;
		const page = await search.call(ctx, 'appointment');
		assert.equal(page.results[0].value, goal.id);
		assert.match(page.results[0].name, /v1/);
		assert.equal(page.paginationToken, 'opaque-next');
		const last = await search.call(ctx, 'unmatched', page.paginationToken);
		assert.equal(ctx.requests[1].qs.after, 'opaque-next');
		assert.deepEqual(last, { results: [] });
	});

	it('rejects a repeating pagination cursor', async () => {
		const ctx = context({}, [{ data: [goal], next_cursor: 'same' }]);
		await assert.rejects(
			new Calle().methods.listSearch.getPublishedGoals.call(ctx, '', 'same'),
			/did not advance/,
		);
	});
});
