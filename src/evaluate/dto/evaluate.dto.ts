import { IsEnum, IsISO8601, IsString } from 'class-validator';
import { CHANNELS, Channel, NOTIFICATION_TYPES, NotificationType, REGIONS, Region } from '../../types';

export class EvaluateNotificationDto {
  @IsString()
  userId: string;

  @IsEnum(NOTIFICATION_TYPES)
  notificationType: NotificationType;

  @IsEnum(CHANNELS)
  channel: Channel;

  @IsEnum(REGIONS)
  region: Region;

  @IsISO8601()
  datetime: string;
}
