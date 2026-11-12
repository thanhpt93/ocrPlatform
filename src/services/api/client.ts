const API_BASE = '/api/v1';

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

class ApiClient {
  public getAccessToken(): string | null {
    return localStorage.getItem('ocr_access_token');
  }

  public setTokens(accessToken: string, refreshToken?: string, user?: any) {
    localStorage.setItem('ocr_access_token', accessToken);
    if (refreshToken) localStorage.setItem('ocr_refresh_token', refreshToken);
    if (user) localStorage.setItem('ocr_user', JSON.stringify(user));
  }

  public clearTokens() {
    localStorage.removeItem('ocr_access_token');
    localStorage.removeItem('ocr_refresh_token');
    localStorage.removeItem('ocr_user');
  }

  public getCurrentUser(): any | null {
    const raw = localStorage.getItem('ocr_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const token = this.getAccessToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      this.clearTokens();
    }

    if (!res.ok) {
      let errBody: any;
      try {
        errBody = await res.json();
      } catch {
        errBody = { message: res.statusText || 'Unknown error' };
      }

      let rawMsg: any = errBody?.detail || errBody?.message || 'API request failed';
      let msgStr = 'API request failed';
      if (typeof rawMsg === 'string') {
        msgStr = rawMsg;
      } else if (Array.isArray(rawMsg)) {
        msgStr = rawMsg.map((item: any) => item?.msg || JSON.stringify(item)).join('; ');
      } else if (typeof rawMsg === 'object' && rawMsg !== null) {
        msgStr = rawMsg.message || rawMsg.detail || JSON.stringify(rawMsg);
      }

      const err: ApiError = {
        message: String(msgStr),
        code: errBody?.detail?.code || errBody?.code,
        status: res.status,
      };
      throw err;
    }

    // If 204 No Content
    if (res.status === 204) {
      return {} as T;
    }

    return await res.json();
  }

  public get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public put<T>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public patch<T>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
