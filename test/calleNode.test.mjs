import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { Calle } = require('../dist/nodes/Calle/Calle.node.js');

describe('CALL-E node resources', () => {
	it('exposes documented Goal and Goal Run operations', () => {
		const node = new Calle();
		const resource = node.description.properties.find((property) => property.name === 'resource');
		const operationValues = node.description.properties
			.filter((property) => property.name === 'operation')
			.flatMap((property) => property.options.map((option) => option.value));
		const propertyNames = node.description.properties.map((property) => property.name);

		assert.deepEqual(
			resource.options.map((option) => option.value),
			['call', 'goal', 'goalRun'],
		);
		assert.deepEqual(operationValues, ['create', 'createAndWait', 'get', 'listEvents', 'list', 'getGoal', 'createGoalRun', 'prepareGoalRun', 'getGoalRun', 'createGoalRunAndWait']);
		assert.deepEqual(
			propertyNames.filter((name) => ['goalId', 'goalRunId', 'goalRunVariables'].includes(name)),
			['goalId', 'goalRunId', 'goalRunVariables'],
		);
	});
});
