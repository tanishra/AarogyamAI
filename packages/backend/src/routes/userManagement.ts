import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { UserManagementService } from '../services/UserManagementService';
import { UserRepository } from '../repositories/UserRepository';
import { RegistrationRequestRepository } from '../repositories/RegistrationRequestRepository';
import { AuditLogRepository } from '../repositories/AuditLogRepository';
import { authenticate } from '../auth/authMiddleware';
import { requireAdministrator } from '../auth/authorizationMiddleware';
import { randomBytes } from 'crypto';

const router = Router();
const userManagementService = new UserManagementService();
const userRepo = new UserRepository();
const registrationRepo = new RegistrationRequestRepository();

// Mock audit logging for MVP (DynamoDB not configured)
const mockAuditLog = async (data: any) => {
  console.log('[AUDIT LOG - DISABLED FOR MVP]:', data.actionType, data.userId);
};

// Apply authentication and authorization middleware to all routes
router.use(authenticate({}));
router.use(requireAdministrator());

// Validation schemas
const approveRegistrationSchema = z.object({
  registrationRequestId: z.string().uuid(),
});

const rejectRegistrationSchema = z.object({
  registrationRequestId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

const changeRoleSchema = z.object({
  role: z.enum(['Patient', 'Nurse', 'Doctor', 'Administrator', 'DPO']),
});

const changeStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().optional(),
});

const passwordResetSchema = z.object({
  userId: z.string().uuid(),
});

const mfaSchema = z.object({
  enabled: z.boolean(),
  method: z.enum(['totp', 'sms']).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const activityFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  actionType: z.string().optional(),
});

/**
 * POST /api/admin/registration-requests/:id/approve
 * Approve a registration request
 */
router.post('/registration-requests/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate request
    const validation = approveRegistrationSchema.safeParse({ registrationRequestId: id });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid registration request ID',
        details: validation.error.errors,
      });
      return;
    }

    // Approve registration
    const result = await userManagementService.approveRegistration({
      registrationRequestId: id,
      processedBy: req.user!.userId,
      processedByName: req.user!.email,
      processedByRole: req.user!.role,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
    });

    res.status(200).json({
      message: 'Registration request approved successfully',
      data: {
        request: result.request,
        user: result.user,
      },
    });
  } catch (error) {
    console.error('Error approving registration:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('already')) {
        res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to approve registration request',
    });
  }
});

/**
 * POST /api/admin/registration-requests/:id/reject
 * Reject a registration request
 */
router.post('/registration-requests/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Validate request
    const validation = rejectRegistrationSchema.safeParse({
      registrationRequestId: id,
      reason,
    });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.errors,
      });
      return;
    }

    // Reject registration
    const result = await userManagementService.rejectRegistration({
      registrationRequestId: id,
      processedBy: req.user!.userId,
      processedByName: req.user!.email,
      processedByRole: req.user!.role,
      reason,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
    });

    res.status(200).json({
      message: 'Registration request rejected successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error rejecting registration:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('already')) {
        res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to reject registration request',
    });
  }
});

/**
 * GET /api/admin/registration-requests
 * Get all pending registration requests
 */
router.get('/registration-requests', async (_req: Request, res: Response) => {
  try {
    const requests = await registrationRepo.findPending();
    
    res.status(200).json({
      message: 'Registration requests retrieved successfully',
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    console.error('Error fetching registration requests:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch registration requests',
    });
  }
});

/**
 * GET /api/admin/users
 * Get all users with pagination
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const validation = paginationSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid pagination parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { page, limit } = validation.data;
    const offset = (page - 1) * limit;

    const users = await userRepo.findAll({ limit, offset });
    
    res.status(200).json({
      message: 'Users retrieved successfully',
      data: users,
      pagination: {
        page,
        limit,
        count: users.length,
      },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch users',
    });
  }
});

/**
 * GET /api/admin/users/:id
 * Get user details by ID
 */
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const user = await userRepo.findById(id);
    
    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
      return;
    }
    
    res.status(200).json({
      message: 'User retrieved successfully',
      data: user,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user',
    });
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Change user role
 */
router.put('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    // Validate request
    const validation = changeRoleSchema.safeParse({ role });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid role',
        details: validation.error.errors,
      });
      return;
    }

    // Change role
    const result = await userManagementService.changeUserRole({
      userId: id,
      newRole: role,
      adminId: req.user!.userId,
      adminName: req.user!.email,
      adminRole: req.user!.role,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
    });

    res.status(200).json({
      message: 'User role changed successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error changing user role:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('Cannot change your own role')) {
        res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to change user role',
    });
  }
});

/**
 * PUT /api/admin/users/:id/status
 * Activate or deactivate user account
 */
router.put('/users/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, reason } = req.body;
    
    // Validate request
    const validation = changeStatusSchema.safeParse({ isActive, reason });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.errors,
      });
      return;
    }

    // Activate or deactivate account
    let result;
    if (isActive) {
      result = await userManagementService.activateAccount({
        userId: id,
        adminId: req.user!.userId,
        adminName: req.user!.email,
        adminRole: req.user!.role,
        reason,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: randomBytes(16).toString('hex'),
      });
    } else {
      if (!reason) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Reason is required for deactivation',
        });
        return;
      }
      result = await userManagementService.deactivateAccount({
        userId: id,
        adminId: req.user!.userId,
        adminName: req.user!.email,
        adminRole: req.user!.role,
        reason,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: randomBytes(16).toString('hex'),
      });
    }

    res.status(200).json({
      message: `User account ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: result,
    });
  } catch (error) {
    console.error('Error changing user status:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('Cannot deactivate your own account')) {
        res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('already')) {
        res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to change user status',
    });
  }
});

/**
 * POST /api/admin/users/:id/password-reset
 * Initiate password reset for user
 */
router.post('/users/:id/password-reset', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate request
    const validation = passwordResetSchema.safeParse({ userId: id });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid user ID',
        details: validation.error.errors,
      });
      return;
    }

    // Check if user exists and is active
    const user = await userRepo.findById(id);
    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
      return;
    }

    if (!user.is_active) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot reset password for deactivated account',
      });
      return;
    }

    // Generate reset token (mock for MVP)
    const resetToken = randomBytes(32).toString('hex');
    
    // Create audit log entry
    await mockAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
      userRole: req.user!.role,
      actionType: 'password_reset_initiated',
      resource: 'user',
      resourceId: id,
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    // Mock email notification
    console.log(`[MOCK EMAIL] Password reset initiated for ${user.email}`);
    console.log(`[MOCK EMAIL] Reset token: ${resetToken}`);

    res.status(200).json({
      message: 'Password reset initiated successfully',
      data: {
        userId: id,
        email: user.email,
        resetTokenSent: true,
      },
    });
  } catch (error) {
    console.error('Error initiating password reset:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to initiate password reset',
    });
  }
});

/**
 * PUT /api/admin/users/:id/mfa
 * Manage MFA settings for user
 */
router.put('/users/:id/mfa', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled, method } = req.body;
    
    // Validate request
    const validation = mfaSchema.safeParse({ enabled, method });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid MFA settings',
        details: validation.error.errors,
      });
      return;
    }

    // Check if user exists
    const user = await userRepo.findById(id);
    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
      return;
    }

    // Update MFA settings
    const updateData: any = { mfa_enabled: enabled };
    if (enabled && method) {
      updateData.mfa_method = method;
      updateData.mfa_secret = randomBytes(32).toString('hex'); // Mock secret
    } else if (!enabled) {
      updateData.mfa_method = null;
      updateData.mfa_secret = null;
    }

    const updatedUser = await userRepo.update(id, updateData);

    // Create audit log entry
    await mockAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
      userRole: req.user!.role,
      actionType: enabled ? 'mfa_enabled' : 'mfa_disabled',
      resource: 'user',
      resourceId: id,
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    // Mock email notification
    console.log(`[MOCK EMAIL] MFA ${enabled ? 'enabled' : 'disabled'} for ${user.email}`);

    res.status(200).json({
      message: `MFA ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: updatedUser,
    });
  } catch (error) {
    console.error('Error managing MFA:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to manage MFA settings',
    });
  }
});

/**
 * GET /api/admin/users/:id/activity
 * Get user activity history
 */
router.get('/users/:id/activity', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate query parameters
    const validation = activityFilterSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { page, limit, startDate, endDate, actionType } = validation.data;

    // Check if user exists
    const user = await userRepo.findById(id);
    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
      return;
    }

    // Build filter
    const filter: any = { userId: id };
    if (startDate) filter.startDate = new Date(startDate);
    if (endDate) filter.endDate = new Date(endDate);
    if (actionType) filter.actionType = actionType;

    // Fetch activity logs
    const result = await auditRepo.search({
      ...filter,
      limit,
      page,
    });

    res.status(200).json({
      message: 'User activity retrieved successfully',
      data: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user activity',
    });
  }
});

export default router;
