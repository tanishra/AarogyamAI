import { Pool } from 'pg';

import { getDatabasePool } from './config/database';
import { AuditLogRepository } from './repositories/AuditLogRepository';
import { chatRepository } from './repositories/ChatRepository';
import { clinicalRepository } from './repositories/ClinicalRepository';
import { ConsentRepository } from './repositories/ConsentRepository';
import { DataAccessRequestRepository } from './repositories/DataAccessRequestRepository';
import { GrievanceRepository } from './repositories/GrievanceRepository';
import { RegistrationRequestRepository } from './repositories/RegistrationRequestRepository';
import { UserRepository } from './repositories/UserRepository';
import { vitalsRepository } from './repositories/VitalsRepository';
import { AnomalyDetectionService } from './services/AnomalyDetectionService';
import { AuditLogService } from './services/AuditLogService';
import { ConsentGrievanceService } from './services/ConsentGrievanceService';
import { CriticalAlertingService } from './services/CriticalAlertingService';
import { DifferentialManager } from './services/DifferentialManager';
import { llmService } from './services/LLMService';
import { MetricsService } from './services/MetricsService';
import { QuestionnaireSessionManager } from './services/QuestionnaireSessionManager';
import { ReportService } from './services/ReportService';
import { SessionManager } from './services/SessionManager';
import { UserManagementService } from './services/UserManagementService';
import { VitalsService } from './services/VitalsService';

/**
 * Composition root — constructs shared infrastructure, repositories, and
 * services once per process. Routes and services pull their dependencies
 * from here instead of scattering `new X()` / `getDatabasePool()` calls.
 */
export interface Container {
  pool: Pool;
  repositories: {
    auditLog: AuditLogRepository;
    chat: typeof chatRepository;
    clinical: typeof clinicalRepository;
    consent: ConsentRepository;
    dataAccessRequest: DataAccessRequestRepository;
    grievance: GrievanceRepository;
    registrationRequest: RegistrationRequestRepository;
    user: UserRepository;
    vitals: typeof vitalsRepository;
  };
  services: {
    anomalyDetection: AnomalyDetectionService;
    auditLog: AuditLogService;
    consentGrievance: ConsentGrievanceService;
    criticalAlerting: CriticalAlertingService;
    differentialManager: DifferentialManager;
    llm: typeof llmService;
    metrics: MetricsService;
    questionnaireSession: QuestionnaireSessionManager;
    report: ReportService;
    session: SessionManager;
    userManagement: UserManagementService;
    vitals: VitalsService;
  };
}

let container: Container | null = null;

export function getContainer(): Container {
  if (container) return container;

  const pool = getDatabasePool();

  const auditLogRepo = new AuditLogRepository();

  const userRepo = new UserRepository();
  const registrationRepo = new RegistrationRequestRepository();

  container = {
    pool,
    repositories: {
      auditLog: auditLogRepo,
      chat: chatRepository,
      clinical: clinicalRepository,
      consent: new ConsentRepository(),
      dataAccessRequest: new DataAccessRequestRepository(),
      grievance: new GrievanceRepository(),
      registrationRequest: registrationRepo,
      user: userRepo,
      vitals: vitalsRepository,
    },
    services: {
      anomalyDetection: new AnomalyDetectionService(pool),
      auditLog: new AuditLogService(pool),
      consentGrievance: new ConsentGrievanceService(pool),
      criticalAlerting: new CriticalAlertingService(pool),
      differentialManager: new DifferentialManager(pool),
      llm: llmService,
      metrics: new MetricsService(pool),
      questionnaireSession: new QuestionnaireSessionManager(pool),
      report: new ReportService(pool),
      session: new SessionManager(pool),
      userManagement: new UserManagementService(userRepo, registrationRepo, auditLogRepo),
      vitals: new VitalsService(pool),
    },
  };

  return container;
}

/** Test-only: reset the container so tests can re-mock cleanly. */
export function resetContainer(): void {
  container = null;
}
