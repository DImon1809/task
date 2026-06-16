import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CHANNELS, Channel, NOTIFICATION_TYPES, NotificationType } from '../../types';

export class QuietHoursDto {
  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsString()
  timezone: string;
}

export class PreferenceItemDto {
  @IsEnum(NOTIFICATION_TYPES)
  notificationType: NotificationType;

  @IsEnum(CHANNELS)
  channel: Channel;

  @IsBoolean()
  enabled: boolean;
}

export class UpdatePreferencesDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  preferences?: PreferenceItemDto[];

  @IsOptional()
  @ValidateIf((o) => o.quietHours !== null && o.quietHours !== undefined)
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto | null;
}
