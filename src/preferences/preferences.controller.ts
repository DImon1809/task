import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { PreferencesService } from './preferences.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Controller('users')
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get(':id/preferences')
  async getPreferences(@Param('id') id: string) {
    return this.preferencesService.getPreferences(id);
  }

  @Post(':id/preferences')
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @Param('id') id: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    await this.preferencesService.updatePreferences(id, dto);
    return this.preferencesService.getPreferences(id);
  }
}
