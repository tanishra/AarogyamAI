import { Router } from 'express';
import signupRoutes from './auth/signup';
import loginRoutes from './auth/login';
import sessionRoutes from './auth/session';
import mfaRoutes from './auth/mfa';
import passwordResetRoutes from './auth/passwordReset';

const router = Router();

// Mount order preserves the original route-registration order
router.use(signupRoutes);
router.use(loginRoutes);
router.use(sessionRoutes);
router.use(mfaRoutes);
router.use(passwordResetRoutes);

export default router;
