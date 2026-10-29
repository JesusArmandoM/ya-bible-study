export type SanctuaryRole = 'Study Leader' | 'Participant';

export const SANCTUARY_ROLES: readonly SanctuaryRole[] = [
  'Study Leader',
  'Participant',
] as const;

export interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  activeSessionCount: number;
  wsReady: boolean;
  timestamp: string;
}
