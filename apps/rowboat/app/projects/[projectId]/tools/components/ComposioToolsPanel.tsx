'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@heroui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { listTools } from '@/app/actions/composio_actions';
import { z } from 'zod';
import { ZTool, ZListResponse } from '@/app/lib/composio/composio';
import { SlidePanel } from '@/components/ui/slide-panel';
import { Project } from '@/app/lib/types/project_types';

type ToolType = z.infer<typeof ZTool>;
type ToolListResponse = z.infer<ReturnType<typeof ZListResponse<typeof ZTool>>>;
type ProjectType = z.infer<typeof Project>;

interface ComposioToolsPanelProps {
  toolkit: {
    slug: string;
    name: string;
    meta: {
      logo: string;
    };
    no_auth?: boolean;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  projectConfig: ProjectType | null;
  onUpdateToolsSelection: (selectedToolObjects: ToolType[]) => void;
  isSaving: boolean;
}

export function ComposioToolsPanel({ 
  toolkit, 
  isOpen, 
  onClose, 
  projectConfig,
  onUpdateToolsSelection,
  isSaving
}: ComposioToolsPanelProps) {
  const params = useParams();
  const projectId = typeof params.projectId === 'string' ? params.projectId : params.projectId?.[0];
  if (!projectId) throw new Error('Project ID is required');
  
  const [tools, setTools] = useState<ToolType[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  const loadToolsForToolkit = useCallback(async (toolkitSlug: string, cursor: string | null = null) => {
    try {
      setToolsLoading(true);
      
      const response: ToolListResponse = await listTools(projectId, toolkitSlug, cursor);
      
      setTools(response.items);
      setNextCursor(response.next_cursor);
      
      if (cursor === null) {
        // First page - reset pagination state
        setCurrentCursor(null);
        setCursorHistory([]);
      }
    } catch (err: any) {
      console.error('Error fetching tools:', err);
      setTools([]);
    } finally {
      setToolsLoading(false);
    }
  }, [projectId]);

  const handleNextPage = useCallback(async () => {
    if (!nextCursor || !toolkit) return;
    
    // Add current cursor to history
    setCursorHistory(prev => [...prev, currentCursor || '']);
    setCurrentCursor(nextCursor);
    
    await loadToolsForToolkit(toolkit.slug, nextCursor);
  }, [nextCursor, toolkit, currentCursor, loadToolsForToolkit]);

  const handlePreviousPage = useCallback(async () => {
    if (cursorHistory.length === 0 || !toolkit) return;
    
    // Get the previous cursor from history
    const previousCursor = cursorHistory[cursorHistory.length - 1];
    const newHistory = cursorHistory.slice(0, -1);
    
    setCursorHistory(newHistory);
    setCurrentCursor(previousCursor);
    
    await loadToolsForToolkit(toolkit.slug, previousCursor);
  }, [cursorHistory, toolkit, loadToolsForToolkit]);

  const handleToolSelectionChange = useCallback((toolSlug: string, selected: boolean) => {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(toolSlug);
      } else {
        next.delete(toolSlug);
      }
      setHasChanges(true);
      return next;
    });
  }, []);

  const handleSaveTools = useCallback(async () => {
    // Convert selected tool slugs to actual tool objects
    const selectedToolObjects = tools.filter(tool => selectedTools.has(tool.slug));
    await onUpdateToolsSelection(selectedToolObjects);
    setHasChanges(false);
  }, [onUpdateToolsSelection, selectedTools, tools]);

  const handleClose = useCallback(() => {
    setTools([]);
    setSelectedTools(new Set());
    setHasChanges(false);
    if (hasChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  }, [onClose, hasChanges]);

  // Initialize selected tools from project config when opening the panel
  useEffect(() => {
    if (toolkit && isOpen && projectConfig?.composioSelectedTools) {
      const toolSlugs = new Set(projectConfig.composioSelectedTools.map(tool => tool.slug));
      setSelectedTools(toolSlugs);
      setHasChanges(false);
    }
  }, [toolkit, isOpen, projectConfig]);

  useEffect(() => {
    if (toolkit && isOpen) {
      loadToolsForToolkit(toolkit.slug, null);
    }
  }, [toolkit, isOpen, loadToolsForToolkit]);

  if (!toolkit) return null;

  // Check if the toolkit is connected (has an active connected account) or doesn't require auth
  const isToolkitConnected = toolkit.no_auth || projectConfig?.composioConnectedAccounts?.[toolkit.slug]?.status === 'ACTIVE';

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-3">
          {toolkit.meta.logo && (
            <img 
              src={toolkit.meta.logo} 
              alt={`${toolkit.name} logo`}
              width={24}
              height={24}
              className="rounded-md object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <span>{toolkit.name}</span>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Available Tools</h4>
            <div className="flex items-center gap-2">
              {!isToolkitConnected && !toolkit.no_auth && (
                <div className="text-sm text-orange-600 dark:text-orange-400 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-900/20">
                  Toolkit not connected
                </div>
              )}
              {hasChanges && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveTools}
                  disabled={isSaving || !isToolkitConnected}
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-b-transparent border-white mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Tools List */}
        <div className="flex-1 overflow-y-auto">
          {toolsLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800 dark:border-gray-200 mx-auto"></div>
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading tools...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tools.map((tool) => (
                <div key={tool.slug} className={`group p-4 rounded-lg transition-all duration-200 border border-transparent ${
                  isToolkitConnected 
                    ? 'bg-gray-50/50 dark:bg-gray-800/50 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 hover:border-gray-200 dark:hover:border-gray-600' 
                    : 'bg-gray-100/50 dark:bg-gray-900/50 opacity-60'
                }`}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      isSelected={selectedTools.has(tool.slug)}
                      onValueChange={(selected) => handleToolSelectionChange(tool.slug, selected)}
                      size="sm"
                      isDisabled={!isToolkitConnected}
                    />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                        {tool.name}
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fixed Pagination Controls */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePreviousPage}
                disabled={cursorHistory.length === 0 || toolsLoading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleNextPage}
                disabled={!nextCursor || toolsLoading}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SlidePanel>
  );
} 