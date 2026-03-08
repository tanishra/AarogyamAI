import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import {
  mapErrorToMessage,
  extractValidationErrors,
  isClientError,
  isServerError,
  isNetworkError,
} from './errorMapper';

describe('Error Mapper', () => {
  describe('mapErrorToMessage', () => {
    it('should return backend message if provided', () => {
      const error = new AxiosError('Request failed');
      error.response = {
        status: 400,
        data: { message: 'Custom error message' },
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      expect(mapErrorToMessage(error)).toBe('Custom error message');
    });

    it('should map 400 status to validation message', () => {
      const error = new AxiosError('Request failed');
      error.response = {
        status: 400,
        data: {},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      expect(mapErrorToMessage(error)).toBe('Invalid request. Please check your input and try again.');
    });

    it('should map 401 status to session expired message', () => {
      const error = new AxiosError('Unauthorized');
      error.response = {
        status: 401,
        data: {},
        statusText: 'Unauthorized',
        headers: {},
        config: {} as any,
      };

      expect(mapErrorToMessage(error)).toBe('Your session has expired. Please log in again.');
    });

    it('should map 403 status to permission denied message', () => {
      const error = new AxiosError('Forbidden');
      error.response = {
        status: 403,
        data: {},
        statusText: 'Forbidden',
        headers: {},
        config: {} as any,
      };

      expect(mapErrorToMessage(error)).toBe('You do not have permission to perform this action.');
    });

    it('should map 404 status to not found message', () => {
      const error = new AxiosError('Not Found');
      error.response = {
        status: 404,
        data: {},
        statusText: 'Not Found',
        headers: {},
        config: {} as any,
      };

      expect(mapErrorToMessage(error)).toBe('The requested resource was not found.');
    });

    it('should map 409 status to conflict message', () => {
      const error = new AxiosError('Conflict');
      error.response = {
        status: 409,
        data: {},
        statusText: 'Conflict',
        headers: {},
        config: {} as any,
      };

      expect(mapErrorToMessage(error)).toBe('This action conflicts with the current state. Please refresh and try again.');
    });

    it('should map 500 status to server error message', () => {
      const error = new AxiosError('Internal Server Error');
      error.response = {
        status: 500,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any,
      };

      expect(mapErrorToMessage(error)).toBe('An internal server error occurred. Please try again later.');
    });

    it('should map 503 status to service unavailable message', () => {
      const error = new AxiosError('Service Unavailable');
      error.response = {
        status: 503,
        data: {},
        statusText: 'Service Unavailable',
        headers: {},
        config: {} as any,
      };

      expect(mapErrorToMessage(error)).toBe('The service is temporarily unavailable. Please try again later.');
    });

    it('should handle timeout errors', () => {
      const error = new AxiosError('Timeout');
      error.code = 'ECONNABORTED';

      expect(mapErrorToMessage(error)).toBe('The request timed out. Please check your connection and try again.');
    });

    it('should handle network errors', () => {
      const error = new AxiosError('Network Error');
      error.code = 'ERR_NETWORK';

      expect(mapErrorToMessage(error)).toBe('Network error. Please check your internet connection.');
    });

    it('should handle errors without response', () => {
      const error = new AxiosError('Network Error');
      error.response = undefined;

      expect(mapErrorToMessage(error)).toBe('Unable to connect to the server. Please check your internet connection.');
    });

    it('should handle generic Error instances', () => {
      const error = new Error('Something went wrong');

      expect(mapErrorToMessage(error)).toBe('Something went wrong');
    });

    it('should handle unknown error types', () => {
      const error = { unknown: 'error' };

      expect(mapErrorToMessage(error)).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('extractValidationErrors', () => {
    it('should extract validation errors from response', () => {
      const error = new AxiosError('Validation failed');
      error.response = {
        status: 422,
        data: {
          errors: {
            email: ['Email is required', 'Email must be valid'],
            password: ['Password is too short'],
          },
        },
        statusText: 'Unprocessable Entity',
        headers: {},
        config: {} as any,
      };

      const result = extractValidationErrors(error);
      expect(result).toEqual({
        email: 'Email is required',
        password: 'Password is too short',
      });
    });

    it('should handle string error messages', () => {
      const error = new AxiosError('Validation failed');
      error.response = {
        status: 422,
        data: {
          errors: {
            email: 'Email is required',
          },
        },
        statusText: 'Unprocessable Entity',
        headers: {},
        config: {} as any,
      };

      const result = extractValidationErrors(error);
      expect(result).toEqual({
        email: 'Email is required',
      });
    });

    it('should return null if no validation errors', () => {
      const error = new AxiosError('Bad Request');
      error.response = {
        status: 400,
        data: {},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      expect(extractValidationErrors(error)).toBeNull();
    });

    it('should return null for non-axios errors', () => {
      const error = new Error('Generic error');

      expect(extractValidationErrors(error)).toBeNull();
    });
  });

  describe('isClientError', () => {
    it('should return true for 4xx status codes', () => {
      const error = new AxiosError('Bad Request');
      error.response = {
        status: 400,
        data: {},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      expect(isClientError(error)).toBe(true);
    });

    it('should return false for 5xx status codes', () => {
      const error = new AxiosError('Server Error');
      error.response = {
        status: 500,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any,
      };

      expect(isClientError(error)).toBe(false);
    });

    it('should return false for non-axios errors', () => {
      const error = new Error('Generic error');

      expect(isClientError(error)).toBe(false);
    });
  });

  describe('isServerError', () => {
    it('should return true for 5xx status codes', () => {
      const error = new AxiosError('Server Error');
      error.response = {
        status: 500,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any,
      };

      expect(isServerError(error)).toBe(true);
    });

    it('should return false for 4xx status codes', () => {
      const error = new AxiosError('Bad Request');
      error.response = {
        status: 400,
        data: {},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      expect(isServerError(error)).toBe(false);
    });

    it('should return false for non-axios errors', () => {
      const error = new Error('Generic error');

      expect(isServerError(error)).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('should return true for errors without response', () => {
      const error = new AxiosError('Network Error');
      error.response = undefined;

      expect(isNetworkError(error)).toBe(true);
    });

    it('should return true for ERR_NETWORK code', () => {
      const error = new AxiosError('Network Error');
      error.code = 'ERR_NETWORK';

      expect(isNetworkError(error)).toBe(true);
    });

    it('should return true for ECONNABORTED code', () => {
      const error = new AxiosError('Timeout');
      error.code = 'ECONNABORTED';

      expect(isNetworkError(error)).toBe(true);
    });

    it('should return false for errors with response', () => {
      const error = new AxiosError('Bad Request');
      error.response = {
        status: 400,
        data: {},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      expect(isNetworkError(error)).toBe(false);
    });

    it('should return false for non-axios errors', () => {
      const error = new Error('Generic error');

      expect(isNetworkError(error)).toBe(false);
    });
  });
});
