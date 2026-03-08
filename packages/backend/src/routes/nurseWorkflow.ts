import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/authMiddleware';
import { query, getDatabasePool } from '../config/database';
import { chatRepository } from '../repositories/ChatRepository';
import { vitalsRepository } from '../repositories/VitalsRepository';
import { VitalsService } from '../services/VitalsService';
import { CriticalAlertingService } from '../services/CriticalAlertingService';

const router = Router();
const pool = getDatabasePool();
const vitalsService = new VitalsService(pool);
const alertingService = new CriticalAlertingService(pool);

// Validation schemas
const addVitalsSchema = z.object({
  patientId: z.string().uuid(),
  sessionId: z.string().uuid(),
  bloodPressureSystolic: z.number().min(50).max(250).optional(),
  bloodPressureDiastolic: z.number().min(30).max(150).optional(),
  heartRate: z.number().min(30).max(200).optional(),
  temperatureFahrenheit: z.number().min(95).max(106).optional(),
  oxygenSaturation: z.number().min(70).max(100).optional(),
  respiratoryRate: z.number().min(8).max(40).optional(),
  weightKg: z.number().min(1).max(300).optional(),
  heightCm: z.number().min(50).max(250).optional(),
  notes: z.string().max(500).optional(),
});

const acknowledgeAlertSchema = z.object({
  acknowledgedBy: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

/**
 * GET /api/nurse/queue
 * Get patients with completed chats waiting for vitals
 */
router.get('/queue', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access this endpoint',
      });
      return;
    }

    // Get patients in queue
    const patients = await query(
      `SELECT 
        pq.id as queue_id,
        pq.patient_id,
        pq.session_id,
        pq.status,
        pq.priority,
        pq.created_at,
        u.name as patient_name,
        u.email as patient_email,
        cs.completed_at as chat_completed_at,
        cs.emergency_detected
      FROM patient_queue pq
      JOIN users u ON pq.patient_id = u.id
      JOIN chat_sessions cs ON pq.session_id = cs.id
      WHERE pq.status IN ('chat_completed', 'vitals_added')
      ORDER BY 
        CASE pq.priority 
          WHEN 'emergency' THEN 1 
          WHEN 'urgent' THEN 2 
          WHEN 'routine' THEN 3 
        END,
        pq.created_at ASC`
    );

    res.status(200).json({
      message: 'Nurse queue retrieved',
      data: {
        patients,
        count: patients.length,
      },
    });
  } catch (error) {
    console.error('Error getting nurse queue:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get nurse queue',
    });
  }
});

/**
 * GET /api/nurse/patient/:patientId/summary
 * Get structured chat summary for patient
 */
router.get('/patient/:patientId/summary', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { sessionId } = req.query;

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access this endpoint',
      });
      return;
    }

    if (!sessionId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'sessionId query parameter is required',
      });
      return;
    }

    // Get chat session
    const session = await chatRepository.getSession(sessionId as string);
    
    if (!session || session.patientId !== patientId) {
      console.log('[Nurse Summary] Session not found or patient mismatch');
      console.log('[Nurse Summary] Session:', session);
      console.log('[Nurse Summary] Expected patientId:', patientId);
      console.log('[Nurse Summary] Session patientId:', session?.patientId);
      res.status(404).json({
        error: 'Not Found',
        message: 'Chat session not found for this patient',
      });
      return;
    }

    // Get patient summary
    const summary = await chatRepository.getSummary(sessionId as string);
    if (!summary) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Patient summary not found',
      });
      return;
    }

    // Get patient info
    const patientInfo = await query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [patientId]
    );

    res.status(200).json({
      message: 'Patient summary retrieved',
      data: {
        patient: patientInfo[0],
        session,
        summary,
      },
    });
  } catch (error) {
    console.error('Error getting patient summary:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get patient summary',
    });
  }
});

/**
 * POST /api/nurse/patient/:patientId/vitals
 * Add vitals for patient
 */
router.post('/patient/:patientId/vitals', authenticate({}), async (req: Request, res: Response) => {
  try {
    console.log('[Add Vitals] ===== START =====');
    console.log('[Add Vitals] Patient ID:', req.params.patientId);
    console.log('[Add Vitals] Request body:', JSON.stringify(req.body, null, 2));
    console.log('[Add Vitals] User:', req.user?.userId, req.user?.role);
    
    const { patientId } = req.params;
    const validation = addVitalsSchema.safeParse(req.body);

    if (!validation.success) {
      console.log('[Add Vitals] Validation failed:', validation.error.errors);
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid vitals data',
        details: validation.error.errors,
      });
      return;
    }

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can add vitals',
      });
      return;
    }

    const vitalsData = validation.data;

    // Verify patient and session exist
    if (vitalsData.patientId !== patientId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Patient ID mismatch',
      });
      return;
    }

    const session = await chatRepository.getSession(vitalsData.sessionId);
    if (!session || session.patientId !== patientId) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Chat session not found',
      });
      return;
    }

    // Add vitals using VitalsService
    console.log('[Add Vitals] Submitting vitals to VitalsService...');
    const result = await vitalsService.submitVitals({
      patientId: vitalsData.patientId,
      encounterId: vitalsData.sessionId,
      recordedBy: req.user!.userId,
      vitals: {
        systolicBp: vitalsData.bloodPressureSystolic,
        diastolicBp: vitalsData.bloodPressureDiastolic,
        heartRate: vitalsData.heartRate,
        respiratoryRate: vitalsData.respiratoryRate,
        temperature: vitalsData.temperatureFahrenheit,
        temperatureUnit: 'F',
        oxygenSaturation: vitalsData.oxygenSaturation,
        height: vitalsData.heightCm,
        heightUnit: 'cm',
        weight: vitalsData.weightKg,
        weightUnit: 'kg',
      },
    });
    console.log('[Add Vitals] Vitals submitted successfully, ID:', result.vitalSignId);

    // Check for critical alerts
    const alerts = await alertingService.checkVitals({
      vitalSignId: result.vitalSignId,
      patientId: vitalsData.patientId,
      encounterId: vitalsData.sessionId,
      systolicBp: vitalsData.bloodPressureSystolic,
      diastolicBp: vitalsData.bloodPressureDiastolic,
      heartRate: vitalsData.heartRate,
      respiratoryRate: vitalsData.respiratoryRate,
      temperature: vitalsData.temperatureFahrenheit,
      temperatureUnit: 'F',
      oxygenSaturation: vitalsData.oxygenSaturation,
    });

    // Update queue status
    await query(
      `UPDATE patient_queue 
       SET status = 'vitals_added', assigned_nurse = $1
       WHERE patient_id = $2 AND session_id = $3`,
      [req.user!.userId, patientId, vitalsData.sessionId]
    );

    res.status(201).json({
      message: 'Vitals added successfully',
      data: {
        vitalSignId: result.vitalSignId,
        alerts: alerts.length > 0 ? alerts : undefined,
        warnings: result.warnings,
      },
    });
  } catch (error) {
    console.error('Error adding vitals:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add vitals',
    });
  }
});

/**
 * POST /api/nurse/patient/:patientId/ready
 * Mark patient ready for doctor review
 */
router.post('/patient/:patientId/ready', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { sessionId } = req.body;

    console.log('[Mark Ready] Request received:', { patientId, sessionId, body: req.body });

    if (!sessionId) {
      console.log('[Mark Ready] Missing sessionId in request body');
      res.status(400).json({
        error: 'Bad Request',
        message: 'sessionId is required',
      });
      return;
    }

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      console.log('[Mark Ready] Forbidden - user role:', req.user!.role);
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can mark patients ready',
      });
      return;
    }

    // Check if vitals have been added (optional for MVP - just log warning)
    const vitals = await vitalsRepository.getBySession(sessionId);
    if (!vitals) {
      console.log('[Mark Ready] Warning: No vitals found for session, but allowing anyway for MVP');
    } else {
      console.log('[Mark Ready] Vitals found for session');
    }

    // Update queue status and assign nurse
    console.log('[Mark Ready] Updating queue status to ready_for_doctor and assigning nurse');
    const updateResult = await query(
      `UPDATE patient_queue 
       SET status = 'ready_for_doctor', assigned_nurse = $3
       WHERE patient_id = $1 AND session_id = $2
       RETURNING *`,
      [patientId, sessionId, req.user!.userId]
    );

    console.log('[Mark Ready] Update result:', updateResult);

    if (updateResult.length === 0) {
      console.log('[Mark Ready] No queue entry found for patient/session');
      res.status(404).json({
        error: 'Not Found',
        message: 'Patient not found in queue',
      });
      return;
    }

    res.status(200).json({
      message: 'Patient marked ready for doctor review',
      data: updateResult[0],
    });
  } catch (error) {
    console.error('[Mark Ready] Error marking patient ready:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to mark patient ready',
    });
  }
});

/**
 * GET /api/nurse/patient/:patientId/vitals-history
 * Get recent vitals history for a patient
 */
router.get('/patient/:patientId/vitals-history', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access vitals history',
      });
      return;
    }

    const vitalsHistory = await vitalsRepository.getByPatient(patientId, 20);

    res.status(200).json({
      message: 'Vitals history retrieved',
      data: vitalsHistory,
      count: vitalsHistory.length,
    });
  } catch (error) {
    console.error('Error getting vitals history:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get vitals history',
    });
  }
});

/**
 * GET /api/nurse/patient/:patientId/history
 * Get patient summary and recent chat sessions for nurse review
 */
router.get('/patient/:patientId/history', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access patient history',
      });
      return;
    }

    const patientRows = await query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [patientId]
    );

    if (patientRows.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Patient not found',
      });
      return;
    }

    const summaryRows = await query(
      `SELECT *
       FROM patient_summaries
       WHERE patient_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [patientId]
    );

    const recentSessions = await chatRepository.getPatientSessions(patientId, 10);

    res.status(200).json({
      message: 'Patient history retrieved',
      data: {
        patient: patientRows[0],
        summary: summaryRows[0] || null,
        recentSessions,
      },
    });
  } catch (error) {
    console.error('Error getting nurse patient history:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get patient history',
    });
  }
});

/**
 * GET /api/nurse/alerts/active
 * Get all active critical alerts
 */
router.get('/alerts/active', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access alerts',
      });
      return;
    }

    const alerts = await query(
      `SELECT 
        ca.*,
        u.name as patient_name,
        u.email as patient_email
      FROM critical_alerts ca
      JOIN users u ON ca.patient_id = u.id
      WHERE ca.status = 'active'
      ORDER BY 
        CASE ca.severity 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
        END,
        ca.created_at DESC`
    );

    res.status(200).json({
      message: 'Active alerts retrieved',
      data: alerts,
      count: alerts.length,
    });
  } catch (error) {
    console.error('Error getting active alerts:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get active alerts',
    });
  }
});

/**
 * POST /api/nurse/alerts/:alertId/acknowledge
 * Acknowledge a critical alert
 */
router.post('/alerts/:alertId/acknowledge', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const validation = acknowledgeAlertSchema.safeParse({
      acknowledgedBy: req.user!.userId,
      notes: req.body.notes,
    });

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid acknowledgment data',
        details: validation.error.errors,
      });
      return;
    }

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can acknowledge alerts',
      });
      return;
    }

    await alertingService.acknowledgeAlert(
      alertId,
      validation.data.acknowledgedBy
    );

    res.status(200).json({
      message: 'Alert acknowledged successfully',
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to acknowledge alert',
    });
  }
});

export default router;
