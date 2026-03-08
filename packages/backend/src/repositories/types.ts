/**
 * Common types for repositories
 */

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'Patient' | 'Nurse' | 'Doctor' | 'Administrator' | 'DPO';
  is_active: boolean;
  mfa_enabled: boolean;
  mfa_method?: 'totp' | 'sms';
  mfa_secret?: string;
  last_password_change?: Date;
  last_mfa_verification?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RegistrationRequest {
  id: string;
  applicant_name: string;
  email: string;
  requested_role: 'Nurse' | 'Doctor';
  credentials?: string;
  submitted_at: Date;
  status: 'pending' | 'approved' | 'rejected';
  processed_by?: string;
  processed_at?: Date;
  rejection_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ConsentRecord {
  id: string;
  patient_id: string;
  consent_type: string;
  data_categories: string[];
  processing_purposes: string[];
  granted_at: Date;
  expires_at?: Date;
  withdrawn_at?: Date;
  status: 'active' | 'withdrawn' | 'expired';
  created_at: Date;
  updated_at: Date;
}

export interface ConsentWithdrawalRequest {
  id: string;
  consent_id: string;
  patient_id: string;
  requested_at: Date;
  processed_at?: Date;
  processed_by?: string;
  status: 'pending' | 'processed';
  created_at: Date;
}

export interface Grievance {
  id: string;
  patient_id: string;
  submitted_at: Date;
  status: 'pending' | 'investigating' | 'resolved' | 'escalated';
  description: string;
  affected_data?: string;
  resolution_timeline?: Date;
  dpo_notes?: string;
  resolved_at?: Date;
  resolved_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface DataAccessRequest {
  id: string;
  patient_id: string;
  request_type: 'data_copy' | 'data_correction' | 'data_deletion';
  requested_scope: string;
  submitted_at: Date;
  status: 'pending' | 'fulfilled';
  fulfilled_at?: Date;
  fulfilled_by?: string;
  response_document_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLogEntry {
  userId: string;
  timestamp: number;
  id: string;
  userName: string;
  userRole: string;
  actionType: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure';
  errorDetails?: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
  hash: string;
  previousHash?: string;
}

export interface SearchFilters {
  userId?: string;
  actionType?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
