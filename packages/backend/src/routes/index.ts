import { Router } from 'express';
import authRoutes from './auth';
import userManagementRoutes from './userManagement';
import metricsRoutes from './metrics';
import auditRoutes from './audit';
import consentRoutes from './consent';
import patientChatRoutes from './patientChat';
import patientWorkflowRoutes from './patientWorkflow';
import nurseWorkflowRoutes from './nurseWorkflow';
import doctorWorkflowRoutes from './doctorWorkflow';
import profileRoutes from './profile';
import reportsRoutes from './reports';
import awsTestRoutes from './awsTest';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/admin', userManagementRoutes);
router.use('/metrics', metricsRoutes);
router.use('/audit', auditRoutes);
router.use('/patient/chat', patientChatRoutes);
router.use('/patient', patientWorkflowRoutes);
router.use('/nurse', nurseWorkflowRoutes);
router.use('/doctor', doctorWorkflowRoutes);
router.use('/profile', profileRoutes);
router.use('/reports', reportsRoutes);
router.use('/aws-test', awsTestRoutes);
router.use('/', consentRoutes); // Mount at root since consent routes define their own paths

export default router;
