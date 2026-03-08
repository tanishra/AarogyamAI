import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { healthMonitor } from './healthMonitor';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
const TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

interface RetryConfig {
  retryCount: number;
  startTime?: number;
}

// Create axios instance with base configuration
export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Store for auth token getter (will be set by auth context)
let getAuthToken: (() => string | null) | null = null;
let refreshTokenFn: (() => Promise<void>) | null = null;

export function setAuthTokenGetter(getter: () => string | null) {
  getAuthToken = getter;
}

export function setRefreshTokenFunction(fn: () => Promise<void>) {
  refreshTokenFn = fn;
}

// Request interceptor to add auth header
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAuthToken?.();
    console.log('[API Client] Token available:', !!token);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('[API Client] Authorization header set');
    } else {
      console.log('[API Client] No token available');
    }
    
    // Initialize retry count and start time
    if (!config.headers['x-retry-count']) {
      (config as InternalAxiosRequestConfig & { retryConfig?: RetryConfig }).retryConfig = { 
        retryCount: 0,
        startTime: Date.now(),
      };
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for token refresh, retry logic, and health monitoring
apiClient.interceptors.response.use(
  (response) => {
    // Record successful request
    const config = response.config as InternalAxiosRequestConfig & { retryConfig?: RetryConfig };
    if (config.retryConfig?.startTime) {
      const responseTime = Date.now() - config.retryConfig.startTime;
      healthMonitor.recordSuccess(responseTime);
    }
    
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { 
      retryConfig?: RetryConfig;
      _isRetry?: boolean;
    };

    if (!originalRequest) {
      healthMonitor.recordFailure();
      return Promise.reject(error);
    }

    // Handle 401 - Token refresh
    if (error.response?.status === 401 && !originalRequest._isRetry) {
      originalRequest._isRetry = true;

      try {
        if (refreshTokenFn) {
          await refreshTokenFn();
          
          // Retry the original request with new token
          const token = getAuthToken?.();
          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // If refresh fails, reject with original error
        return Promise.reject(error);
      }
    }

    // Retry logic for network errors and 5xx errors
    const shouldRetry = 
      !error.response || // Network error
      (error.response.status >= 500 && error.response.status < 600); // Server error

    if (shouldRetry && originalRequest.retryConfig) {
      const { retryCount } = originalRequest.retryConfig;

      if (retryCount < MAX_RETRIES) {
        originalRequest.retryConfig.retryCount = retryCount + 1;

        // Exponential backoff: 1s, 2s, 4s
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return apiClient(originalRequest);
      }
    }

    // Record failure for health monitoring
    healthMonitor.recordFailure();

    return Promise.reject(error);
  }
);

export default apiClient;
