import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { CalleApi } = require('../dist/credentials/CalleApi.credentials.js');

describe('CALL-E credential definition', () => {
	it('exposes a credential-file test request for n8n verification', () => {
		const credential = new CalleApi();

		assert.equal(credential.test.request.baseURL, 'https://api.heycall-e.com');
		assert.equal(credential.test.request.url, '/v1/calls/__n8n_credential_test__');
		assert.equal(credential.test.request.method, 'GET');
		assert.deepEqual(credential.test.request.ignoreHttpStatusErrors, {
			ignore: true,
			except: [401, 403],
		});
		assert.deepEqual(
			credential.test.rules.map((rule) => rule.properties.value),
			[401, 403],
		);
	});
});
