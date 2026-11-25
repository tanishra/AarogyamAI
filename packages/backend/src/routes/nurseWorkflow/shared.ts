import { getContainer } from '../../composition';

export const vitalsService = getContainer().services.vitals;
export const alertingService = getContainer().services.criticalAlerting;
