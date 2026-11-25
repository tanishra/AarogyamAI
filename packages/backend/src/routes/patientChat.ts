import { Router } from 'express';
import sessionRoutes from './patientChat/sessions';
import messageRoutes from './patientChat/messages';
import completionRoutes from './patientChat/completion';

const router = Router();

router.use(sessionRoutes);
router.use(messageRoutes);
router.use(completionRoutes);

export default router;
