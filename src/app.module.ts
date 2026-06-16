import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PreferencesModule } from './preferences/preferences.module';
import { EvaluateModule } from './evaluate/evaluate.module';

@Module({
  imports: [PrismaModule, PreferencesModule, EvaluateModule],
})
export class AppModule {}
