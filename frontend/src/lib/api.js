const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const buildUrl = (path) => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path.startsWith("/")) {
    return `${API_BASE_URL}${path}`;
  }

  return `${API_BASE_URL}/${path}`;
};

const parseResponse = async (response) => {
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload?.message || payload?.msg || `Request failed with status ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload || {};
};

export const apiRequest = async (path, options = {}) => {
  const { body, headers, method = "GET", ...restOptions } = options;

  const response = await fetch(buildUrl(path), {
    method,
    credentials: "include",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    ...restOptions,
  });

  return parseResponse(response);
};
