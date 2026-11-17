import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware';
import { requireAdministrator } from '../auth/authorizationMiddleware';
import registrationRequestRoutes from './userManagement/registrationRequests';
import userRoutes from './userManagement/users';
import userAccessRoutes from './userManagement/userAccess';

const router = Router();

// Apply authentication and authorization middleware to all routes
router.use(authenticate({}));
router.use(requireAdministrator());

router.use(registrationRequestRoutes);
router.use(userRoutes);
router.use(userAccessRoutes);

export default router;
