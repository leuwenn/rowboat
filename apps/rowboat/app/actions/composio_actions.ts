"use server";
import { z } from "zod";
import {
    listToolkits as libListToolkits,
    listTools as libListTools,
    createOauth2ConnectedAccount as libCreateOauth2ConnectedAccount,
    getConnectedAccount as libGetConnectedAccount,
    deleteConnectedAccount as libDeleteConnectedAccount,
    ZToolkit,
    ZTool,
    ZListResponse,
    ZCreateConnectedAccountResponse,
} from "@/app/lib/composio/composio";
import { ComposioConnectedAccount } from "@/app/lib/types/project_types";
import { getProjectConfig, projectAuthCheck } from "./project_actions";
import { projectsCollection } from "../lib/mongodb";

export async function listToolkits(projectId: string, cursor: string | null = null): Promise<z.infer<ReturnType<typeof ZListResponse<typeof ZToolkit>>>> {
    await projectAuthCheck(projectId);
    return await libListToolkits(cursor);
}

export async function listTools(projectId: string, toolkitSlug: string, cursor: string | null = null): Promise<z.infer<ReturnType<typeof ZListResponse<typeof ZTool>>>> {
    await projectAuthCheck(projectId);
    return await libListTools(toolkitSlug, cursor);
}

export async function createOauth2ConnectedAccount(projectId: string, toolkitSlug: string, returnUrl: string): Promise<z.infer<typeof ZCreateConnectedAccountResponse>> {
    await projectAuthCheck(projectId);
    const project = await getProjectConfig(projectId);

    // check if already connected
    const existingConnectedAccount = project.composioConnectedAccounts?.[toolkitSlug];
    if (existingConnectedAccount && existingConnectedAccount.status === 'ACTIVE') {
        throw new Error(`Already connected to ${toolkitSlug}`);
    }

    // create new connected account for this project
    const response = await libCreateOauth2ConnectedAccount(toolkitSlug, project._id, returnUrl);

    // update project with new connected account
    const key = `composioConnectedAccounts.${toolkitSlug}`;
    const data: z.infer<typeof ComposioConnectedAccount> = {
        id: response.id,
        status: 'INITIATED',
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
    }
    await projectsCollection.updateOne({ _id: projectId }, { $set: { [key]: data } });

    return response;
}

export async function syncConnectedAccount(projectId: string, toolkitSlug: string, connectedAccountId: string): Promise<z.infer<typeof ComposioConnectedAccount>> {
    await projectAuthCheck(projectId);

    // ensure that the connected account belongs to this project
    const project = await getProjectConfig(projectId);
    const account = project.composioConnectedAccounts?.[toolkitSlug];
    if (!account || account.id !== connectedAccountId) {
        throw new Error(`Connected account ${connectedAccountId} not found in project ${projectId}`);
    }

    // if account is already active, nothing to sync
    if (account.status === 'ACTIVE') {
        return account;
    }

    // get the connected account
    const response = await libGetConnectedAccount(connectedAccountId);

    // update project with new connected account
    const key = `composioConnectedAccounts.${response.toolkit.slug}`;
    switch (response.status) {
        case 'INITIALIZING':
        case 'INITIATED':
            account.status = 'INITIATED';
            break;
        case 'ACTIVE':
            account.status = 'ACTIVE';
            break;
        default:
            account.status = 'FAILED';
            break;
    }
    account.lastUpdatedAt = new Date().toISOString();
    await projectsCollection.updateOne({ _id: projectId }, { $set: { [key]: account } });

    return account;
}

export async function deleteConnectedAccount(projectId: string, toolkitSlug: string, connectedAccountId: string): Promise<boolean> {
    await projectAuthCheck(projectId);

    // ensure that the connected account belongs to this project
    const project = await getProjectConfig(projectId);
    const account = project.composioConnectedAccounts?.[toolkitSlug];
    if (!account || account.id !== connectedAccountId) {
        throw new Error(`Connected account ${connectedAccountId} not found in project ${projectId} for toolkit ${toolkitSlug}`);
    }

    // delete the connected account
    await libDeleteConnectedAccount(connectedAccountId);

    // update project with deleted connected account
    const key = `composioConnectedAccounts.${toolkitSlug}`;
    await projectsCollection.updateOne({ _id: projectId }, { $unset: { [key]: "" } });

    return true;
}

export async function updateComposioSelectedTools(projectId: string, tools: z.infer<typeof ZTool>[]): Promise<void> {
    await projectAuthCheck(projectId);

    // update project with new selected tools
    await projectsCollection.updateOne({ _id: projectId }, { $set: { composioSelectedTools: tools } });
}