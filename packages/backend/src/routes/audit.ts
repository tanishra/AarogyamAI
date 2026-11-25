import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware';
import { requireAdminOrDPO } from '../auth/authorizationMiddleware';
import logRoutes from './audit/logs';
import accessPatternRoutes from './audit/accessPatterns';
import anomalyRoutes from './audit/anomalies';
import verifyRoutes from './audit/verify';
import exportRoutes from './audit/export';

const router = Router();

// Apply authentication and authorization middleware to all routes
router.use(authenticate({}));
router.use(requireAdminOrDPO());

router.use(logRoutes);
router.use(accessPatternRoutes);
router.use(anomalyRoutes);
router.use(verifyRoutes);
router.use(exportRoutes);

export default router;
