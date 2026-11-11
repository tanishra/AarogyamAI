import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/authMiddleware';
import { profileRepository } from '../repositories/ProfileRepository';
import { logger } from '../lib/logger';

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().max(30).optional(),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  postalCode: z.string().max(20).optional(),
  organization: z.string().max(180).optional(),
  department: z.string().max(180).optional(),
  specialization: z.string().max(180).optional(),
  licenseNumber: z.string().max(120).optional(),
  emergencyContactName: z.string().max(120).optional(),
  emergencyContactPhone: z.string().max(30).optional(),
  preferredLanguage: z.string().max(60).optional(),
  timezone: z.string().max(80).optional(),
  bio: z.string().max(2000).optional(),
});

router.get('/me', authenticate({}), async (req: Request, res: Response) => {
  try {
    await profileRepository.ensureProfileTable();

    const userId = req.user!.userId;
    const row = await profileRepository.getProfileWithUser(userId);
    if (!row) {
      res.status(404).json({ error: 'Not Found', message: 'User not found' });
      return;
    }

    res.status(200).json({
      message: 'Profile retrieved',
      data: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        isActive: row.is_active,
        createdAt: row.created_at,
        profile: {
          phone: row.phone || '',
          dateOfBirth: row.date_of_birth || null,
          gender: row.gender || '',
          addressLine1: row.address_line_1 || '',
          addressLine2: row.address_line_2 || '',
          city: row.city || '',
          state: row.state || '',
          country: row.country || '',
          postalCode: row.postal_code || '',
          organization: row.organization || '',
          department: row.department || '',
          specialization: row.specialization || '',
          licenseNumber: row.license_number || '',
          emergencyContactName: row.emergency_contact_name || '',
          emergencyContactPhone: row.emergency_contact_phone || '',
          preferredLanguage: row.preferred_language || '',
          timezone: row.timezone || '',
          bio: row.bio || '',
          updatedAt: row.profile_updated_at || null,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching profile:', { error });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch profile' });
  }
});

router.put('/me', authenticate({}), async (req: Request, res: Response) => {
  try {
    await profileRepository.ensureProfileTable();

    const validation = updateProfileSchema.safeParse(req.body || {});
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid profile payload',
        details: validation.error.errors,
      });
      return;
    }

    const userId = req.user!.userId;
    const payload = validation.data;

    if (payload.name) {
      await profileRepository.updateUserName(userId, payload.name);
    }

    await profileRepository.upsertProfile(userId, payload);

    res.status(200).json({ message: 'Profile updated successfully' });
  } catch (error) {
    logger.error('Error updating profile:', { error });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update profile' });
  }
});

router.get('/me/activity', authenticate({}), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    if (role === 'Patient') {
      const [sessions, vitalsRecords, activeConsents] = await Promise.all([
        profileRepository.getPatientSessions(userId),
        profileRepository.getPatientVitalsCount(userId),
        profileRepository.getPatientConsentCount(userId),
      ]);

      res.status(200).json({
        message: 'Activity retrieved',
        data: {
          role,
          stats: {
            sessions: sessions.length,
            vitalsRecords,
            activeConsents,
          },
          recent: sessions,
        },
      });
      return;
    }

    if (role === 'Nurse') {
      const [queueStats, recentHandled] = await Promise.all([
        profileRepository.getNurseQueueStats(userId),
        profileRepository.getNurseRecentHandled(userId),
      ]);

      res.status(200).json({
        message: 'Activity retrieved',
        data: {
          role,
          stats: {
            assignedCount: Number(queueStats.assigned_count || 0),
            handedOffCount: Number(queueStats.handed_off_count || 0),
            openQueueCount: Number(queueStats.open_queue_count || 0),
          },
          recent: recentHandled,
        },
      });
      return;
    }

    if (role === 'Doctor') {
      const [reviewStats, recentReasoning] = await Promise.all([
        profileRepository.getDoctorReviewStats(userId),
        profileRepository.getDoctorRecentReasoning(userId),
      ]);

      res.status(200).json({
        message: 'Activity retrieved',
        data: {
          role,
          stats: {
            assignedCount: Number(reviewStats.assigned_count || 0),
            underReviewCount: Number(reviewStats.under_review_count || 0),
            completedCount: Number(reviewStats.completed_count || 0),
          },
          recent: recentReasoning,
        },
      });
      return;
    }

    res.status(200).json({ message: 'Activity retrieved', data: { role, stats: {}, recent: [] } });
  } catch (error) {
    logger.error('Error fetching activity:', { error });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch activity' });
  }
});

export default router;
