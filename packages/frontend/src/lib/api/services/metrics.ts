import apiClient from '../client';
import type {
  ConsultationMetrics,
  ActiveUserMetrics,
  AIAcceptanceMetrics,
  PreparationTimeMetrics,
  QuestionnaireCompletionMetrics,
  MetricsSummary,
} from '../types';

export type MetricsPeriod = 'daily' | 'weekly' | 'monthly';

export class MetricsAPI {
  /**
   * Get consultation metrics
   */
  static async getConsultationMetrics(
    period: MetricsPeriod,
    startDate?: string,
    endDate?: string
  ): Promise<ConsultationMetrics> {
    const response = await apiClient.get<ConsultationMetrics>('/api/metrics/consultations', {
      params: { period, startDate, endDate },
    });
    return response.data;
  }

  /**
   * Get active user metrics
   */
  static async getActiveUserMetrics(): Promise<ActiveUserMetrics> {
    const response = await apiClient.get<ActiveUserMetrics>('/api/metrics/active-users');
    return response.data;
  }

  /**
   * Get AI acceptance rate metrics
   */
  static async getAIAcceptanceMetrics(
    period: MetricsPeriod,
    startDate?: string,
    endDate?: string
  ): Promise<AIAcceptanceMetrics> {
    const response = await apiClient.get<AIAcceptanceMetrics>('/api/metrics/ai-acceptance', {
      params: { period, startDate, endDate },
    });
    return response.data;
  }

  /**
   * Get preparation time metrics
   */
  static async getPreparationTimeMetrics(
    period: MetricsPeriod,
    startDate?: string,
    endDate?: string
  ): Promise<PreparationTimeMetrics> {
    const response = await apiClient.get<PreparationTimeMetrics>('/api/metrics/preparation-time', {
      params: { period, startDate, endDate },
    });
    return response.data;
  }

  /**
   * Get questionnaire completion metrics
   */
  static async getQuestionnaireCompletionMetrics(
    period: MetricsPeriod,
    startDate?: string,
    endDate?: string
  ): Promise<QuestionnaireCompletionMetrics> {
    const response = await apiClient.get<QuestionnaireCompletionMetrics>(
      '/api/metrics/questionnaire-completion',
      {
        params: { period, startDate, endDate },
      }
    );
    return response.data;
  }

  /**
   * Get complete dashboard summary
   */
  static async getDashboardSummary(): Promise<MetricsSummary> {
    const response = await apiClient.get<MetricsSummary>('/api/metrics/dashboard-summary');
    return response.data;
  }
}
