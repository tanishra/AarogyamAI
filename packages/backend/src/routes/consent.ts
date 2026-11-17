import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware';
import { requireAdminOrDPO } from '../auth/authorizationMiddleware';
import consentRecordsRoutes from './consent/records';
import grievanceRoutes from './consent/grievances';
import dataAccessRequestRoutes from './consent/dataAccessRequests';
import complianceRoutes from './consent/compliance';

const router = Router();

// Apply authentication and authorization middleware to all routes (Administrator or DPO)
router.use(authenticate({}));
router.use(requireAdminOrDPO());

router.use(consentRecordsRoutes);
router.use(grievanceRoutes);
router.use(dataAccessRequestRoutes);
router.use(complianceRoutes);

export default router;
