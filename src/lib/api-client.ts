import { publicEnv } from "@/lib/env";

const defaultHeaders = {
  "Content-Type": "application/json",
  "x-app-secret": publicEnv.appSecretPath
};

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;

    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        message = data.error;
      }
    } catch {
      // ignore parse errors
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiGet = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    method: "GET",
    headers: defaultHeaders,
    cache: "no-store"
  });

  return handleResponse<T>(response);
};

export const apiPost = async <T>(url: string, body?: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: defaultHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });

  return handleResponse<T>(response);
};

export const apiPatch = async <T>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "PATCH",
    headers: defaultHeaders,
    body: JSON.stringify(body),
    cache: "no-store"
  });

  return handleResponse<T>(response);
};

export const apiDelete = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    method: "DELETE",
    headers: defaultHeaders,
    cache: "no-store"
  });

  return handleResponse<T>(response);
};
