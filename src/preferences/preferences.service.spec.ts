import { Test, TestingModule } from '@nestjs/testing';
import { PreferencesService } from './preferences.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  defaultPreference: {
    findMany: jest.fn(),
  },
  userPreference: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  quietHours: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('PreferencesService', () => {
  let service: PreferencesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PreferencesService>(PreferencesService);
    jest.clearAllMocks();
  });

  describe('getPreferences', () => {
    it('should return default preferences for a new user', async () => {
      mockPrismaService.defaultPreference.findMany.mockResolvedValue([
        {
          notificationType: 'transactional_email',
          channel: 'email',
          enabled: true,
        },
        {
          notificationType: 'marketing_email',
          channel: 'email',
          enabled: false,
        },
      ]);
      mockPrismaService.userPreference.findMany.mockResolvedValue([]);
      mockPrismaService.quietHours.findUnique.mockResolvedValue(null);

      const result = await service.getPreferences('new-user');

      expect(result.userId).toBe('new-user');
      expect(result.preferences).toHaveLength(2);
      expect(result.preferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            notificationType: 'transactional_email',
            enabled: true,
            source: 'default',
          }),
          expect.objectContaining({
            notificationType: 'marketing_email',
            enabled: false,
            source: 'default',
          }),
        ]),
      );
      expect(result.quietHours).toBeNull();
    });

    it('should apply user overrides on top of defaults', async () => {
      mockPrismaService.defaultPreference.findMany.mockResolvedValue([
        {
          notificationType: 'marketing_email',
          channel: 'email',
          enabled: false,
        },
        {
          notificationType: 'transactional_email',
          channel: 'email',
          enabled: true,
        },
      ]);
      mockPrismaService.userPreference.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          notificationType: 'marketing_email',
          channel: 'email',
          enabled: true,
        },
      ]);
      mockPrismaService.quietHours.findUnique.mockResolvedValue(null);

      const result = await service.getPreferences('user-1');

      const marketingPref = result.preferences.find(
        (p) => p.notificationType === 'marketing_email',
      );

      expect(marketingPref?.enabled).toBe(true);
      expect(marketingPref?.source).toBe('user');

      const transactionalPref = result.preferences.find(
        (p) => p.notificationType === 'transactional_email',
      );

      expect(transactionalPref?.source).toBe('default');
    });

    it('should include quiet hours when set', async () => {
      mockPrismaService.defaultPreference.findMany.mockResolvedValue([]);
      mockPrismaService.userPreference.findMany.mockResolvedValue([]);
      mockPrismaService.quietHours.findUnique.mockResolvedValue({
        userId: 'user-1',
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'Europe/Moscow',
      });

      const result = await service.getPreferences('user-1');

      expect(result.quietHours).toEqual({
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'Europe/Moscow',
      });
    });
  });

  describe('updatePreferences', () => {
    it('should upsert user preference', async () => {
      mockPrismaService.userPreference.upsert.mockResolvedValue({});

      await service.updatePreferences('user-1', {
        preferences: [
          {
            notificationType: 'marketing_email',
            channel: 'email',
            enabled: false,
          },
        ],
      });

      expect(mockPrismaService.userPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_notificationType_channel: {
              userId: 'user-1',
              notificationType: 'marketing_email',
              channel: 'email',
            },
          },
          update: { enabled: false },
          create: {
            userId: 'user-1',
            notificationType: 'marketing_email',
            channel: 'email',
            enabled: false,
          },
        }),
      );
    });

    it('should upsert quiet hours', async () => {
      mockPrismaService.quietHours.upsert.mockResolvedValue({});

      await service.updatePreferences('user-1', {
        quietHours: {
          startTime: '22:00',
          endTime: '08:00',
          timezone: 'Europe/Moscow',
        },
      });

      expect(mockPrismaService.quietHours.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          update: {
            startTime: '22:00',
            endTime: '08:00',
            timezone: 'Europe/Moscow',
          },
        }),
      );
    });

    it('should remove quiet hours when null is passed', async () => {
      mockPrismaService.quietHours.deleteMany.mockResolvedValue({ count: 1 });

      await service.updatePreferences('user-1', { quietHours: null });

      expect(mockPrismaService.quietHours.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  describe('idempotency', () => {
    it('should produce same state when marketing_email disabled twice', async () => {
      mockPrismaService.userPreference.upsert.mockResolvedValue({
        userId: 'user-1',
        notificationType: 'marketing_email',
        channel: 'email',
        enabled: false,
      });

      const dto = {
        preferences: [
          {
            notificationType: 'marketing_email' as const,
            channel: 'email' as const,
            enabled: false,
          },
        ],
      };

      await service.updatePreferences('user-1', dto);
      await service.updatePreferences('user-1', dto);

      expect(mockPrismaService.userPreference.upsert).toHaveBeenCalledTimes(2);

      const firstArgs =
        mockPrismaService.userPreference.upsert.mock.calls[0][0];
      const secondArgs =
        mockPrismaService.userPreference.upsert.mock.calls[1][0];

      expect(firstArgs.update).toEqual(secondArgs.update);
      expect(firstArgs.where).toEqual(secondArgs.where);
    });

    it('should produce same quiet hours when set twice with same data', async () => {
      mockPrismaService.quietHours.upsert.mockResolvedValue({});

      const dto = {
        quietHours: {
          startTime: '22:00',
          endTime: '08:00',
          timezone: 'Europe/Moscow',
        },
      };

      await service.updatePreferences('user-1', dto);
      await service.updatePreferences('user-1', dto);

      expect(mockPrismaService.quietHours.upsert).toHaveBeenCalledTimes(2);

      const firstArgs = mockPrismaService.quietHours.upsert.mock.calls[0][0];
      const secondArgs = mockPrismaService.quietHours.upsert.mock.calls[1][0];

      expect(firstArgs.update).toEqual(secondArgs.update);
    });
  });
});
