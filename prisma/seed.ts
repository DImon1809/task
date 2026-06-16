import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultPreferences = [
  { notificationType: 'transactional_email', channel: 'email', enabled: true },
  { notificationType: 'marketing_email', channel: 'email', enabled: false },
  { notificationType: 'transactional_sms', channel: 'sms', enabled: true },
  { notificationType: 'marketing_sms', channel: 'sms', enabled: false },
  { notificationType: 'transactional_push', channel: 'push', enabled: true },
  { notificationType: 'marketing_push', channel: 'push', enabled: false },
  {
    notificationType: 'transactional_messenger',
    channel: 'messenger',
    enabled: true,
  },
  {
    notificationType: 'marketing_messenger',
    channel: 'messenger',
    enabled: false,
  },
];

const globalPolicies = [
  { notificationType: 'marketing_sms', region: 'EU', enabled: false },
  { notificationType: 'marketing_messenger', region: 'EU', enabled: false },
];

async function main() {
  console.log('Seeding default preferences...');

  for (const pref of defaultPreferences) {
    await prisma.defaultPreference.upsert({
      where: {
        notificationType_channel: {
          notificationType: pref.notificationType,
          channel: pref.channel,
        },
      },
      update: { enabled: pref.enabled },
      create: pref,
    });
  }

  console.log('Seeding global policies...');

  for (const policy of globalPolicies) {
    await prisma.globalPolicy.upsert({
      where: {
        notificationType_region: {
          notificationType: policy.notificationType,
          region: policy.region,
        },
      },
      update: { enabled: policy.enabled },
      create: policy,
    });
  }

  console.log('Seeding complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
