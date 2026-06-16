import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import {
  Channel,
  NotificationType,
  PreferenceEntry,
  UserPreferencesResponse,
} from '../types';

@Injectable()
export class PreferencesService {
  private readonly logger = new Logger(PreferencesService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async getPreferences(userId: string): Promise<UserPreferencesResponse> {
    const [defaults, userPrefs, quietHours] = await Promise.all([
      this.prismaService.defaultPreference.findMany().catch((err) => {
        this.logger.error(err);
        return [];
      }),
      this.prismaService.userPreference
        .findMany({ where: { userId } })
        .catch((err) => {
          this.logger.error(err);
          return [];
        }),
      this.prismaService.quietHours
        .findUnique({ where: { userId } })
        .catch((err) => {
          this.logger.error(err);
          return null;
        }),
    ]);

    const userPrefMap = new Map(
      userPrefs.map((p) => [`${p.notificationType}:${p.channel}`, p] as const),
    );

    const defaultKeys = new Set(
      defaults.map((d) => `${d.notificationType}:${d.channel}`),
    );

    const preferences: PreferenceEntry[] = defaults.map((d) => {
      const userPref = userPrefMap.get(`${d.notificationType}:${d.channel}`);

      if (userPref) {
        return {
          notificationType: d.notificationType as NotificationType,
          channel: d.channel as Channel,
          enabled: userPref.enabled,
          source: 'user' as const,
        };
      }

      return {
        notificationType: d.notificationType as NotificationType,
        channel: d.channel as Channel,
        enabled: d.enabled,
        source: 'default' as const,
      };
    });

    for (const userPref of userPrefs) {
      const key = `${userPref.notificationType}:${userPref.channel}`;

      if (!defaultKeys.has(key)) {
        preferences.push({
          notificationType: userPref.notificationType as NotificationType,
          channel: userPref.channel as Channel,
          enabled: userPref.enabled,
          source: 'user' as const,
        });
      }
    }

    return {
      userId,
      preferences,
      quietHours: quietHours
        ? {
            startTime: quietHours.startTime,
            endTime: quietHours.endTime,
            timezone: quietHours.timezone,
          }
        : null,
    };
  }

  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<void> {
    if (dto.preferences && dto.preferences.length > 0) {
      for (const pref of dto.preferences) {
        await this.prismaService.userPreference
          .upsert({
            where: {
              userId_notificationType_channel: {
                userId,
                notificationType: pref.notificationType,
                channel: pref.channel,
              },
            },
            update: { enabled: pref.enabled },
            create: {
              userId,
              notificationType: pref.notificationType,
              channel: pref.channel,
              enabled: pref.enabled,
            },
          })
          .catch((err) => {
            this.logger.error(err);
          });
      }

      this.logger.log(
        `[PREFERENCES_UPDATED] userId=${userId} count=${dto.preferences.length}`,
      );
    }

    if (dto.quietHours !== undefined) {
      if (dto.quietHours === null) {
        await this.prismaService.quietHours
          .deleteMany({ where: { userId } })
          .catch((err) => {
            this.logger.error(err);
          });

        this.logger.log(`[QUIET_HOURS_REMOVED] userId=${userId}`);
      } else {
        await this.prismaService.quietHours
          .upsert({
            where: { userId },
            update: dto.quietHours,
            create: { userId, ...dto.quietHours },
          })
          .catch((err) => {
            this.logger.error(err);
          });

        this.logger.log(
          `[QUIET_HOURS_SET] userId=${userId} start=${dto.quietHours.startTime} end=${dto.quietHours.endTime} tz=${dto.quietHours.timezone}`,
        );
      }
    }
  }
}
