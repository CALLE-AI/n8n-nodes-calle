import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { CalleApi } = require('../dist/credentials/CalleApi.credentials.js');

describe('CALL-E credential definition', () => {
	it('links users to the current production API reference', () => {
		const credential = new CalleApi();

		assert.equal(credential.documentationUrl, 'https://docs.heycall-e.com/api-reference');
	});

	it('exposes a credential-file test request for n8n verification', () => {
		const credential = new CalleApi();

		assert.match(credential.test.request.baseURL, /credentials.baseUrl/);
		assert.equal(credential.test.request.url, '/v2/calls/__n8n_credential_test__');
		assert.equal(credential.test.request.method, 'GET');
		const ignored = credential.test.request.ignoreHttpStatusErrors;
		assert.equal(ignored.ignore, true);
		assert.equal(ignored.except.includes(404), false);
		assert.equal(credential.test.request.disableFollowRedirect, true);
		for (const status of [300, 301, 400, 401, 403, 429, 500, 502, 503, 599]) {
			assert.equal(ignored.except.includes(status), true);
		}
		assert.deepEqual(
			credential.test.rules.map((rule) => rule.properties.value),
			[401, 403],
		);
	});
});

describe('CALL-E credential verification', () => {
	const credential = new CalleApi();

	it('adds Bearer authentication without losing request headers', async () => {
		const result = await credential.authenticate({ apiKey: ' test_key ', baseUrl: 'https://api.example.com' }, { url: 'https://api.example.com/v2/calls/probe', headers: { Accept: 'application/json' } });
		assert.deepEqual(result.headers, { Accept: 'application/json', Authorization: 'Bearer test_key' });
	});

	it('rejects missing keys and unsafe URLs without making a request', async () => {
		for (const data of [{}, { apiKey: 'test_key', baseUrl: 'http://remote.example.com' }]) {
			await assert.rejects(credential.authenticate(data, { url: 'https://api.example.com/probe' }), /API Key is required|HTTPS/);
		}
	});
});
