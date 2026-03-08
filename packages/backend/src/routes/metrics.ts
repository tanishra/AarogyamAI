import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/authMiddleware';
import { requireAdministrator } from '../auth/authorizationMiddleware';
import { AuditLogRepository } from '../repositories/AuditLogRepository';

const router = Router();

// Apply authentication and authorization middleware to all routes
router.use(authenticate({}));
router.use(requireAdministrator());

// Validation schemas
const periodSchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Generate mock time series data
 */
function generateMockTimeSeries(days: number): Array<{ date: string; value: number }> {
  const data = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split('T')[0],
      value: Math.floor(Math.random() * 50) + 20,
    });
  }
  
  return data;
}

/**
 * GET /api/metrics/consultations
 * Get consultation metrics (mock data for MVP)
 */
router.get('/consultations', async (req: Request, res: Response) => {
  try {
    const validation = periodSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { period } = validation.data;
    
    // Mock data for MVP
    const mockData = {
      total: 450,
      daily: generateMockTimeSeries(30),
      weekly: generateMockTimeSeries(12).map(d => ({ ...d, value: d.value * 7 })),
      monthly: generateMockTimeSeries(6).map(d => ({ ...d, value: d.value * 30 })),
      byDoctor: {
        'doctor-1': 150,
        'doctor-2': 180,
        'doctor-3': 120,
      },
    };

    res.status(200).json({
      message: 'Consultation metrics retrieved successfully',
      data: mockData,
      period,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching consultation metrics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch consultation metrics',
    });
  }
});

/**
 * GET /api/metrics/active-users
 * Get active user metrics (mock data for MVP)
 */
router.get('/active-users', async (_req: Request, res: Response) => {
  try {
    // Mock data for MVP
    const mockData = {
      byRole: {
        Patient: 45,
        Nurse: 12,
        Doctor: 8,
        Administrator: 2,
        DPO: 1,
      },
      totalRegistered: {
        Patient: 1250,
        Nurse: 45,
        Doctor: 28,
        Administrator: 5,
        DPO: 2,
      },
      growthTrend: generateMockTimeSeries(30).map(d => ({ ...d, value: Math.floor(d.value / 2) })),
      avgSessionDuration: {
        Patient: 1800, // 30 minutes in seconds
        Nurse: 3600, // 1 hour
        Doctor: 5400, // 1.5 hours
        Administrator: 7200, // 2 hours
        DPO: 4800, // 1.3 hours
      },
    };

    res.status(200).json({
      message: 'Active user metrics retrieved successfully',
      data: mockData,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching active user metrics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch active user metrics',
    });
  }
});

/**
 * GET /api/metrics/ai-acceptance
 * Get AI acceptance rate metrics (mock data for MVP)
 */
router.get('/ai-acceptance', async (req: Request, res: Response) => {
  try {
    const validation = periodSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { period } = validation.data;
    
    // Mock data for MVP
    const overallRate = 72.5;
    const mockData = {
      overallRate,
      daily: generateMockTimeSeries(30).map(d => ({ ...d, value: 65 + Math.random() * 20 })),
      weekly: generateMockTimeSeries(12).map(d => ({ ...d, value: 65 + Math.random() * 20 })),
      monthly: generateMockTimeSeries(6).map(d => ({ ...d, value: 65 + Math.random() * 20 })),
      byDoctor: {
        'doctor-1': 78.5,
        'doctor-2': 68.2,
        'doctor-3': 71.0,
      },
      warningThreshold: overallRate < 40,
    };

    res.status(200).json({
      message: 'AI acceptance rate metrics retrieved successfully',
      data: mockData,
      period,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching AI acceptance metrics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch AI acceptance metrics',
    });
  }
});

/**
 * GET /api/metrics/preparation-time
 * Get consultation preparation time metrics (mock data for MVP)
 */
router.get('/preparation-time', async (req: Request, res: Response) => {
  try {
    const validation = periodSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { period } = validation.data;
    
    // Mock data for MVP
    const mockData = {
      average: 420, // 7 minutes in seconds
      distribution: [
        { range: '0-5 min', count: 45 },
        { range: '5-10 min', count: 120 },
        { range: '10-15 min', count: 85 },
        { range: '15-20 min', count: 35 },
        { range: '20+ min', count: 15 },
      ],
      trend: generateMockTimeSeries(30).map(d => ({ ...d, value: 300 + Math.random() * 300 })),
      byDoctor: {
        'doctor-1': 380,
        'doctor-2': 450,
        'doctor-3': 430,
      },
    };

    res.status(200).json({
      message: 'Preparation time metrics retrieved successfully',
      data: mockData,
      period,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching preparation time metrics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch preparation time metrics',
    });
  }
});

/**
 * GET /api/metrics/questionnaire-completion
 * Get questionnaire completion metrics (mock data for MVP)
 */
router.get('/questionnaire-completion', async (req: Request, res: Response) => {
  try {
    const validation = periodSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { period } = validation.data;
    
    // Mock data for MVP
    const completionRate = 78.5;
    const mockData = {
      rate: completionRate,
      avgCompletionTime: 480, // 8 minutes in seconds
      abandonmentBySection: {
        'Personal Information': 5.2,
        'Medical History': 8.5,
        'Current Symptoms': 12.3,
        'Lifestyle': 15.8,
        'Additional Notes': 3.2,
      },
      trend: generateMockTimeSeries(30).map(d => ({ ...d, value: 70 + Math.random() * 15 })),
      warningThreshold: completionRate < 60,
    };

    res.status(200).json({
      message: 'Questionnaire completion metrics retrieved successfully',
      data: mockData,
      period,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching questionnaire completion metrics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch questionnaire completion metrics',
    });
  }
});

/**
 * GET /api/metrics/dashboard-summary
 * Get complete dashboard summary (mock data for MVP)
 */
router.get('/dashboard-summary', async (_req: Request, res: Response) => {
  try {
    // Mock data for MVP - combines all metrics
    const mockData = {
      consultations: {
        total: 450,
        daily: generateMockTimeSeries(7),
        weekly: generateMockTimeSeries(4).map(d => ({ ...d, value: d.value * 7 })),
        monthly: generateMockTimeSeries(3).map(d => ({ ...d, value: d.value * 30 })),
        byDoctor: {
          'doctor-1': 150,
          'doctor-2': 180,
          'doctor-3': 120,
        },
      },
      activeUsers: {
        byRole: {
          Patient: 45,
          Nurse: 12,
          Doctor: 8,
          Administrator: 2,
          DPO: 1,
        },
        totalRegistered: {
          Patient: 1250,
          Nurse: 45,
          Doctor: 28,
          Administrator: 5,
          DPO: 2,
        },
        growthTrend: generateMockTimeSeries(7).map(d => ({ ...d, value: Math.floor(d.value / 2) })),
        avgSessionDuration: {
          Patient: 1800,
          Nurse: 3600,
          Doctor: 5400,
          Administrator: 7200,
          DPO: 4800,
        },
      },
      aiAcceptance: {
        overallRate: 72.5,
        daily: generateMockTimeSeries(7).map(d => ({ ...d, value: 65 + Math.random() * 20 })),
        weekly: generateMockTimeSeries(4).map(d => ({ ...d, value: 65 + Math.random() * 20 })),
        monthly: generateMockTimeSeries(3).map(d => ({ ...d, value: 65 + Math.random() * 20 })),
        byDoctor: {
          'doctor-1': 78.5,
          'doctor-2': 68.2,
          'doctor-3': 71.0,
        },
        warningThreshold: false,
      },
      preparationTime: {
        average: 420,
        distribution: [
          { range: '0-5 min', count: 45 },
          { range: '5-10 min', count: 120 },
          { range: '10-15 min', count: 85 },
          { range: '15-20 min', count: 35 },
          { range: '20+ min', count: 15 },
        ],
        trend: generateMockTimeSeries(7).map(d => ({ ...d, value: 300 + Math.random() * 300 })),
        byDoctor: {
          'doctor-1': 380,
          'doctor-2': 450,
          'doctor-3': 430,
        },
      },
      questionnaireCompletion: {
        rate: 78.5,
        avgCompletionTime: 480,
        abandonmentBySection: {
          'Personal Information': 5.2,
          'Medical History': 8.5,
          'Current Symptoms': 12.3,
          'Lifestyle': 15.8,
          'Additional Notes': 3.2,
        },
        trend: generateMockTimeSeries(7).map(d => ({ ...d, value: 70 + Math.random() * 15 })),
        warningThreshold: false,
      },
      lastUpdated: new Date().toISOString(),
    };

    res.status(200).json({
      message: 'Dashboard summary retrieved successfully',
      data: mockData,
      cached: false,
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch dashboard summary',
    });
  }
});

export default router;
