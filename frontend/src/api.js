import axios from "axios";

const apiBaseUrl = (import.meta.env.VITE_API_URL || "/api/").replace(/\/?$/, "/");

const api = axios.create({
  baseURL: apiBaseUrl,
});

export function saveTokens(tokens) {
  localStorage.setItem("savewise_access", tokens.access);
  localStorage.setItem("savewise_refresh", tokens.refresh);
}

export function clearTokens() {
  localStorage.removeItem("savewise_access");
  localStorage.removeItem("savewise_refresh");
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("savewise_access");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshRequest;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    if (
      error.response?.status !== 401 ||
      !request ||
      request._retried ||
      request.url?.includes("auth/token/")
    ) {
      return Promise.reject(error);
    }

    const refresh = localStorage.getItem("savewise_refresh");
    if (!refresh) {
      clearTokens();
      window.dispatchEvent(new Event("savewise:logout"));
      return Promise.reject(error);
    }

    request._retried = true;
    try {
      refreshRequest ??= axios
        .post(`${apiBaseUrl}auth/token/refresh/`, { refresh })
        .then(({ data }) => {
          saveTokens({ access: data.access, refresh: data.refresh || refresh });
          return data.access;
        })
        .finally(() => {
          refreshRequest = null;
        });
      const access = await refreshRequest;
      request.headers.Authorization = `Bearer ${access}`;
      return api(request);
    } catch (refreshError) {
      clearTokens();
      window.dispatchEvent(new Event("savewise:logout"));
      return Promise.reject(refreshError);
    }
  },
);

export default api;
