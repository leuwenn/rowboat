import { z } from "zod";
import { PrefixLogger } from "../utils";

const BASE_URL = 'https://backend.composio.dev/api/v3';
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || "";

export const ZAuthScheme = z.enum([
    'API_KEY',
    'BASIC',
    'BASIC_WITH_JWT',
    'BEARER_TOKEN',
    'BILLCOM_AUTH',
    'CALCOM_AUTH',
    'COMPOSIO_LINK',
    'GOOGLE_SERVICE_ACCOUNT',
    'NO_AUTH',
    'OAUTH1',
    'OAUTH2',
]);

export const ZToolkit = z.object({
    slug: z.string(),
    name: z.string(),
    meta: z.object({
        description: z.string(),
        logo: z.string(),
        tools_count: z.number(),
    }),
    no_auth: z.boolean(),
    auth_schemes: z.array(ZAuthScheme),
    composio_managed_auth_schemes: z.array(ZAuthScheme),
});

export const ZGetToolkitResponse = z.object({
    slug: z.string(),
    name: z.string(),
    composio_managed_auth_schemes: z.array(ZAuthScheme),
    auth_config_details: z.array(z.object({
        name: z.string(),
        mode: ZAuthScheme,
    })).nullable(),
});

export const ZTool = z.object({
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    toolkit: z.object({
        slug: z.string(),
        name: z.string(),
        logo: z.string(),
    }),
    input_parameters: z.object({
        type: z.literal('object'),
        properties: z.record(z.string(), z.any()),
        required: z.array(z.string()).optional(),
        additionalProperties: z.boolean().optional(),
    }),
    no_auth: z.boolean(),
});

export const ZAuthConfig = z.object({
    id: z.string(),
    is_composio_managed: z.boolean(),
    auth_scheme: ZAuthScheme,
});

/*
{
    "toolkit": {
        "slug": "github"
    },
    "auth_config": {
        "id": "ac_ZiLwFAWuGA7G",
        "auth_scheme": "OAUTH2",
        "is_composio_managed": false,
        "restrict_to_following_tools": []
    }
}
*/
export const ZCreateAuthConfigResponse = z.object({
    toolkit: z.object({
        slug: z.string(),
    }),
    auth_config: ZAuthConfig,
});

/*
{
    "id": "ca_vTkCeLZSGab-",
    "connectionData": {
        "authScheme": "OAUTH2",
        "val": {
            "status": "INITIATED",
            "code_verifier": "cd0103c5d8836a387adab1635b65ff0d2f51f77a1a79b7ff",
            "redirectUrl": "https://backend.composio.dev/api/v3/s/DbTOWAyR",
            "callback_url": "https://backend.composio.dev/api/v1/auth-apps/add"
        }
    },
    "status": "INITIATED",
    "redirect_url": "https://backend.composio.dev/api/v3/s/DbTOWAyR",
    "redirect_uri": "https://backend.composio.dev/api/v3/s/DbTOWAyR",
    "deprecated": {
        "uuid": "fe66d24b-59d8-4abf-adb2-d8f74353da9e",
        "authConfigUuid": "8c4d4c84-56e2-4a80-aa59-9e84503381d8"
    }
}
*/
export const ZCreateConnectedAccountResponse = z.object({
    id: z.string(),
    connectionData: z.object({
        authScheme: z.literal('OAUTH2'),
        val: z.object({
            status: z.literal('INITIATED'),
            code_verifier: z.string().optional(),
            redirectUrl: z.string(),
            callback_url: z.string(),
        }),
    }),
}); 

export const ZConnectedAccount = z.object({
    id: z.string(),
    toolkit: z.object({
        slug: z.string(),
    }),
    auth_config: z.object({
        id: z.string(),
        is_composio_managed: z.boolean(),
        is_disabled: z.boolean(),
    }),
    status: z.enum([
        'INITIALIZING',
        'INITIATED',
        'ACTIVE',
        'FAILED',
        'EXPIRED',
        'INACTIVE',
    ]),
}); 

const ZErrorResponse = z.object({
    error: z.object({
        message: z.string(),
        error_code: z.number(),
        suggested_fix: z.string().nullable(),
        errors: z.array(z.string()).nullable(),
    }),
});

export const ZError = z.object({
    error: z.enum([
        'CUSTOM_OAUTH2_CONFIG_REQUIRED',
    ]),
});

export const ZDeleteOperationResponse = z.object({
    success: z.boolean(),
});

export const ZListResponse = <T extends z.ZodTypeAny>(schema: T) => z.object({
    items: z.array(schema),
    next_cursor: z.string().nullable(),
    total_pages: z.number(),
    current_page: z.number(),
    total_items: z.number(),
});

export async function composioApiCall<T extends z.ZodTypeAny>(
    schema: T,
    url: string,
    options: RequestInit = {},
): Promise<z.infer<T>> {
    const logger = new PrefixLogger('composioApiCall');
    logger.log(`[${options.method || 'GET'}] ${url}`, options);

    const then = Date.now();

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                "x-api-key": COMPOSIO_API_KEY,
                ...(options.method === 'POST' ? {
                    "Content-Type": "application/json",
                } : {}),
            },
        });
        const duration = Date.now() - then;
        logger.log(`Took: ${duration}ms`);
        const data = await response.json();
        if ('error' in data) {
            const response = ZErrorResponse.parse(data);
            throw new Error(`(code: ${response.error.error_code}): ${response.error.message}: ${response.error.suggested_fix}: ${response.error.errors?.join(', ')}`);
        }
        return schema.parse(data);
    } catch (error) {
        logger.log(`Error:`, error);
        throw error;
    }
}

export async function listToolkits(cursor: string | null = null): Promise<z.infer<ReturnType<typeof ZListResponse<typeof ZToolkit>>>> {
    const url = new URL(`${BASE_URL}/toolkits`);

    // set params
    url.searchParams.set("sort_by", "usage");
    if (cursor) {
        url.searchParams.set("cursor", cursor);
    }

    // fetch
    return composioApiCall(ZListResponse(ZToolkit), url.toString());
}

export async function getToolkit(toolkitSlug: string): Promise<z.infer<typeof ZGetToolkitResponse>> {
    const url = new URL(`${BASE_URL}/toolkits/${toolkitSlug}`);
    return composioApiCall(ZGetToolkitResponse, url.toString());
}

export async function listTools(toolkitSlug: string, cursor: string | null = null): Promise<z.infer<ReturnType<typeof ZListResponse<typeof ZTool>>>> {
    const url = new URL(`${BASE_URL}/tools`);

    // set params
    url.searchParams.set("toolkit_slug", toolkitSlug);
    if (cursor) {
        url.searchParams.set("cursor", cursor);
    }

    // fetch
    return composioApiCall(ZListResponse(ZTool), url.toString());
}

export async function fetchAuthConfigs(toolkitSlug: string): Promise<z.infer<ReturnType<typeof ZListResponse<typeof ZAuthConfig>>>> {
    const url = new URL(`${BASE_URL}/auth_configs`);
    url.searchParams.set("toolkit_slug", toolkitSlug);

    return composioApiCall(ZListResponse(ZAuthConfig), url.toString());
}

export async function createComposioManagedAuthConfig(toolkitSlug: string): Promise<z.infer<typeof ZAuthConfig>> {
    const url = new URL(`${BASE_URL}/auth_configs`);

    const results = await composioApiCall(ZCreateAuthConfigResponse, url.toString(), {
        method: 'POST',
        body: JSON.stringify({
            toolkit: {
                slug: toolkitSlug,
            },
            auth_config: {
                type: 'use_composio_managed_auth',
            },
        }),
    });
    return results.auth_config;
}

export async function autocreateOauth2Integration(toolkitSlug: string): Promise<z.infer<typeof ZAuthConfig | typeof ZError>> {
    // fetch toolkit
    const toolkit = await getToolkit(toolkitSlug);

    // ensure oauth2 is supported
    if (!toolkit.auth_config_details?.some(config => config.mode === 'OAUTH2')) {
        throw new Error(`OAuth2 is not supported for toolkit ${toolkitSlug}`);
    }

    // fetch existing auth configs
    const authConfigs = await fetchAuthConfigs(toolkitSlug);

    // find a valid oauth2 config
    const oauth2AuthConfig = authConfigs.items.find(config => config.auth_scheme === 'OAUTH2');

    // if valid auth config, return it
    if (oauth2AuthConfig) {
        return oauth2AuthConfig;
    }

    // check if composio managed oauth2 is supported
    if (toolkit.composio_managed_auth_schemes.includes('OAUTH2')) {
        return await createComposioManagedAuthConfig(toolkitSlug);
    }

    // else return error
    return {
        error: 'CUSTOM_OAUTH2_CONFIG_REQUIRED',
    };
}

export async function createOauth2ConnectedAccount(toolkitSlug: string, userId: string, callbackUrl: string): Promise<z.infer<typeof ZCreateConnectedAccountResponse | typeof ZError>> {
    // fetch auth config
    const authConfig = await autocreateOauth2Integration(toolkitSlug);

    // if error, return error
    if ('error' in authConfig) {
        return authConfig;
    }

    // create connected account
    const url = new URL(`${BASE_URL}/connected_accounts`);

    return composioApiCall(ZCreateConnectedAccountResponse, url.toString(), {
        method: 'POST',
        body: JSON.stringify({
            auth_config: {
                id: authConfig.id,
            },
            connection: {
                user_id: userId,
                callback_url: callbackUrl,
            },
        }),
    });
}

export async function getConnectedAccount(connectedAccountId: string): Promise<z.infer<typeof ZConnectedAccount>> {
    const url = new URL(`${BASE_URL}/connected_accounts/${connectedAccountId}`);
    return await composioApiCall(ZConnectedAccount, url.toString());
}

export async function deleteConnectedAccount(connectedAccountId: string): Promise<z.infer<typeof ZDeleteOperationResponse>> {
    const url = new URL(`${BASE_URL}/connected_accounts/${connectedAccountId}`);
    return await composioApiCall(ZDeleteOperationResponse, url.toString(), {
        method: 'DELETE',
    });
}