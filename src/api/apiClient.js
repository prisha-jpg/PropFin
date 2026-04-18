import { appParams } from "@/lib/app-params";

// This automatically prepends "/api" to all requests, so our components 
// only need to pass the specific route (e.g., "/pricing/calculate-unit")
const basePath = "/api";

const request = async (path, options = {}) => {
  const response = await fetch(`${basePath}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const body = await response.json();
      message = body?.message || message;
    } catch (_err) {
      // Ignore JSON parse failures for non-json responses
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

const createEntityClient = (entityName) => ({
  list: (sort = "", limit = 100) => {
    const params = new URLSearchParams();
    if (sort) {
      params.set("sort", sort);
    }
    if (limit) {
      params.set("limit", String(limit));
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    return request(`/entities/${entityName}${query}`);
  },
  get: (id) => request(`/entities/${entityName}/${id}`),
  create: (data) =>
    request(`/entities/${entityName}`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),
  update: (id, data) =>
    request(`/entities/${entityName}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data || {}),
    }),
  bulkCreate: (rows) =>
    request(`/entities/${entityName}/bulk`, {
      method: "POST",
      body: JSON.stringify(Array.isArray(rows) ? rows : []),
    }),
});

export const apiClient = {
  entities: new Proxy(
    {},
    {
      get: (_target, entityName) => createEntityClient(entityName),
    },
  ),
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body || {}) }),
  delete: (path) => request(path, { method: "DELETE" }),
  auth: {
    me: async () => {
      try {
        return await request("/auth/me");
      } catch (_error) {
        return {
          id: "local-user",
          full_name: "Local User",
          role: "admin",
        };
      }
    },
    logout: () => {
      window.localStorage.removeItem("propfin_access_token");
      window.localStorage.removeItem("token");
    },
    redirectToLogin: (fromUrl = window.location.href) => {
      const search = new URLSearchParams({ from_url: fromUrl });
      window.location.assign(`/?${search.toString()}`);
    },
  },
};

export { appParams };