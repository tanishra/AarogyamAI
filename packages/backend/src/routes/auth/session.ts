import { Router } from 'express';
import logoutRoutes from './logout';
import refreshRoutes from './refresh';
import sessionListRoutes from './sessionList';

const router = Router();

router.use(logoutRoutes);
router.use(refreshRoutes);
router.use(sessionListRoutes);

export default router;
