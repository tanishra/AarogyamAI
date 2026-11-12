import { Pool, PoolClient } from 'pg';
import { getDatabasePool } from '../config/database';

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

type Queryable = Pool | PoolClient;

/**
 * MetricsRepository — real aggregation queries behind /api/metrics/*.
 * Every number returned here comes from the database; when the schema
 * cannot measure a dimension, the method returns an empty/zero value
 * rather than fabricated data.
 */
export class MetricsRepository {
  private pool: Queryable;

  constructor(pool?: Queryable) {
    this.pool = pool ?? getDatabasePool();
  }

  private async countSeries(
    table: string,
    dateColumn: string,
    buckets: number,
    unit: 'day' | 'week' | 'month'
  ): Promise<TimeSeriesPoint[]> {
    const result = await this.pool.query<{ date: string; value: string }>(
      `SELECT to_char(gs.bucket, 'YYYY-MM-DD') AS date, COALESCE(t.n, 0)::int AS value
       FROM generate_series(
         date_trunc($2, NOW()) - ($1::int - 1) * ('1 ' || $2)::interval,
         date_trunc($2, NOW()),
         ('1 ' || $2)::interval
       ) AS gs(bucket)
       LEFT JOIN (
         SELECT date_trunc($2, ${dateColumn}) AS b, COUNT(*) AS n
         FROM ${table}
         WHERE ${dateColumn} >= date_trunc($2, NOW()) - ($1::int - 1) * ('1 ' || $2)::interval
         GROUP BY 1
       ) t ON t.b = gs.bucket
       ORDER BY gs.bucket`,
      [buckets, unit]
    );
    return result.rows.map(r => ({ date: r.date, value: Number(r.value) }));
  }

  private async mapColumn(rows: Array<{ key: string; n: string }>): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const row of rows) out[row.key] = Number(row.n);
    return out;
  }

  async getConsultationMetrics() {
    const total = await this.pool.query<{ n: string }>('SELECT COUNT(*) AS n FROM consultations');
    const [daily, weekly, monthly] = await Promise.all([
      this.countSeries('consultations', 'created_at', 30, 'day'),
      this.countSeries('consultations', 'created_at', 12, 'week'),
      this.countSeries('consultations', 'created_at', 6, 'month'),
    ]);
    const byDoctor = await this.mapColumn(
      (
        await this.pool.query<{ key: string; n: string }>(
          'SELECT doctor_id AS key, COUNT(*) AS n FROM consultations WHERE doctor_id IS NOT NULL GROUP BY doctor_id'
        )
      ).rows
    );
    return {
      total: Number(total.rows[0]?.n ?? 0),
      daily,
      weekly,
      monthly,
      byDoctor,
    };
  }

  async getActiveUserMetrics() {
    const roles = ['Patient', 'Nurse', 'Doctor', 'Administrator', 'DPO'];

    const byRoleRows = (
      await this.pool.query<{ key: string; n: string }>(
        `SELECT role AS key, COUNT(*) AS n FROM users WHERE is_active = true GROUP BY role`
      )
    ).rows;
    const registeredRows = (
      await this.pool.query<{ key: string; n: string }>(
        'SELECT role AS key, COUNT(*) AS n FROM users GROUP BY role'
      )
    ).rows;
    const durationRows = (
      await this.pool.query<{ key: string; n: string }>(
        `SELECT u.role AS key,
                AVG(EXTRACT(EPOCH FROM (COALESCE(s.terminated_at, s.last_activity) - s.created_at))) AS n
         FROM sessions s JOIN users u ON u.id = s.user_id
         GROUP BY u.role`
      )
    ).rows;

    const zeroed = (record: Record<string, number>) =>
      Object.fromEntries(roles.map(r => [r, record[r] ?? 0]));

    return {
      byRole: zeroed(await this.mapColumn(byRoleRows)),
      totalRegistered: zeroed(await this.mapColumn(registeredRows)),
      growthTrend: await this.countSeries('users', 'created_at', 30, 'day'),
      avgSessionDuration: zeroed(await this.mapColumn(durationRows)),
    };
  }

  private async acceptanceSeries(buckets: number, unit: 'day' | 'week' | 'month'): Promise<TimeSeriesPoint[]> {
    const result = await this.pool.query<{ date: string; value: string }>(
      `SELECT to_char(gs.bucket, 'YYYY-MM-DD') AS date,
              COALESCE(
                ROUND(100.0 * SUM(CASE WHEN t.status IN ('accepted','modified') THEN 1 ELSE 0 END)
                      / NULLIF(COUNT(t.id), 0), 1),
                0
              ) AS value
       FROM generate_series(
         date_trunc($2, NOW()) - ($1::int - 1) * ('1 ' || $2)::interval,
         date_trunc($2, NOW()),
         ('1 ' || $2)::interval
       ) AS gs(bucket)
       LEFT JOIN clinical_considerations t
         ON date_trunc($2, t.generated_at) = gs.bucket AND t.status <> 'pending'
       GROUP BY gs.bucket
       ORDER BY gs.bucket`,
      [buckets, unit]
    );
    return result.rows.map(r => ({ date: r.date, value: Number(r.value) }));
  }

  async getAIAcceptanceMetrics() {
    const overall = await this.pool.query<{ n: string }>(
      `SELECT COALESCE(
         ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('accepted','modified'))
               / NULLIF(COUNT(*), 0), 1), 0) AS n
       FROM clinical_considerations WHERE status <> 'pending'`
    );
    const byDoctor = await this.mapColumn(
      (
        await this.pool.query<{ key: string; n: string }>(
          `SELECT reviewed_by AS key,
                  ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('accepted','modified'))
                        / NULLIF(COUNT(*), 0), 1) AS n
           FROM clinical_considerations
           WHERE status <> 'pending' AND reviewed_by IS NOT NULL
           GROUP BY reviewed_by`
        )
      ).rows
    );

    const [daily, weekly, monthly] = await Promise.all([
      this.acceptanceSeries(30, 'day'),
      this.acceptanceSeries(12, 'week'),
      this.acceptanceSeries(6, 'month'),
    ]);

    const overallRate = Number(overall.rows[0]?.n ?? 0);
    return {
      overallRate,
      daily,
      weekly,
      monthly,
      byDoctor,
      warningThreshold: overallRate < 40,
    };
  }

  /**
   * Preparation time = intake session duration (started_at → completed_at)
   * on questionnaire_sessions. There is no per-doctor linkage in the schema,
   * so byDoctor is returned empty rather than fabricated.
   */
  async getPreparationTimeMetrics() {
    const stats = await this.pool.query<{
      avg: string | null;
      b0: string; b1: string; b2: string; b3: string; b4: string;
    }>(
      `SELECT AVG(dur) AS avg,
              COUNT(*) FILTER (WHERE dur < 300)  AS b0,
              COUNT(*) FILTER (WHERE dur >= 300  AND dur < 600)  AS b1,
              COUNT(*) FILTER (WHERE dur >= 600  AND dur < 900)  AS b2,
              COUNT(*) FILTER (WHERE dur >= 900  AND dur < 1200) AS b3,
              COUNT(*) FILTER (WHERE dur >= 1200) AS b4
       FROM (
         SELECT EXTRACT(EPOCH FROM (completed_at - started_at)) AS dur
         FROM questionnaire_sessions WHERE completed_at IS NOT NULL
       ) d`,
      []
    );
    const row = stats.rows[0];
    const trend = (
      await this.pool.query<{ date: string; value: string }>(
        `SELECT to_char(gs.bucket, 'YYYY-MM-DD') AS date,
                COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)))), 0) AS value
         FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day') AS gs(bucket)
         LEFT JOIN questionnaire_sessions t
           ON t.completed_at::date = gs.bucket::date
         GROUP BY gs.bucket
         ORDER BY gs.bucket`
      )
    ).rows.map(r => ({ date: r.date, value: Number(r.value) }));

    return {
      average: Math.round(Number(row?.avg ?? 0)),
      distribution: [
        { range: '0-5 min', count: Number(row?.b0 ?? 0) },
        { range: '5-10 min', count: Number(row?.b1 ?? 0) },
        { range: '10-15 min', count: Number(row?.b2 ?? 0) },
        { range: '15-20 min', count: Number(row?.b3 ?? 0) },
        { range: '20+ min', count: Number(row?.b4 ?? 0) },
      ],
      trend,
      byDoctor: {},
    };
  }

  async getQuestionnaireCompletionMetrics() {
    const stats = await this.pool.query<{ rate: string | null; avg: string | null }>(
      `SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE completed_at IS NOT NULL)
                  / NULLIF(COUNT(*), 0), 1) AS rate,
              AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))
              FILTER (WHERE completed_at IS NOT NULL) AS avg
       FROM questionnaire_sessions`
    );
    const trend = (
      await this.pool.query<{ date: string; value: string }>(
        `SELECT to_char(gs.bucket, 'YYYY-MM-DD') AS date,
                COALESCE(
                  ROUND(100.0 * COUNT(t.id) FILTER (WHERE t.completed_at IS NOT NULL)
                        / NULLIF(COUNT(t.id), 0), 1),
                  0) AS value
         FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day') AS gs(bucket)
         LEFT JOIN questionnaire_sessions t ON t.started_at::date = gs.bucket::date
         GROUP BY gs.bucket
         ORDER BY gs.bucket`
      )
    ).rows.map(r => ({ date: r.date, value: Number(r.value) }));

    const rate = Number(stats.rows[0]?.rate ?? 0);
    return {
      rate,
      avgCompletionTime: Math.round(Number(stats.rows[0]?.avg ?? 0)),
      // Section-level abandonment is not tracked in the schema — return empty
      // rather than fabricated percentages.
      abandonmentBySection: {},
      trend,
      warningThreshold: rate < 60,
    };
  }

  async getDashboardSummary() {
    const [consultations, activeUsers, aiAcceptance, preparationTime, questionnaireCompletion] =
      await Promise.all([
        this.getConsultationMetrics(),
        this.getActiveUserMetrics(),
        this.getAIAcceptanceMetrics(),
        this.getPreparationTimeMetrics(),
        this.getQuestionnaireCompletionMetrics(),
      ]);

    const tail = (series: TimeSeriesPoint[], n: number) => series.slice(-n);

    return {
      consultations: {
        ...consultations,
        daily: tail(consultations.daily, 7),
        weekly: tail(consultations.weekly, 4),
        monthly: tail(consultations.monthly, 3),
      },
      activeUsers: {
        ...activeUsers,
        growthTrend: tail(activeUsers.growthTrend, 7),
      },
      aiAcceptance: {
        ...aiAcceptance,
        daily: tail(aiAcceptance.daily, 7),
        weekly: tail(aiAcceptance.weekly, 4),
        monthly: tail(aiAcceptance.monthly, 3),
      },
      preparationTime: {
        ...preparationTime,
        trend: tail(preparationTime.trend, 7),
      },
      questionnaireCompletion: {
        ...questionnaireCompletion,
        trend: tail(questionnaireCompletion.trend, 7),
      },
      lastUpdated: new Date().toISOString(),
    };
  }
}
