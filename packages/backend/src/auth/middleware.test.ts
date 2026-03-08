import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authenticate } from './authMiddleware';
import { authorize, requireAdministrator, requireDPO } from './authorizationMiddleware';
import { generateAccessToken, TokenPayload } from './jwt';
import { blacklistToken } from './session';

describe('Authentication and Authorization Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn(() => ({ json: jsonMock }));
    
    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
      path: '/test',
    };
    
    mockResponse = {
      status: statusMock as any,
      json: jsonMock,
    };
    
    nextFunction = vi.fn();
  });

  describe('authenticate middleware', () => {
    it('should reject request without token', async () => {
      const middleware = authenticate();
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', async () => {
      mockRequest.headers = { authorization: 'InvalidFormat' };
      
      const middleware = authenticate();
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should accept request with valid token', async () => {
      const payload: Omit<TokenPayload, 'type'> = {
        userId: 'user-123',
        email: 'admin@example.com',
        role: 'Administrator',
      };
      
      const token = generateAccessToken(payload);
      mockRequest.headers = { authorization: `Bearer ${token}` };
      
      const middleware = authenticate();
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.userId).toBe(payload.userId);
      expect(mockRequest.user?.role).toBe(payload.role);
    });

    it('should reject blacklisted token', async () => {
      const payload: Omit<TokenPayload, 'type'> = {
        userId: 'user-123',
        email: 'admin@example.com',
        role: 'Administrator',
      };
      
      const token = generateAccessToken(payload);
      await blacklistToken(token, 3600);
      
      mockRequest.headers = { authorization: `Bearer ${token}` };
      
      const middleware = authenticate();
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Token has been revoked',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('authorize middleware', () => {
    beforeEach(() => {
      // Set up authenticated user
      mockRequest.user = {
        userId: 'user-123',
        email: 'admin@example.com',
        role: 'Administrator',
        type: 'access',
      };
    });

    it('should reject unauthenticated request', async () => {
      mockRequest.user = undefined;
      
      const middleware = authorize({ allowedRoles: ['Administrator'] });
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should allow user with correct role', async () => {
      const middleware = authorize({ allowedRoles: ['Administrator'] });
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject user with incorrect role', async () => {
      mockRequest.user!.role = 'Patient';
      
      const middleware = authorize({ allowedRoles: ['Administrator'] });
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Insufficient permissions to access this resource',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should allow user with any of multiple allowed roles', async () => {
      mockRequest.user!.role = 'DPO';
      
      const middleware = authorize({ allowedRoles: ['Administrator', 'DPO'] });
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('Convenience authorization functions', () => {
    beforeEach(() => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'admin@example.com',
        role: 'Administrator',
        type: 'access',
      };
    });

    it('requireAdministrator should allow Administrator', async () => {
      const middleware = requireAdministrator();
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('requireAdministrator should reject non-Administrator', async () => {
      mockRequest.user!.role = 'Patient';
      
      const middleware = requireAdministrator();
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('requireDPO should allow DPO', async () => {
      mockRequest.user!.role = 'DPO';
      
      const middleware = requireDPO();
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('requireDPO should reject non-DPO', async () => {
      const middleware = requireDPO();
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });
});
