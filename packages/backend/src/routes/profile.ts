import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/authMiddleware';
import { query } from '../config/database';

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

let profileTableReady = false;

async function ensureProfileTable(): Promise<void> {
  if (profileTableReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      phone VARCHAR(30),
      date_of_birth DATE,
      gender VARCHAR(30),
      address_line_1 VARCHAR(255),
      address_line_2 VARCHAR(255),
      city VARCHAR(120),
      state VARCHAR(120),
      country VARCHAR(120),
      postal_code VARCHAR(20),
      organization VARCHAR(180),
      department VARCHAR(180),
      specialization VARCHAR(180),
      license_number VARCHAR(120),
      emergency_contact_name VARCHAR(120),
      emergency_contact_phone VARCHAR(30),
      preferred_language VARCHAR(60),
      timezone VARCHAR(80),
      bio TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_user_profiles_org ON user_profiles(organization)');
  await query('CREATE INDEX IF NOT EXISTS idx_user_profiles_department ON user_profiles(department)');

  profileTableReady = true;
}

router.get('/me', authenticate({}), async (req: Request, res: Response) => {
  try {
    await ensureProfileTable();

    const userId = req.user!.userId;
    const rows = await query<any>(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.is_active,
        u.created_at,
        p.phone,
        p.date_of_birth,
        p.gender,
        p.address_line_1,
        p.address_line_2,
        p.city,
        p.state,
        p.country,
        p.postal_code,
        p.organization,
        p.department,
        p.specialization,
        p.license_number,
        p.emergency_contact_name,
        p.emergency_contact_phone,
        p.preferred_language,
        p.timezone,
        p.bio,
        p.updated_at as profile_updated_at
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1`,
      [userId]
    );

    const row = rows[0];
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
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch profile' });
  }
});

router.put('/me', authenticate({}), async (req: Request, res: Response) => {
  try {
    await ensureProfileTable();

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
      await query('UPDATE users SET name = $1 WHERE id = $2', [payload.name.trim(), userId]);
    }

    await query(
      `INSERT INTO user_profiles (
        user_id, phone, date_of_birth, gender, address_line_1, address_line_2, city, state, country, postal_code,
        organization, department, specialization, license_number, emergency_contact_name, emergency_contact_phone,
        preferred_language, timezone, bio, updated_at
      ) VALUES (
        $1, $2, NULLIF($3, '')::date, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        phone = EXCLUDED.phone,
        date_of_birth = EXCLUDED.date_of_birth,
        gender = EXCLUDED.gender,
        address_line_1 = EXCLUDED.address_line_1,
        address_line_2 = EXCLUDED.address_line_2,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        country = EXCLUDED.country,
        postal_code = EXCLUDED.postal_code,
        organization = EXCLUDED.organization,
        department = EXCLUDED.department,
        specialization = EXCLUDED.specialization,
        license_number = EXCLUDED.license_number,
        emergency_contact_name = EXCLUDED.emergency_contact_name,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone,
        preferred_language = EXCLUDED.preferred_language,
        timezone = EXCLUDED.timezone,
        bio = EXCLUDED.bio,
        updated_at = NOW()`,
      [
        userId,
        payload.phone || null,
        payload.dateOfBirth || null,
        payload.gender || null,
        payload.addressLine1 || null,
        payload.addressLine2 || null,
        payload.city || null,
        payload.state || null,
        payload.country || null,
        payload.postalCode || null,
        payload.organization || null,
        payload.department || null,
        payload.specialization || null,
        payload.licenseNumber || null,
        payload.emergencyContactName || null,
        payload.emergencyContactPhone || null,
        payload.preferredLanguage || null,
        payload.timezone || null,
        payload.bio || null,
      ]
    );

    res.status(200).json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update profile' });
  }
});

router.get('/me/activity', authenticate({}), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    if (role === 'Patient') {
      const [sessions, vitalsCount, consentCount] = await Promise.all([
        query<any>(
          `SELECT id, status, started_at, completed_at, emergency_detected
           FROM chat_sessions
           WHERE patient_id = $1
           ORDER BY started_at DESC
           LIMIT 10`,
          [userId]
        ),
        query<{ count: string }>('SELECT COUNT(*) as count FROM vitals WHERE patient_id = $1', [userId]),
        query<{ count: string }>(
          "SELECT COUNT(*) as count FROM consent_records WHERE patient_id = $1 AND status = 'active'",
          [userId]
        ),
      ]);

      res.status(200).json({
        message: 'Activity retrieved',
        data: {
          role,
          stats: {
            sessions: sessions.length,
            vitalsRecords: Number(vitalsCount[0]?.count || 0),
            activeConsents: Number(consentCount[0]?.count || 0),
          },
          recent: sessions,
        },
      });
      return;
    }

    if (role === 'Nurse') {
      const [queueStats, recentHandled] = await Promise.all([
        query<any>(
          `SELECT
             COUNT(*) FILTER (WHERE assigned_nurse = $1) as assigned_count,
             COUNT(*) FILTER (WHERE assigned_nurse = $1 AND status = 'ready_for_doctor') as handed_off_count,
             COUNT(*) FILTER (WHERE status IN ('chat_completed', 'vitals_added')) as open_queue_count
           FROM patient_queue`,
          [userId]
        ),
        query<any>(
          `SELECT
             pq.patient_id,
             pq.session_id,
             pq.status,
             pq.priority,
             pq.updated_at,
             u.name as patient_name
           FROM patient_queue pq
           JOIN users u ON u.id = pq.patient_id
           WHERE pq.assigned_nurse = $1
           ORDER BY pq.updated_at DESC
           LIMIT 10`,
          [userId]
        ),
      ]);

      res.status(200).json({
        message: 'Activity retrieved',
        data: {
          role,
          stats: {
            assignedCount: Number(queueStats[0]?.assigned_count || 0),
            handedOffCount: Number(queueStats[0]?.handed_off_count || 0),
            openQueueCount: Number(queueStats[0]?.open_queue_count || 0),
          },
          recent: recentHandled,
        },
      });
      return;
    }

    if (role === 'Doctor') {
      const [reviewStats, recentReasoning] = await Promise.all([
        query<any>(
          `SELECT
             COUNT(*) FILTER (WHERE assigned_doctor = $1) as assigned_count,
             COUNT(*) FILTER (WHERE assigned_doctor = $1 AND status = 'under_review') as under_review_count,
             COUNT(*) FILTER (WHERE assigned_doctor = $1 AND status = 'completed') as completed_count
           FROM patient_queue`,
          [userId]
        ),
        query<any>(
          `SELECT
             cr.id,
             cr.patient_id,
             cr.status,
             cr.updated_at,
             u.name as patient_name
           FROM clinical_reasoning cr
           JOIN users u ON u.id = cr.patient_id
           WHERE cr.doctor_id = $1
           ORDER BY cr.updated_at DESC
           LIMIT 10`,
          [userId]
        ),
      ]);

      res.status(200).json({
        message: 'Activity retrieved',
        data: {
          role,
          stats: {
            assignedCount: Number(reviewStats[0]?.assigned_count || 0),
            underReviewCount: Number(reviewStats[0]?.under_review_count || 0),
            completedCount: Number(reviewStats[0]?.completed_count || 0),
          },
          recent: recentReasoning,
        },
      });
      return;
    }

    res.status(200).json({ message: 'Activity retrieved', data: { role, stats: {}, recent: [] } });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch activity' });
  }
});

export default router;
