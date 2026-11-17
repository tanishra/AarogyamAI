import { Router } from 'express';
import queueRoutes from './doctorWorkflow/queue';
import patientRoutes from './doctorWorkflow/patient';
import considerationRoutes from './doctorWorkflow/considerations';
import reasoningRoutes from './doctorWorkflow/reasoning';
import differentialRoutes from './doctorWorkflow/differentials';

const router = Router();

router.use(queueRoutes);
router.use(patientRoutes);
router.use(considerationRoutes);
router.use(reasoningRoutes);
router.use(differentialRoutes);

export default router;
