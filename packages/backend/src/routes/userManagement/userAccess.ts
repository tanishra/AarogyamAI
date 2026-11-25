import { Router } from 'express';
import userRoleRoutes from './userRole';
import userStatusRoutes from './userStatus';
import userPasswordResetRoutes from './userPasswordReset';
import userMfaRoutes from './userMfa';

const router = Router();

router.use(userRoleRoutes);
router.use(userStatusRoutes);
router.use(userPasswordResetRoutes);
router.use(userMfaRoutes);

export default router;
