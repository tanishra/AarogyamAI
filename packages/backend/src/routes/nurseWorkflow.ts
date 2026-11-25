import { Router } from 'express';
import queueRoutes from './nurseWorkflow/queue';
import patientRoutes from './nurseWorkflow/patient';
import vitalsRoutes from './nurseWorkflow/vitals';
import readyRoutes from './nurseWorkflow/ready';
import alertRoutes from './nurseWorkflow/alerts';

const router = Router();

router.use(queueRoutes);
router.use(patientRoutes);
router.use(vitalsRoutes);
router.use(readyRoutes);
router.use(alertRoutes);

export default router;
