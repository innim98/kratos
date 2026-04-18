const TOKEN_KEY = 'kratos_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, opts = {}) {
  const token = getToken();
  const headers = { ...opts.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }

  const res = await fetch(path, { ...opts, headers });

  if (res.status === 401) {
    clearToken();
  }

  return res;
}
