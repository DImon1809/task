import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { EvaluateService } from './evaluate.service';
import { EvaluateNotificationDto } from './dto/evaluate.dto';

@Controller('evaluate')
export class EvaluateController {
  constructor(private readonly evaluateService: EvaluateService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async evaluate(@Body() dto: EvaluateNotificationDto) {
    return this.evaluateService.evaluate(dto);
  }
}
