import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import {
  mapErrorToMessage,
  extractValidationErrors,
  isClientError,
  isServerError,
  isNetworkError,
} from '../errors/errorMapper';

describe('API Client Error Handling', () => {
  describe('Error Message Mapping', () => {
    it('should map 401 errors to session expired message', () => {
      const error = new AxiosError('Unauthorized');
      error.response = {
        status: 401,
        data: {},
        statusText: 'Unauthorized',
        headers: {},
        config: {} as any,
      };

      const message = mapErrorToMessage(error);
      expect(message).toBe('Your session has expired. Please log in again.');
    });

    it('should map 403 errors to permission denied message', () => {
      const error = new AxiosError('Forbidden');
      error.response = {
        status: 403,
        data: {},
        statusText: 'Forbidden',
        headers: {},
        config: {} as any,
      };

      const message = mapErrorToMessage(error);
      expect(message).toBe('You do not have permission to perform this action.');
    });

    it('should map 500 errors to server error message', () => {
      const error = new AxiosError('Internal Server Error');
      error.response = {
        status: 500,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any,
      };

      const message = mapErrorToMessage(error);
      expect(message).toBe('An internal server error occurred. Please try again later.');
    });

    it('should handle network errors', () => {
      const error = new AxiosError('Network Error');
      error.code = 'ERR_NETWORK';

      const message = mapErrorToMessage(error);
      expect(message).toBe('Network error. Please check your internet connection.');
    });

    it('should handle timeout errors', () => {
      const error = new AxiosError('Timeout');
      error.code = 'ECONNABORTED';

      const message = mapErrorToMessage(error);
      expect(message).toBe('The request timed out. Please check your connection and try again.');
    });
  });

  describe('Error Type Detection', () => {
    it('should detect client errors (4xx)', () => {
      const error = new AxiosError('Bad Request');
      error.response = {
        status: 400,
        data: {},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      expect(isClientError(error)).toBe(true);
      expect(isServerError(error)).toBe(false);
      expect(isNetworkError(error)).toBe(false);
    });

    it('should detect server errors (5xx)', () => {
      const error = new AxiosError('Server Error');
      error.response = {
        status: 500,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any,
      };

      expect(isClientError(error)).toBe(false);
      expect(isServerError(error)).toBe(true);
      expect(isNetworkError(error)).toBe(false);
    });

    it('should detect network errors', () => {
      const error = new AxiosError('Network Error');
      error.response = undefined;

      expect(isClientError(error)).toBe(false);
      expect(isServerError(error)).toBe(false);
      expect(isNetworkError(error)).toBe(true);
    });
  });

  describe('Validation Error Extraction', () => {
    it('should extract validation errors from API response', () => {
      const error = new AxiosError('Validation failed');
      error.response = {
        status: 422,
        data: {
          errors: {
            email: ['Email is required'],
            password: ['Password is too short'],
          },
        },
        statusText: 'Unprocessable Entity',
        headers: {},
        config: {} as any,
      };

      const validationErrors = extractValidationErrors(error);
      expect(validationErrors).toEqual({
        email: 'Email is required',
        password: 'Password is too short',
      });
    });

    it('should return null when no validation errors present', () => {
      const error = new AxiosError('Bad Request');
      error.response = {
        status: 400,
        data: {},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      const validationErrors = extractValidationErrors(error);
      expect(validationErrors).toBeNull();
    });
  });
});

describe('API Client Configuration', () => {
  it('should export apiClient with proper configuration', async () => {
    const { apiClient } = await import('./client');
    
    expect(apiClient).toBeDefined();
    expect(apiClient.defaults.timeout).toBe(30000);
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('should export token management functions', async () => {
    const { setAuthTokenGetter, setRefreshTokenFunction } = await import('./client');
    
    expect(setAuthTokenGetter).toBeDefined();
    expect(typeof setAuthTokenGetter).toBe('function');
    expect(setRefreshTokenFunction).toBeDefined();
    expect(typeof setRefreshTokenFunction).toBe('function');
  });
});
