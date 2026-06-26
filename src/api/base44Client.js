import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { createInternalApiAdapter } from './internalApiClient';

const { appId, token, functionsVersion, appBaseUrl } = appParams;
const useBase44 = import.meta.env.VITE_USE_BASE44 === 'true';
const useInternalApi = !useBase44;

export const isUsingInternalApi = useInternalApi;

// Use the Azure backend by default; Base44 remains available only when explicitly enabled.
export const base44 = useInternalApi
  ? createInternalApiAdapter()
  : createClient({
      appId,
      token,
      functionsVersion,
      serverUrl: '',
      requiresAuth: false,
      appBaseUrl,
    });
