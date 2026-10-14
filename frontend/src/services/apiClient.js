import { ENV } from '../config/env';

const DEFAULT_REQUEST_TIMEOUT_MS = 60000;

function withTimeout(timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeoutId),
  };
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const responseData = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = new Error(
      typeof responseData === 'object' && (responseData?.message || responseData?.detail)
        ? responseData.message || responseData.detail
        : 'Request failed.',
    );
    error.status = response.status;
    error.responseData = responseData;
    throw error;
  }

  return responseData;
}

function withBaseUrl(path) {
  return `${ENV.apiBaseUrl}${path}`;
}

export async function get(path) {
  const request = withTimeout();
  try {
    const response = await fetch(withBaseUrl(path), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: request.signal,
    });

    return await parseResponse(response);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  } finally {
    request.clear();
  }
}

export async function postJson(path, payload, token) {
  const request = withTimeout();
  try {
    const response = await fetch(withBaseUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: request.signal,
    });

    return await parseResponse(response);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  } finally {
    request.clear();
  }
}

export async function postMultipart(path, formData, token) {
  let options = {};
  let authToken = token;

  if (token && typeof token === 'object') {
    options = token;
    authToken = undefined;
  } else {
    options = arguments[3] || {};
  }

  const timeoutMs = options.timeoutMs ?? 0;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', withBaseUrl(path));
    xhr.responseType = 'text';
    if (timeoutMs > 0) {
      xhr.timeout = timeoutMs;
    }
    xhr.setRequestHeader('Accept', 'application/json');

    if (authToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    }

    if (typeof options.onProgress === 'function') {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }
        const progress = Math.min(100, Math.max(0, (event.loaded / event.total) * 100));
        options.onProgress(progress);
      };
    }

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader('content-type') || '';
      const rawBody = xhr.responseText || '';
      const responseData = contentType.includes('application/json')
        ? (() => {
            try {
              return JSON.parse(rawBody);
            } catch {
              return {};
            }
          })()
        : rawBody;

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(responseData);
        return;
      }

      const message = typeof responseData === 'object' && (responseData?.message || responseData?.detail)
        ? responseData.message || responseData.detail
        : 'Request failed.';
      const error = new Error(message);
      error.status = xhr.status;
      error.responseData = responseData;
      reject(error);
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading model.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Request timed out.'));
    };

    xhr.send(formData);
  });
}
