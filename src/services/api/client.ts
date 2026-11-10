const API_BASE = '/api/v1';

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

class ApiClient {
  private getAccessToken(): string | null {
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
      // Auto-refresh attempt could be implemented here or clear session
      // For now, if unauthorized, do not crash abruptly
    }

    if (!res.ok) {
      let errBody: any;
      try {
        errBody = await res.json();
      } catch {
        errBody = { message: res.statusText || 'Unknown error' };
      }
      const error: ApiError = {
        message: errBody.detail?.message || errBody.detail || errBody.message || 'Request failed',
        code: errBody.detail?.code || errBody.code,
        status: res.status,
      };
      throw error;
    }

    if (res.status === 204) {
      return null as any;
    }

    return res.json();
  }

  public get<T>(endpoint: string, headers?: HeadersInit): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  public post<T>(endpoint: string, body?: any, headers?: HeadersInit): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers,
    });
  }

  public put<T>(endpoint: string, body?: any, headers?: HeadersInit): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers,
    });
  }

  public delete<T>(endpoint: string, headers?: HeadersInit): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }
}

export const api = new ApiClient();
