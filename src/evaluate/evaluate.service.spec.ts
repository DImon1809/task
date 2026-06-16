import { Test, TestingModule } from '@nestjs/testing';
import { EvaluateService } from './evaluate.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  globalPolicy: {
    findUnique: jest.fn(),
  },
  userPreference: {
    findUnique: jest.fn(),
  },
  defaultPreference: {
    findUnique: jest.fn(),
  },
  quietHours: {
    findUnique: jest.fn(),
  },
};

describe('EvaluateService', () => {
  let service: EvaluateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvaluateService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<EvaluateService>(EvaluateService);
    jest.clearAllMocks();
  });

  describe('default preferences for new user', () => {
    it('should allow transactional_email when default is enabled', async () => {
      mockPrismaService.globalPolicy.findUnique.mockResolvedValue(null);
      mockPrismaService.userPreference.findUnique.mockResolvedValue(null);
      mockPrismaService.defaultPreference.findUnique.mockResolvedValue({
        notificationType: 'transactional_email',
        channel: 'email',
        enabled: true,
      });

      const result = await service.evaluate({
        userId: 'new-user',
        notificationType: 'transactional_email',
        channel: 'email',
        region: 'EU',
        datetime: '2026-05-21T10:00:00Z',
      });

      expect(result).toEqual({ decision: 'allow', reason: 'allowed' });
    });

    it('should deny marketing_email when default is disabled', async () => {
      mockPrismaService.globalPolicy.findUnique.mockResolvedValue(null);
      mockPrismaService.userPreference.findUnique.mockResolvedValue(null);
      mockPrismaService.defaultPreference.findUnique.mockResolvedValue({
        notificationType: 'marketing_email',
        channel: 'email',
        enabled: false,
      });

      const result = await service.evaluate({
        userId: 'new-user',
        notificationType: 'marketing_email',
        channel: 'email',
        region: 'US',
        datetime: '2026-05-21T10:00:00Z',
      });

      expect(result).toEqual({ decision: 'deny', reason: 'user_disabled' });
    });
  });

  describe('user preference overrides', () => {
    it('should deny marketing_email when user explicitly disabled it', async () => {
      mockPrismaService.globalPolicy.findUnique.mockResolvedValue(null);
      mockPrismaService.userPreference.findUnique.mockResolvedValue({
        userId: 'user-1',
        notificationType: 'marketing_email',
        channel: 'email',
        enabled: false,
      });

      const result = await service.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_email',
        channel: 'email',
        region: 'US',
        datetime: '2026-05-21T10:00:00Z',
      });

      expect(result).toEqual({ decision: 'deny', reason: 'user_disabled' });
    });

    it('should allow transactional_email when user explicitly enabled it', async () => {
      mockPrismaService.globalPolicy.findUnique.mockResolvedValue(null);
      mockPrismaService.userPreference.findUnique.mockResolvedValue({
        userId: 'user-1',
        notificationType: 'transactional_email',
        channel: 'email',
        enabled: true,
      });

      const result = await service.evaluate({
        userId: 'user-1',
        notificationType: 'transactional_email',
        channel: 'email',
        region: 'US',
        datetime: '2026-05-21T10:00:00Z',
      });

      expect(result).toEqual({ decision: 'allow', reason: 'allowed' });
    });

    it('should not check defaults when user preference exists', async () => {
      mockPrismaService.globalPolicy.findUnique.mockResolvedValue(null);
      mockPrismaService.userPreference.findUnique.mockResolvedValue({
        enabled: true,
      });
      mockPrismaService.quietHours.findUnique.mockResolvedValue(null);

      await service.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_email',
        channel: 'email',
        region: 'US',
        datetime: '2026-05-21T10:00:00Z',
      });

      expect(mockPrismaService.defaultPreference.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('quiet hours', () => {
    const quietHours = {
      userId: 'user-1',
      startTime: '22:00',
      endTime: '08:00',
      timezone: 'Europe/Moscow',
    };

    beforeEach(() => {
      mockPrismaService.globalPolicy.findUnique.mockResolvedValue(null);
      mockPrismaService.userPreference.findUnique.mockResolvedValue({
        enabled: true,
      });
    });

    it('should deny marketing_push during quiet hours', async () => {
      mockPrismaService.quietHours.findUnique.mockResolvedValue(quietHours);

      // 19:30 UTC = 22:30 Moscow (UTC+3)
      const result = await service.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_push',
        channel: 'push',
        region: 'RU',
        datetime: '2026-05-21T19:30:00Z',
      });

      expect(result).toEqual({ decision: 'deny', reason: 'quiet_hours' });
    });

    it('should allow transactional_push during quiet hours', async () => {
      mockPrismaService.quietHours.findUnique.mockResolvedValue(quietHours);

      const result = await service.evaluate({
        userId: 'user-1',
        notificationType: 'transactional_push',
        channel: 'push',
        region: 'RU',
        datetime: '2026-05-21T19:30:00Z',
      });

      expect(result).toEqual({ decision: 'allow', reason: 'allowed' });
    });

    it('should allow marketing_push outside quiet hours', async () => {
      mockPrismaService.quietHours.findUnique.mockResolvedValue(quietHours);

      // 10:00 UTC = 13:00 Moscow
      const result = await service.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_push',
        channel: 'push',
        region: 'RU',
        datetime: '2026-05-21T10:00:00Z',
      });

      expect(result).toEqual({ decision: 'allow', reason: 'allowed' });
    });

    it('should deny marketing_push in early morning (quiet hours cross midnight)', async () => {
      mockPrismaService.quietHours.findUnique.mockResolvedValue(quietHours);

      // 04:00 UTC = 07:00 Moscow — still within 22:00-08:00 quiet window
      const result = await service.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_push',
        channel: 'push',
        region: 'RU',
        datetime: '2026-05-21T04:00:00Z',
      });

      expect(result).toEqual({ decision: 'deny', reason: 'quiet_hours' });
    });

    it('should not check quiet hours for transactional types', async () => {
      await service.evaluate({
        userId: 'user-1',
        notificationType: 'transactional_sms',
        channel: 'sms',
        region: 'RU',
        datetime: '2026-05-21T19:30:00Z',
      });

      expect(mockPrismaService.quietHours.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('global policies', () => {
    it('should deny when global policy blocks notificationType in region', async () => {
      mockPrismaService.globalPolicy.findUnique.mockResolvedValue({
        notificationType: 'marketing_sms',
        region: 'EU',
        enabled: false,
      });

      const result = await service.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: '2026-05-21T10:00:00Z',
      });

      expect(result).toEqual({
        decision: 'deny',
        reason: 'blocked_by_global_policy',
      });
    });

    it('should allow when no global policy exists for the region', async () => {
      mockPrismaService.globalPolicy.findUnique.mockResolvedValue(null);
      mockPrismaService.userPreference.findUnique.mockResolvedValue({
        enabled: true,
      });

      const result = await service.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'US',
        datetime: '2026-05-21T10:00:00Z',
      });

      expect(result).toEqual({ decision: 'allow', reason: 'allowed' });
    });

    it('should allow when global policy explicitly enables the type in region', async () => {
      mockPrismaService.globalPolicy.findUnique.mockResolvedValue({
        notificationType: 'transactional_email',
        region: 'EU',
        enabled: true,
      });
      mockPrismaService.userPreference.findUnique.mockResolvedValue({
        enabled: true,
      });

      const result = await service.evaluate({
        userId: 'user-1',
        notificationType: 'transactional_email',
        channel: 'email',
        region: 'EU',
        datetime: '2026-05-21T10:00:00Z',
      });

      expect(result).toEqual({ decision: 'allow', reason: 'allowed' });
    });

    it('global policy takes priority over user preference', async () => {
      mockPrismaService.globalPolicy.findUnique.mockResolvedValue({
        notificationType: 'marketing_sms',
        region: 'EU',
        enabled: false,
      });
      mockPrismaService.userPreference.findUnique.mockResolvedValue({
        enabled: true,
      });

      const result = await service.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: '2026-05-21T10:00:00Z',
      });

      expect(result).toEqual({
        decision: 'deny',
        reason: 'blocked_by_global_policy',
      });

      expect(mockPrismaService.userPreference.findUnique).not.toHaveBeenCalled();
    });
  });
});
