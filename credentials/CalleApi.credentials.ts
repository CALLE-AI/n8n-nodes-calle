import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class CalleApi implements ICredentialType {
	name = 'calleApi';

	displayName = 'CALL-E API';

	icon: Icon = { light: 'file:../icons/calle.svg', dark: 'file:../icons/calle.dark.svg' };

	documentationUrl = 'https://docs.heycall-e.com/#/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'CALL-E API key for server-side workflow automation',
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

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.heycall-e.com',
			url: '/v1/calls/__n8n_credential_test__',
			method: 'GET',
			ignoreHttpStatusErrors: { ignore: true, except: [401, 403] },
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
