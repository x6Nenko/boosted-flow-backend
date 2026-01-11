import { IsISO8601, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetHeatmapQueryDto {
  @ApiPropertyOptional({
    description: 'Optional ISO 8601 timestamp/date (inclusive).',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'From date must be a valid ISO 8601 date string' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Optional ISO 8601 timestamp/date (inclusive).',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'To date must be a valid ISO 8601 date string' })
  to?: string;
}
