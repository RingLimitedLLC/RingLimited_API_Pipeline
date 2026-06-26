import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { createInternalApiAdapter } from './internalApiClient';

const { appId, token, functionsVersion, appBaseUrl } = appParams;
const useBase44 = import.meta.env.VITE_USE_BASE44 === 'true';
const useInternalApi = !useBase44;

export const isUsingInternalApi = useInternalApi;

// Keep Base44 compatibility by default, but allow the UI to run against your own backend.
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
