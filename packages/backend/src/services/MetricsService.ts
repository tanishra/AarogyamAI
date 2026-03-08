import { Pool } from 'pg';
import { getCacheService, CacheService } from './CacheService';

interface ConsultationMetrics {
  totalConsultations: number;
  period: string;
  byDoctor: Array<{ doctorId: number; doctorName: string; count: number }>;
  lastUpdated: string;
}

interface ActiveUserMetrics {
  activeUsers: { [role: string]: number };
  totalRegistered: { [role: string]: number };
  averageSessionDuration: { [role: string]: number };
  lastUpdated: string;
}

interface AIAcceptanceMetrics {
  acceptanceRate: number;
  totalRecommendations: number;
  accepted: number;
  rejected: number;
  modified: number;
  byDoctor?: Array<{ doctorId: number; doctorName: string; rate: number }>;
  lastUpdated: string;
}

interface PreparationTimeMetrics {
  averageTime: number;
  distribution: Array<{ range: string; count: number }>;
  byDoctor?: Array<{ doctorId: number; doctorName: string; avgTime: number }>;
  lastUpdated: string;
}

interface QuestionnaireMetrics {
  completionRate: number;
  totalStarted: number;
  totalCompleted: number;
  abandonmentBySection: Array<{ section: string; rate: number }>;
  lastUpdated: string;
}

interface DashboardSummary {
  consultations: ConsultationMetrics;
  activeUsers: ActiveUserMetrics;
  aiAcceptance: AIAcceptanceMetrics;
  preparationTime: PreparationTimeMetrics;
  questionnaireCompletion: QuestionnaireMetrics;
  warnings: string[];
}

export class MetricsService {
  private pool: Pool;
  private cache: CacheService;

  constructor(pool: Pool) {
    this.pool = pool;
    this.cache = getCacheService();
  }

  async calculateConsultationMetrics(period: 'daily' | 'weekly' | 'monthly'): Promise<ConsultationMetrics> {
    const cacheKey = CacheService.keys.consultations(period);
    const cached = await this.cache.get<ConsultationMetrics>(cacheKey);
    if (cached) return cached;

    const dateFilter = this.getDateFilter(period);
    
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        u.id as doctor_id,
        u.name as doctor_name,
        COUNT(*) as count
      FROM consultations c
      LEFT JOIN users u ON c.doctor_id = u.id
      WHERE c.created_at >= $1
      GROUP BY u.id, u.name
      ORDER BY count DESC
    `, [dateFilter]);

    const totalConsultations = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const byDoctor = result.rows.map(row => ({
      doctorId: row.doctor_id,
      doctorName: row.doctor_name || 'Unknown',
      count: parseInt(row.count),
    }));

    const metrics: ConsultationMetrics = {
      totalConsultations,
      period,
      byDoctor,
      lastUpdated: new Date().toISOString(),
    };

    await this.cache.set(cacheKey, metrics, 300); // 5 minutes TTL
    return metrics;
  }

  async getActiveUsers(): Promise<ActiveUserMetrics> {
    const cacheKey = CacheService.keys.activeUsers();
    const cached = await this.cache.get<ActiveUserMetrics>(cacheKey);
    if (cached) return cached;

    // Get total registered users by role
    const registeredResult = await this.pool.query(`
      SELECT role, COUNT(*) as count
      FROM users
      WHERE is_active = true
      GROUP BY role
    `);

    const totalRegistered: { [role: string]: number } = {};
    registeredResult.rows.forEach(row => {
      totalRegistered[row.role] = parseInt(row.count);
    });

    // Mock active users (in production, query from Redis sessions)
    const activeUsers: { [role: string]: number } = {
      Patient: Math.floor(totalRegistered.Patient * 0.1) || 0,
      Doctor: Math.floor(totalRegistered.Doctor * 0.3) || 0,
      Nurse: Math.floor(totalRegistered.Nurse * 0.2) || 0,
      Administrator: Math.floor(totalRegistered.Administrator * 0.5) || 0,
      DPO: Math.floor(totalRegistered.DPO * 0.5) || 0,
    };

    // Mock average session duration
    const averageSessionDuration: { [role: string]: number } = {
      Patient: 1800, // 30 minutes
      Doctor: 3600, // 1 hour
      Nurse: 2400, // 40 minutes
      Administrator: 7200, // 2 hours
      DPO: 5400, // 1.5 hours
    };

    const metrics: ActiveUserMetrics = {
      activeUsers,
      totalRegistered,
      averageSessionDuration,
      lastUpdated: new Date().toISOString(),
    };

    await this.cache.set(cacheKey, metrics, 60); // 1 minute TTL
    return metrics;
  }

  async calculateAIAcceptanceRate(period: 'daily' | 'weekly' | 'monthly', doctorId?: number): Promise<AIAcceptanceMetrics> {
    const cacheKey = CacheService.keys.aiAcceptance(period, doctorId);
    const cached = await this.cache.get<AIAcceptanceMetrics>(cacheKey);
    if (cached) return cached;

    const dateFilter = this.getDateFilter(period);
    
    const query = doctorId
      ? `SELECT status, COUNT(*) as count FROM ai_recommendations WHERE created_at >= $1 AND doctor_id = $2 GROUP BY status`
      : `SELECT status, COUNT(*) as count FROM ai_recommendations WHERE created_at >= $1 GROUP BY status`;
    
    const params = doctorId ? [dateFilter, doctorId] : [dateFilter];
    const result = await this.pool.query(query, params);

    let accepted = 0, rejected = 0, modified = 0;
    result.rows.forEach(row => {
      if (row.status === 'accepted') accepted = parseInt(row.count);
      if (row.status === 'rejected') rejected = parseInt(row.count);
      if (row.status === 'modified') modified = parseInt(row.count);
    });

    const totalRecommendations = accepted + rejected + modified;
    const acceptanceRate = totalRecommendations > 0 ? (accepted / totalRecommendations) * 100 : 0;

    const metrics: AIAcceptanceMetrics = {
      acceptanceRate: Math.round(acceptanceRate * 100) / 100,
      totalRecommendations,
      accepted,
      rejected,
      modified,
      lastUpdated: new Date().toISOString(),
    };

    await this.cache.set(cacheKey, metrics, 300); // 5 minutes TTL
    return metrics;
  }

  async calculatePreparationTime(period: 'daily' | 'weekly' | 'monthly', doctorId?: number): Promise<PreparationTimeMetrics> {
    const cacheKey = CacheService.keys.preparationTime(period, doctorId);
    const cached = await this.cache.get<PreparationTimeMetrics>(cacheKey);
    if (cached) return cached;

    // Mock data for MVP (in production, calculate from actual timestamps)
    const averageTime = 900; // 15 minutes in seconds
    const distribution = [
      { range: '0-5 min', count: 10 },
      { range: '5-10 min', count: 25 },
      { range: '10-15 min', count: 40 },
      { range: '15-20 min', count: 20 },
      { range: '20+ min', count: 5 },
    ];

    const metrics: PreparationTimeMetrics = {
      averageTime,
      distribution,
      lastUpdated: new Date().toISOString(),
    };

    await this.cache.set(cacheKey, metrics, 300); // 5 minutes TTL
    return metrics;
  }

  async calculateQuestionnaireCompletion(period: 'daily' | 'weekly' | 'monthly'): Promise<QuestionnaireMetrics> {
    const cacheKey = CacheService.keys.questionnaireCompletion(period);
    const cached = await this.cache.get<QuestionnaireMetrics>(cacheKey);
    if (cached) return cached;

    // Mock data for MVP (in production, query from questionnaire_responses table)
    const totalStarted = 100;
    const totalCompleted = 75;
    const completionRate = (totalCompleted / totalStarted) * 100;

    const abandonmentBySection = [
      { section: 'Personal Info', rate: 5 },
      { section: 'Medical History', rate: 10 },
      { section: 'Current Symptoms', rate: 8 },
      { section: 'Medications', rate: 2 },
    ];

    const metrics: QuestionnaireMetrics = {
      completionRate: Math.round(completionRate * 100) / 100,
      totalStarted,
      totalCompleted,
      abandonmentBySection,
      lastUpdated: new Date().toISOString(),
    };

    await this.cache.set(cacheKey, metrics, 300); // 5 minutes TTL
    return metrics;
  }

  async getDashboardSummary(): Promise<DashboardSummary> {
    const cacheKey = CacheService.keys.dashboardSummary();
    const cached = await this.cache.get<DashboardSummary>(cacheKey);
    if (cached) return cached;

    const [consultations, activeUsers, aiAcceptance, preparationTime, questionnaireCompletion] = await Promise.all([
      this.calculateConsultationMetrics('daily'),
      this.getActiveUsers(),
      this.calculateAIAcceptanceRate('daily'),
      this.calculatePreparationTime('daily'),
      this.calculateQuestionnaireCompletion('daily'),
    ]);

    const warnings: string[] = [];
    if (aiAcceptance.acceptanceRate < 40) {
      warnings.push('AI acceptance rate is below 40%');
    }
    if (questionnaireCompletion.completionRate < 60) {
      warnings.push('Questionnaire completion rate is below 60%');
    }

    const summary: DashboardSummary = {
      consultations,
      activeUsers,
      aiAcceptance,
      preparationTime,
      questionnaireCompletion,
      warnings,
    };

    await this.cache.set(cacheKey, summary, 60); // 1 minute TTL
    return summary;
  }

  private getDateFilter(period: 'daily' | 'weekly' | 'monthly'): Date {
    const now = new Date();
    switch (period) {
      case 'daily':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }
}
