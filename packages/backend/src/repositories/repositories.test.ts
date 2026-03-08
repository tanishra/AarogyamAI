import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  UserRepository,
  RegistrationRequestRepository,
  AuditLogRepository,
  ConsentRepository,
  GrievanceRepository,
  DataAccessRequestRepository,
} from './index';

describe('Repository Instantiation', () => {
  it('should instantiate UserRepository', () => {
    const repo = new UserRepository();
    expect(repo).toBeDefined();
  });

  it('should instantiate RegistrationRequestRepository', () => {
    const repo = new RegistrationRequestRepository();
    expect(repo).toBeDefined();
  });

  it('should instantiate AuditLogRepository', () => {
    const repo = new AuditLogRepository();
    expect(repo).toBeDefined();
  });

  it('should instantiate ConsentRepository', () => {
    const repo = new ConsentRepository();
    expect(repo).toBeDefined();
  });

  it('should instantiate GrievanceRepository', () => {
    const repo = new GrievanceRepository();
    expect(repo).toBeDefined();
  });

  it('should instantiate DataAccessRequestRepository', () => {
    const repo = new DataAccessRequestRepository();
    expect(repo).toBeDefined();
  });
});
