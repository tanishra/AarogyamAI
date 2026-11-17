import { Router, Request, Response } from 'express';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { logger } from '../../lib/logger';

const router = Router();

/**
 * GET /api/doctor/queue
 * Get patients ready for doctor review
 */
router.get('/queue', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can access this endpoint',
      });
      return;
    }

    // Get patients ready for review
    const patients = await workflowRepository.getDoctorQueue();

    res.status(200).json({
      message: 'Doctor queue retrieved',
      data: {
        patients,
        count: patients.length,
      },
    });
  } catch (error) {
    logger.error('Error getting doctor queue:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get doctor queue',
    });
  }
});

/**
 * GET /api/doctor/completed-patients
 * Get doctor's completed patients
 */
router.get('/completed-patients', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can access this endpoint',
      });
      return;
    }

    const { limit = '20' } = req.query;

    // Get completed patients for this doctor
    const completedPatients = await workflowRepository.getCompletedPatientsForDoctor(
      req.user!.userId,
      parseInt(limit as string)
    );

    const patients = completedPatients.map((raw: any) => ({
      patientId: raw.patient_id,
      patientName: raw.patient_name,
      patientEmail: raw.patient_email,
      lastSessionId: raw.last_session_id,
      lastVisit: raw.last_visit,
      lastComplaint: raw.last_complaint,
      lastPlan: raw.last_plan,
      reasoningStatus: raw.reasoning_status,
      lastPriority: raw.last_priority,
    }));

    res.status(200).json({
      message: 'Completed patients retrieved',
      data: {
        patients,
        count: patients.length,
      },
    });
  } catch (error) {
    logger.error('Error getting completed patients:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get completed patients',
    });
  }
});

export default router;
