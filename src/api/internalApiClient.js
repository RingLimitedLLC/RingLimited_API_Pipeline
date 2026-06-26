import { appParams } from '@/lib/app-params';

const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_INTERNAL_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return '';
};

const buildUrl = (path, params = {}) => {
  const baseUrl = getApiBaseUrl();
  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
      return;
    }

    if (typeof value === 'object') {
      url.searchParams.append(key, JSON.stringify(value));
      return;
    }

    url.searchParams.append(key, String(value));
  });

  return url.toString();
};

const requestJson = async (path, { method = 'GET', body, params, headers = {} } = {}) => {
  const url = buildUrl(path, params);
  const authHeaders = {};

  if (typeof window !== 'undefined') {
    const token = window.localStorage?.getItem('access_token') || window.localStorage?.getItem('base44_access_token');
    if (token) {
      authHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.message || 'Request failed';
    throw new Error(message);
  }

  return data;
};

const unwrapEntityList = (response) => (Array.isArray(response) ? response : (response?.data ?? []));

const createEntityAdapter = (entityName) => ({
  list: async (...args) => {
    const [sort = '-created_date', limit = 100] = args;
    const response = await requestJson(`/api/entities/${entityName}`, {
      params: { sort, limit },
    });
    return unwrapEntityList(response);
  },
  filter: async (criteria = {}, sort = '-created_date', limit = 100) => {
    const response = await requestJson(`/api/entities/${entityName}`, {
      params: {
        ...criteria,
        sort,
        limit,
      },
    });
    return unwrapEntityList(response);
  },
  get: async (id) => requestJson(`/api/entities/${entityName}/${id}`),
  create: async (payload) => requestJson(`/api/entities/${entityName}`, {
    method: 'POST',
    body: payload,
  }),
  update: async (id, payload) => requestJson(`/api/entities/${entityName}/${id}`, {
    method: 'PATCH',
    body: payload,
  }),
  delete: async (id) => requestJson(`/api/entities/${entityName}/${id}`, {
    method: 'DELETE',
  }),
});

export const createInternalApiAdapter = () => ({
  auth: {
    me: async () => requestJson('/api/auth/me'),
    isAuthenticated: async () => {
      const result = await requestJson('/api/auth/is-authenticated');
      return Boolean(result?.authenticated ?? result);
    },
    redirectToLogin: () => {
      if (typeof window !== 'undefined') {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.assign(`/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(returnTo || '/')}`);
      }
    },
    logout: () => {
      if (typeof window !== 'undefined') {
        window.location.assign('/.auth/logout?post_logout_redirect_uri=/');
      }
    },
  },
  entities: new Proxy({}, {
    get(_target, entityName) {
      if (typeof entityName !== 'string') {
        return undefined;
      }
      return createEntityAdapter(entityName);
    },
  }),
  functions: {
    invoke: async (name, payload = {}) => ({
      data: await requestJson(`/api/functions/${name}`, {
        method: 'POST',
        body: payload,
      }),
    }),
  },
  appLogs: {
    logUserInApp: async (pageName) => requestJson('/api/app-logs', {
      method: 'POST',
      body: { pageName },
    }),
  },
  __internal: {
    apiBaseUrl: getApiBaseUrl(),
    source: 'internal-api',
  },
});

export const internalApiClient = createInternalApiAdapter();
