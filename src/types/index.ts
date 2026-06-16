export const NOTIFICATION_TYPES = [
  'transactional_email',
  'marketing_email',
  'transactional_sms',
  'marketing_sms',
  'transactional_push',
  'marketing_push',
  'transactional_messenger',
  'marketing_messenger',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const CHANNELS = ['email', 'sms', 'push', 'messenger'] as const;
export type Channel = (typeof CHANNELS)[number];

export const REGIONS = ['EU', 'US', 'RU', 'GLOBAL'] as const;
export type Region = (typeof REGIONS)[number];

export type Decision = 'allow' | 'deny';

export type DenyReason =
  | 'blocked_by_global_policy'
  | 'user_disabled'
  | 'quiet_hours';

export type AllowReason = 'allowed';

export type EvaluationReason = DenyReason | AllowReason;

export interface EvaluationResult {
  decision: Decision;
  reason: EvaluationReason;
}

export interface QuietHoursConfig {
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface PreferenceEntry {
  notificationType: NotificationType;
  channel: Channel;
  enabled: boolean;
  source: 'user' | 'default';
}

export interface UserPreferencesResponse {
  userId: string;
  preferences: PreferenceEntry[];
  quietHours: QuietHoursConfig | null;
}
