import type {
	IAuthenticate,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';
import { validateCalleBaseUrl } from '../nodes/Calle/shared/utils';

export class CalleApi implements ICredentialType {
	name = 'calleApi';

	displayName = 'CALL-E API';

	icon: Icon = { light: 'file:../icons/calle.svg', dark: 'file:../icons/calle.dark.svg' };

	documentationUrl = 'https://docs.heycall-e.com/api-reference';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Create or manage a key in the <a href="https://dashboard.heycall-e.com/account/api-keys" target="_blank">CALL-E dashboard</a>, then select <strong>Create API key</strong> in the upper-right corner.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.heycall-e.com',
			placeholder: 'https://api.heycall-e.com',
			description: 'CALL-E API base URL',
		},
		{
			displayName: 'Request Timeout (MS)',
			name: 'timeout',
			type: 'number',
			default: 30000,
			typeOptions: {
				minValue: 1000,
			},
			description: 'Maximum time to wait for a single CALL-E API request',
		},
	];

	authenticate: IAuthenticate = async (credentials, requestOptions) => {
		const baseUrl = validateCalleBaseUrl(credentials.baseUrl);
		if (!baseUrl.ok) throw new Error(baseUrl.message);
		const apiKey = typeof credentials.apiKey === 'string' ? credentials.apiKey.trim() : '';
		if (!apiKey) throw new Error('API Key is required.');
		return { ...requestOptions, headers: { ...requestOptions.headers, Authorization: `Bearer ${apiKey}` } };
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl || "https://api.heycall-e.com"}}',
			url: '/v2/calls/__n8n_credential_test__',
			method: 'GET',
			disableFollowRedirect: true,
			ignoreHttpStatusErrors: {
				ignore: true,
				except: Array.from({ length: 300 }, (_, index) => index + 300).filter((status) => status !== 404),
			},
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 401,
					message: 'Invalid or missing CALL-E API key.',
				},
			},
			{
				type: 'responseCode',
				properties: {
					value: 403,
					message: 'CALL-E API key is valid but not authorized to access call tasks.',
				},
			},
		],
	};
}
