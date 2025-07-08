'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Wrench } from 'lucide-react';
import clsx from 'clsx';
import { Spinner } from '@heroui/react';
import { deleteConnectedAccount } from '@/app/actions/composio_actions';
import { z } from 'zod';
import { ZToolkit } from '@/app/lib/composio/composio';
import { Project } from '@/app/lib/types/project_types';
import { ToolkitAuthModal } from './ToolkitAuthModal';

type ToolkitType = z.infer<typeof ZToolkit>;
type ProjectType = z.infer<typeof Project>;

const toolkitCardStyles = {
    base: clsx(
        "group p-6 rounded-xl transition-all duration-200",
        "bg-white dark:bg-gray-900 shadow-sm dark:shadow-none",
        "border-2 border-gray-200/80 dark:border-gray-700/80",
        "hover:shadow-md dark:hover:shadow-none",
        "hover:border-blue-200 dark:hover:border-blue-900",
        "min-h-[280px] flex flex-col"
    ),
};

interface ToolkitCardProps {
  toolkit: ToolkitType;
  projectId: string;
  isConnected: boolean;
  connectedAccountId?: string;
  projectConfig: ProjectType | null;
  onManageTools: () => void;
  onProjectConfigUpdate: () => void;
  onRemoveToolkitTools: (toolkitSlug: string) => void;
}

export function ToolkitCard({ 
  toolkit, 
  projectId,
  isConnected,
  connectedAccountId,
  projectConfig,
  onManageTools,
  onProjectConfigUpdate,
  onRemoveToolkitTools
}: ToolkitCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleToggleConnection = useCallback(async () => {
    const newState = !isConnected;
    
    // Clear any previous error when starting a new operation
    setError(null);

    if (newState) {
      // Show authentication modal
      setShowAuthModal(true);
    } else {
      // Disconnect - remove the connected account
      setIsProcessing(true);
      try {
        if (connectedAccountId) {
          await deleteConnectedAccount(projectId, toolkit.slug, connectedAccountId);
          onProjectConfigUpdate();
          onRemoveToolkitTools(toolkit.slug);
        } else {
          // Fallback: just refresh the project config
          onProjectConfigUpdate();
        }
      } catch (err: any) {
        console.error('Disconnect failed:', err);
        const errorMessage = err.message || 'Failed to disconnect toolkit';
        setError(errorMessage);
      } finally {
        setIsProcessing(false);
      }
    }
  }, [projectId, toolkit.slug, isConnected, connectedAccountId, onProjectConfigUpdate, onRemoveToolkitTools]);

  const handleAuthComplete = useCallback(() => {
    // Update project config when authentication completes
    onProjectConfigUpdate();
  }, [onProjectConfigUpdate]);

  // Calculate selected tools count for this toolkit
  const selectedToolsCount = projectConfig?.composioSelectedTools?.filter(tool => 
    tool.toolkit.slug === toolkit.slug
  ).length || 0;

  return (
    <div className={toolkitCardStyles.base}>
      <div className="flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {toolkit.meta.logo && (
              <img 
                src={toolkit.meta.logo} 
                alt={`${toolkit.name} logo`}
                className="w-8 h-8 rounded-md object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <div>
              <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                {toolkit.name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-1.5 py-0.5 rounded-full text-xs font-medium 
                  bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                  {toolkit.meta.tools_count} tools
                </span>
                {selectedToolsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-medium 
                    bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300">
                    {selectedToolsCount} selected
                  </span>
                )}
                {toolkit.no_auth && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-medium 
                    bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300">
                    No Auth
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {toolkit.no_auth ? (
              <div className="flex items-center gap-2">
                <Switch
                  checked={true}
                  onCheckedChange={() => {}} // No-op for no-auth toolkits
                  disabled={true}
                  className={clsx(
                    "data-[state=checked]:bg-emerald-500 dark:data-[state=checked]:bg-emerald-600",
                    "data-[state=unchecked]:bg-emerald-500 dark:data-[state=unchecked]:bg-emerald-600",
                    "opacity-50 cursor-not-allowed",
                    "scale-75"
                  )}
                />
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  Always Available
                </span>
              </div>
            ) : (
              <Switch
                checked={isConnected}
                onCheckedChange={handleToggleConnection}
                disabled={isProcessing}
                className={clsx(
                  "data-[state=checked]:bg-blue-500 dark:data-[state=checked]:bg-blue-600",
                  "data-[state=unchecked]:bg-gray-200 dark:data-[state=unchecked]:bg-gray-700",
                  isProcessing && "opacity-50 cursor-not-allowed",
                  "scale-75"
                )}
              />
            )}
          </div>
        </div>
        
        <div className="flex-1">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-3">
            {toolkit.meta.description}
          </p>
        </div>

        <div className="mt-auto">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400 dark:text-gray-500">
              ID: {toolkit.slug}
            </div>
            <div className="flex items-center gap-2">
              {isProcessing && (
                <div className="flex items-center gap-1 text-xs py-1 px-2 rounded-full text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20">
                  <Spinner size="sm" />
                  <span>Processing...</span>
                </div>
              )}
              {(isConnected || toolkit.no_auth) && !isProcessing && (
                <div className="text-xs py-1 px-2 rounded-full text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20">
                  {toolkit.no_auth ? 'Available' : 'Connected'}
                </div>
              )}
              {error && (
                <div className="text-xs py-1 px-2 rounded-full text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20">
                  Error: {error}
                </div>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={onManageTools}
                className="text-xs"
              >
                <div className="inline-flex items-center">
                  <Wrench className="h-3.5 w-3.5" />
                  <span className="ml-1.5">Tools</span>
                </div>
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      <ToolkitAuthModal
        key={toolkit.slug}
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        toolkitSlug={toolkit.slug}
        projectId={projectId}
        onComplete={handleAuthComplete}
      />
    </div>
  );
} 