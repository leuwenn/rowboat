import { z } from "zod";
import { projectsCollection } from "./mongodb";
import { WorkflowTool } from "./types/workflow_types";

export async function collectProjectTools(projectId: string): Promise<z.infer<typeof WorkflowTool>[]> {
    const tools: z.infer<typeof WorkflowTool>[] = [];

    // Get project data
    const project = await projectsCollection.findOne({ _id: projectId });
    if (!project) {
        throw new Error(`Project ${projectId} not found`);
    }

    // Convert MCP tools to workflow tools format, but only from ready servers
    if (project.mcpServers) {
        for (const server of project.mcpServers) {
            if (server.isReady) {
                for (const tool of server.tools) {
                    tools.push({
                        name: tool.name,
                        description: tool.description || "",
                        parameters: {
                            type: 'object' as const,
                            properties: tool.parameters?.properties || {},
                            required: tool.parameters?.required || []
                        },
                        isMcp: true,
                        mcpServerName: server.name,
                        mcpServerURL: server.serverUrl,
                    });
                }
            }
        }
    }

    // Add Composio tools
    if (project.composioSelectedTools) {
        for (const tool of project.composioSelectedTools) {
            tools.push({
                name: tool.slug,
                description: tool.description || "",
                parameters: {
                    type: 'object' as const,
                    properties: tool.input_parameters?.properties || {},
                    required: tool.input_parameters?.required || []
                },
                isComposio: true,
                composioData: {
                    slug: tool.slug,
                    noAuth: tool.no_auth,
                    toolkitName: tool.toolkit.name,
                    toolkitSlug: tool.toolkit.slug,
                    logo: tool.toolkit.logo,
                },
            });
        }
    }

    return tools;
}
