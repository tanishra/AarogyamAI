// User Management Types
export interface RegistrationRequest {
  id: string;
  applicantName: string;
  email: string;
  requestedRole: 'Nurse' | 'Doctor';
  credentials: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  processedBy?: string;
  processedAt?: string;
  rejectionReason?: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: 'Patient' | 'Nurse' | 'Doctor' | 'Administrator' | 'DPO';
  isActive: boolean;
  mfaEnabled: boolean;
  mfaMethod?: 'totp' | 'sms';
  lastPasswordChange: string;
  lastMFAVerification?: string;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  actionType: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure';
  errorDetails?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Metrics Types
export interface TimeSeriesData {
  date: string;
  value: number;
}

export interface HistogramData {
  bucket: string;
  count: number;
}

export interface ConsultationMetrics {
  total: number;
  daily: TimeSeriesData[];
  weekly: TimeSeriesData[];
  monthly: TimeSeriesData[];
  byDoctor: Record<string, number>;
}

export interface ActiveUserMetrics {
  byRole: Record<string, number>;
  totalRegistered: Record<string, number>;
  growthTrend: TimeSeriesData[];
  avgSessionDuration: Record<string, number>;
}

export interface AIAcceptanceMetrics {
  overallRate: number;
  daily: TimeSeriesData[];
  weekly: TimeSeriesData[];
  monthly: TimeSeriesData[];
  byDoctor: Record<string, number>;
  warningThreshold: boolean;
}

export interface PreparationTimeMetrics {
  average: number;
  distribution: HistogramData[];
  trend: TimeSeriesData[];
  byDoctor: Record<string, number>;
}

export interface QuestionnaireCompletionMetrics {
  rate: number;
  avgCompletionTime: number;
  abandonmentBySection: Record<string, number>;
  warningThreshold: boolean;
}

export interface MetricsSummary {
  consultations: ConsultationMetrics;
  activeUsers: ActiveUserMetrics;
  aiAcceptance: AIAcceptanceMetrics;
  preparationTime: PreparationTimeMetrics;
  questionnaireCompletion: QuestionnaireCompletionMetrics;
  lastUpdated: string;
}

// Audit Log Types
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  actionType: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure';
  errorDetails?: string;
  ipAddress: string;
  userAgent: string;
  hash: string;
}

export interface AnomalyAlert {
  id: string;
  userId: string;
  userName: string;
  triggerCondition: string;
  timestamp: string;
  details: {
    recordCount?: number;
    timeWindow?: string;
    accessTime?: string;
  };
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface AccessPattern {
  userId: string;
  userName: string;
  userRole: string;
  accessCount: number;
  lastAccessTimestamp: string;
  accessPurpose?: string;
  isAnomalous: boolean;
}

// Consent & Grievance Types
export interface ConsentRecord {
  id: string;
  patientId: string;
  patientName: string;
  consentType: string;
  scope: {
    dataCategories: string[];
    processingPurposes: string[];
  };
  grantedAt: string;
  expiresAt?: string;
  withdrawnAt?: string;
  status: 'active' | 'withdrawn' | 'expired';
}

export interface ConsentWithdrawalRequest {
  id: string;
  consentId: string;
  patientId: string;
  patientName: string;
  requestedAt: string;
  processedAt?: string;
  processedBy?: string;
  status: 'pending' | 'processed';
}

export interface Grievance {
  id: string;
  patientId: string;
  patientName: string;
  submittedAt: string;
  status: 'pending' | 'investigating' | 'resolved' | 'escalated';
  description: string;
  affectedData: string;
  resolutionTimeline?: string;
  dpoNotes?: string;
  resolvedAt?: string;
}

export interface DataAccessRequest {
  id: string;
  patientId: string;
  patientName: string;
  requestType: 'data_copy' | 'data_correction' | 'data_deletion';
  requestedScope: string;
  submittedAt: string;
  status: 'pending' | 'fulfilled';
  fulfilledAt?: string;
  responseDocumentUrl?: string;
}

// Request/Response Types
export interface ApproveRegistrationRequest {
  id: string;
}

export interface RejectRegistrationRequest {
  id: string;
  reason: string;
}

export interface ChangeRoleRequest {
  userId: string;
  newRole: 'Patient' | 'Nurse' | 'Doctor' | 'Administrator' | 'DPO';
}

export interface ChangeStatusRequest {
  userId: string;
  isActive: boolean;
  reason?: string;
}

export interface PasswordResetRequest {
  userId: string;
}

export interface MFAUpdateRequest {
  userId: string;
  enabled: boolean;
  method?: 'totp' | 'sms';
}

export interface AuditLogSearchParams {
  userId?: string;
  actionType?: string;
  startDate?: string;
  endDate?: string;
  resource?: string;
  page?: number;
  pageSize?: number;
}

export interface UpdateGrievanceRequest {
  id: string;
  status: 'pending' | 'investigating' | 'resolved' | 'escalated';
  dpoNotes?: string;
}

export interface FulfillDataAccessRequest {
  id: string;
  responseDocumentUrl: string;
}
