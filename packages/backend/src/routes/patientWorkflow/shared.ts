import { Request } from 'express';
import { getContainer } from '../../composition';

export const consentRepo = getContainer().repositories.consent;
export const questionnaireManager = getContainer().services.questionnaireSession;

export function canAccessPatientData(req: Request, patientId: string) {
  return req.user!.role === 'Administrator' || req.user!.userId === patientId;
}
