import { Router } from 'express';
import medicalHistoryRoutes from './patientWorkflow/medicalHistory';
import encounterRoutes from './patientWorkflow/encounters';
import consentRoutes from './patientWorkflow/consent';
import questionnaireRoutes from './patientWorkflow/questionnaire';
import clinicalReasoningRoutes from './patientWorkflow/clinicalReasoning';

const router = Router();

router.use(medicalHistoryRoutes);
router.use(encounterRoutes);
router.use(consentRoutes);
router.use(questionnaireRoutes);
router.use(clinicalReasoningRoutes);

export default router;
