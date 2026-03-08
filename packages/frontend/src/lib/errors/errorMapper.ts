import { AxiosError } from 'axios';

export interface ApiError {
  message: string;
  statusCode?: number;
  details?: Record<string, string[]>;
}

/**
 * Maps HTTP status codes and error responses to user-friendly messages
 */
export function mapErrorToMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;

    // Check if backend provided a message
    if (errorData?.message) {
      return errorData.message;
    }

    // Map status codes to generic messages
    switch (statusCode) {
      case 400:
        return 'Invalid request. Please check your input and try again.';
      case 401:
        return 'Your session has expired. Please log in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 409:
        return 'This action conflicts with the current state. Please refresh and try again.';
      case 422:
        return 'Validation failed. Please check your input.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'An internal server error occurred. Please try again later.';
      case 502:
      case 503:
      case 504:
        return 'The service is temporarily unavailable. Please try again later.';
      default:
        if (statusCode && statusCode >= 500) {
          return 'A server error occurred. Please try again later.';
        }
    }

    // Network errors
    if (error.code === 'ECONNABORTED') {
      return 'The request timed out. Please check your connection and try again.';
    }

    if (error.code === 'ERR_NETWORK') {
      return 'Network error. Please check your internet connection.';
    }

    if (!error.response) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }
  }

  // Generic error
  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Extracts validation errors from API response
 */
export function extractValidationErrors(error: unknown): Record<string, string> | null {
  if (error instanceof AxiosError) {
    const errorData = error.response?.data;
    
    if (errorData?.errors && typeof errorData.errors === 'object') {
      const validationErrors: Record<string, string> = {};
      
      for (const [field, messages] of Object.entries(errorData.errors)) {
        if (Array.isArray(messages) && messages.length > 0) {
          validationErrors[field] = messages[0];
        } else if (typeof messages === 'string') {
          validationErrors[field] = messages;
        }
      }
      
      return Object.keys(validationErrors).length > 0 ? validationErrors : null;
    }
  }
  
  return null;
}

/**
 * Checks if an error is a client error (4xx)
 */
export function isClientError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    const statusCode = error.response?.status;
    return statusCode !== undefined && statusCode >= 400 && statusCode < 500;
  }
  return false;
}

/**
 * Checks if an error is a server error (5xx)
 */
export function isServerError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    const statusCode = error.response?.status;
    return statusCode !== undefined && statusCode >= 500 && statusCode < 600;
  }
  return false;
}

/**
 * Checks if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return !error.response || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED';
  }
  return false;
}
