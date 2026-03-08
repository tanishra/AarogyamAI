export { UserManagementService } from './UserManagementService';
export type {
  ApproveRegistrationParams,
  RejectRegistrationParams,
  ChangeRoleParams,
  ActivateAccountParams,
  DeactivateAccountParams,
} from './UserManagementService';

// Clinical System Services
export { SessionManager } from './SessionManager';
export type { CreateSessionParams, SessionData } from './SessionManager';

export { QuestionnaireSessionManager } from './QuestionnaireSessionManager';
export type { QuestionnaireSessionData, SaveSessionParams } from './QuestionnaireSessionManager';

export { VitalsService } from './VitalsService';
export type { VitalSigns, SubmitVitalsParams, ValidationWarning } from './VitalsService';

export { DifferentialManager } from './DifferentialManager';
export type { Diagnosis, AddDiagnosisParams, UpdateDiagnosisParams, DifferentialData } from './DifferentialManager';

export { CriticalAlertingService } from './CriticalAlertingService';
export type { CriticalAlert, CheckVitalsParams } from './CriticalAlertingService';
