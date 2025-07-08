'use client';

import { useState, useCallback, useEffect } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Spinner, Button as HeroButton } from "@heroui/react";
import { Wrench, Shield, Key, Globe } from "lucide-react";
import { getToolkit, createComposioManagedOauth2ConnectedAccount, syncConnectedAccount, listToolkits } from '@/app/actions/composio_actions';
import { z } from 'zod';
import { ZGetToolkitResponse, ZToolkit } from '@/app/lib/composio/composio';

interface ToolkitAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolkitSlug: string;
  projectId: string;
  onComplete: () => void;
}

export function ToolkitAuthModal({ 
  isOpen, 
  onClose, 
  toolkitSlug, 
  projectId,
  onComplete 
}: ToolkitAuthModalProps) {
  const [toolkit, setToolkit] = useState<z.infer<typeof ZGetToolkitResponse> | null>(null);
  const [toolkitDetails, setToolkitDetails] = useState<z.infer<typeof ZToolkit> | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch toolkit details when modal opens
  useEffect(() => {
    if (isOpen && toolkitSlug) {
      setLoading(true);
      setError(null);
      
      // Fetch both toolkit auth details and full toolkit info
      Promise.all([
        getToolkit(projectId, toolkitSlug),
        listToolkits(projectId).then(response => 
          response.items.find(t => t.slug === toolkitSlug) || null
        )
      ])
        .then(([authDetails, fullDetails]) => {
          setToolkit(authDetails);
          setToolkitDetails(fullDetails);
        })
        .catch(err => {
          console.error('Failed to fetch toolkit:', err);
          setError('Failed to load toolkit details');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, toolkitSlug, projectId]);

  const handleOAuthCompletion = useCallback(async (connectedAccountId: string) => {
    try {
      // Sync the connected account to get the latest status
      await syncConnectedAccount(projectId, toolkitSlug, connectedAccountId);
      
      // Call completion callback
      onComplete();
      onClose();
    } catch (error) {
      console.error('Error syncing connected account after OAuth:', error);
      setError('Authentication completed but failed to sync status. Please refresh and try again.');
    }
  }, [projectId, toolkitSlug, onComplete, onClose]);

  const handleComposioOAuth2 = useCallback(async () => {
    setError(null);
    setProcessing(true);

    try {
      // Start OAuth flow
      const returnUrl = `${window.location.origin}/composio/oauth2/callback`;
      const response = await createComposioManagedOauth2ConnectedAccount(projectId, toolkitSlug, returnUrl);
      console.log('OAuth response:', JSON.stringify(response, null, 2));

      // if error, set error
      if ('error' in response) {
        if (response.error === 'CUSTOM_OAUTH2_CONFIG_REQUIRED') {
          setError('Please set up a custom OAuth2 configuration for this toolkit in the Composio dashboard');
        } else {
          setError('Failed to connect to toolkit');
        }
        return;
      }

      // Open OAuth window
      const authWindow = window.open(
        response.connectionData.val.redirectUrl as string,
        '_blank',
        'width=600,height=700'
      );

      if (authWindow) {
        // Use postMessage since we control the callback URL
        const handleMessage = (event: MessageEvent) => {
          // Only accept messages from our own origin
          if (event.origin !== window.location.origin) {
            return;
          }
          
          // Check if this is an OAuth completion message
          if (event.data && event.data.type === 'OAUTH_COMPLETE') {
            window.removeEventListener('message', handleMessage);
            clearInterval(checkInterval);
            
            if (event.data.success) {
              // Handle successful OAuth completion
              handleOAuthCompletion(response.id);
            } else {
              // Handle OAuth error
              const errorMessage = event.data.errorDescription || event.data.error || 'OAuth authentication failed';
              setError(errorMessage);
            }
          }
        };
        
        // Listen for postMessage from our callback page
        window.addEventListener('message', handleMessage);
        
        // Minimal fallback: check if window closes without message
        const checkInterval = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(checkInterval);
            window.removeEventListener('message', handleMessage);
            
            // If we didn't get a postMessage, still try to sync
            // (in case the message was missed for some reason)
            handleOAuthCompletion(response.id);
          }
        }, 1000); // Check less frequently since we expect postMessage
      } else {
        window.alert('Failed to open authentication window. Please check your popup blocker settings.');
        setError('Failed to open authentication window');
      }
    } catch (err: any) {
      console.error('OAuth flow failed:', err);
      const errorMessage = err.message || 'Failed to connect to toolkit';
      setError(errorMessage);
    } finally {
      setProcessing(false);
    }
  }, [projectId, toolkitSlug, handleOAuthCompletion]);

  const getAuthMethodIcon = (authScheme: string) => {
    switch (authScheme) {
      case 'OAUTH2':
        return <Shield className="h-5 w-5" />;
      case 'API_KEY':
        return <Key className="h-5 w-5" />;
      case 'BEARER_TOKEN':
        return <Key className="h-5 w-5" />;
      default:
        return <Globe className="h-5 w-5" />;
    }
  };

  const getAuthMethodName = (authScheme: string) => {
    switch (authScheme) {
      case 'OAUTH2':
        return 'OAuth2';
      case 'API_KEY':
        return 'API Key';
      case 'BEARER_TOKEN':
        return 'Bearer Token';
      case 'BASIC':
        return 'Basic Auth';
      default:
        return authScheme.toLowerCase().replace('_', ' ');
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onClose}
      size="md"
      classNames={{
        base: "bg-white dark:bg-gray-900",
        header: "border-b border-gray-200 dark:border-gray-800",
        footer: "border-t border-gray-200 dark:border-gray-800",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex gap-3 items-center">
          {toolkitDetails?.meta?.logo ? (
            <img 
              src={toolkitDetails.meta.logo} 
              alt={`${toolkitSlug} logo`}
              className="w-8 h-8 rounded-md object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <Wrench className="w-5 h-5 text-blue-500" />
          )}
          <span>Connect to {toolkitSlug}</span>
        </ModalHeader>
        <ModalBody>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
              {error}
            </div>
          ) : toolkit ? (
            <div className="space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Choose how you'd like to authenticate with this toolkit:
              </div>
              
              <div className="space-y-3">
                {/* OAuth2 Composio Managed */}
                                 {toolkit.composio_managed_auth_schemes.includes('OAUTH2') && (
                   <HeroButton
                     className="w-full justify-start gap-3 h-auto py-4 px-4"
                     variant="bordered"
                     onPress={handleComposioOAuth2}
                     isDisabled={processing}
                     size="lg"
                   >
                    <div className="bg-green-100 dark:bg-green-900/20 p-2 rounded-lg">
                      <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium">Connect using OAuth2</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Secure authentication managed by Composio
                      </div>
                    </div>
                    {processing && <Spinner size="sm" className="ml-auto" />}
                  </HeroButton>
                )}

                {/* Custom OAuth2 */}
                                 {toolkit.auth_config_details?.some(config => config.mode === 'OAUTH2') && 
                  !toolkit.composio_managed_auth_schemes.includes('OAUTH2') && (
                   <HeroButton
                     className="w-full justify-start gap-3 h-auto py-4 px-4"
                     variant="bordered"
                     isDisabled
                     size="lg"
                   >
                    <div className="bg-orange-100 dark:bg-orange-900/20 p-2 rounded-lg">
                      <Shield className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium">Connect using custom OAuth2 app</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Coming soon - use your own OAuth2 configuration
                      </div>
                    </div>
                  </HeroButton>
                )}

                {/* Other auth schemes */}
                                 {toolkit.auth_config_details?.filter(config => config.mode !== 'OAUTH2').map(config => (
                   <HeroButton
                     key={config.mode}
                     className="w-full justify-start gap-3 h-auto py-4 px-4"
                     variant="bordered"
                     isDisabled
                     size="lg"
                   >
                    <div className="bg-blue-100 dark:bg-blue-900/20 p-2 rounded-lg">
                      {getAuthMethodIcon(config.mode)}
                    </div>
                    <div className="text-left">
                      <div className="font-medium">Connect using {getAuthMethodName(config.mode)}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Coming soon
                      </div>
                    </div>
                  </HeroButton>
                ))}
              </div>
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <HeroButton variant="bordered" onPress={onClose}>
            Cancel
          </HeroButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
} 