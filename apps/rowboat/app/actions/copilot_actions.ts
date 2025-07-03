'use server';
import { 
    CopilotAPIRequest,
    CopilotChatContext, CopilotMessage,
} from "../lib/types/copilot_types";
import { 
    Workflow} from "../lib/types/workflow_types";
import { DataSource } from "../lib/types/datasource_types";
import { z } from 'zod';
import { check_query_limit } from "../lib/rate_limiting";
import { QueryLimitError } from "../lib/client_utils";
import { projectAuthCheck } from "./project_actions";
import { redisClient } from "../lib/redis";
import { collectProjectTools } from "../lib/project_tools";
import { mergeProjectTools } from "../lib/types/project_types";
import { authorizeUserAction, logUsage } from "./billing_actions";
import { USE_BILLING } from "../lib/feature_flags";
import { WithStringId } from "../lib/types/types";
import { getEditAgentInstructionsResponse } from "../lib/copilot/copilot";

export async function getCopilotResponseStream(
    projectId: string,
    messages: z.infer<typeof CopilotMessage>[],
    current_workflow_config: z.infer<typeof Workflow>,
    context: z.infer<typeof CopilotChatContext> | null,
    dataSources?: WithStringId<z.infer<typeof DataSource>>[]
): Promise<{
    streamId: string;
} | { billingError: string }> {
    await projectAuthCheck(projectId);
    if (!await check_query_limit(projectId)) {
        throw new QueryLimitError();
    }

    // Check billing authorization
    const authResponse = await authorizeUserAction({
        type: 'copilot_request',
        data: {},
    });
    if (!authResponse.success) {
        return { billingError: authResponse.error || 'Billing error' };
    }

    if (!await check_query_limit(projectId)) {
        throw new QueryLimitError();
    }

    // Get MCP tools from project and merge with workflow tools
    const projectTools = await collectProjectTools(projectId);
    
    // Convert workflow to copilot format with both workflow and project tools
    const wflow = {
        ...current_workflow_config,
        tools: mergeProjectTools(current_workflow_config.tools, projectTools)
    };

    // prepare request
    const request: z.infer<typeof CopilotAPIRequest> = {
        projectId,
        messages,
        workflow: wflow,
        context,
        dataSources: dataSources,
    };

    // serialize the request
    const payload = JSON.stringify(request);

    // create a uuid for the stream
    const streamId = crypto.randomUUID();

    // store payload in redis
    await redisClient.set(`copilot-stream-${streamId}`, payload, 'EX', 60 * 10); // expire in 10 minutes

    return {
        streamId,
    };
}

export async function getCopilotAgentInstructions(
    projectId: string,
    messages: z.infer<typeof CopilotMessage>[],
    current_workflow_config: z.infer<typeof Workflow>,
    agentName: string,
): Promise<string | { billingError: string }> {
    await projectAuthCheck(projectId);
    if (!await check_query_limit(projectId)) {
        throw new QueryLimitError();
    }

    // Check billing authorization
    const authResponse = await authorizeUserAction({
        type: 'copilot_request',
        data: {},
    });
    if (!authResponse.success) {
        return { billingError: authResponse.error || 'Billing error' };
    }

    // Get MCP tools from project and merge with workflow tools
    const projectTools = await collectProjectTools(projectId);
    
    // Convert workflow to copilot format with both workflow and project tools
    const wflow = {
        ...current_workflow_config,
        tools: mergeProjectTools(current_workflow_config.tools, projectTools)
    };

    // prepare request
    const request: z.infer<typeof CopilotAPIRequest> = {
        projectId,
        messages,
        workflow: wflow,
        context: {
            type: 'agent',
            name: agentName,
        }
    };

    // call copilot api
    const agent_instructions = await getEditAgentInstructionsResponse(
        projectId,
        request.context,
        request.messages,
        request.workflow,
    );

    // log the billing usage
    if (USE_BILLING) {
        await logUsage({
            type: 'copilot_requests',
            amount: 1,
        });
    }

    // return response
    return agent_instructions;
}