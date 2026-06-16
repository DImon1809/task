import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluationResult } from '../types';
import { EvaluateNotificationDto } from './dto/evaluate.dto';

@Injectable()
export class EvaluateService {
  private readonly logger = new Logger(EvaluateService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async evaluate(dto: EvaluateNotificationDto): Promise<EvaluationResult> {
    const policy = await this.prismaService.globalPolicy
      .findUnique({
        where: {
          notificationType_region: {
            notificationType: dto.notificationType,
            region: dto.region,
          },
        },
      })
      .catch((err) => {
        this.logger.error(err);
        return null;
      });

    if (policy && !policy.enabled) {
      this.logger.log(
        `[DENY] userId=${dto.userId} type=${dto.notificationType} reason=blocked_by_global_policy region=${dto.region}`,
      );
      return { decision: 'deny', reason: 'blocked_by_global_policy' };
    }

    const userPref = await this.prismaService.userPreference
      .findUnique({
        where: {
          userId_notificationType_channel: {
            userId: dto.userId,
            notificationType: dto.notificationType,
            channel: dto.channel,
          },
        },
      })
      .catch((err) => {
        this.logger.error(err);
        return null;
      });

    if (userPref) {
      if (!userPref.enabled) {
        this.logger.log(
          `[DENY] userId=${dto.userId} type=${dto.notificationType} reason=user_disabled`,
        );
        return { decision: 'deny', reason: 'user_disabled' };
      }
    } else {
      const defaultPref = await this.prismaService.defaultPreference
        .findUnique({
          where: {
            notificationType_channel: {
              notificationType: dto.notificationType,
              channel: dto.channel,
            },
          },
        })
        .catch((err) => {
          this.logger.error(err);
          return null;
        });

      if (defaultPref && !defaultPref.enabled) {
        this.logger.log(
          `[DENY] userId=${dto.userId} type=${dto.notificationType} reason=user_disabled (default)`,
        );
        return { decision: 'deny', reason: 'user_disabled' };
      }
    }

    if (dto.notificationType.startsWith('marketing_')) {
      const quietHours = await this.prismaService.quietHours
        .findUnique({ where: { userId: dto.userId } })
        .catch((err) => {
          this.logger.error(err);
          return null;
        });

      if (quietHours && this.isInQuietHours(dto.datetime, quietHours)) {
        this.logger.log(
          `[DENY] userId=${dto.userId} type=${dto.notificationType} reason=quiet_hours`,
        );
        return { decision: 'deny', reason: 'quiet_hours' };
      }
    }

    this.logger.log(
      `[ALLOW] userId=${dto.userId} type=${dto.notificationType} channel=${dto.channel} region=${dto.region}`,
    );
    return { decision: 'allow', reason: 'allowed' };
  }

  private isInQuietHours(
    isoDatetime: string,
    quietHours: { startTime: string; endTime: string; timezone: string },
  ): boolean {
    const { startTime, endTime, timezone } = quietHours;

    const dt = DateTime.fromISO(isoDatetime, { zone: 'utc' }).setZone(timezone);

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const currentMinutes = dt.hour * 60 + dt.minute;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    // Crosses midnight (e.g. 22:00 – 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}
