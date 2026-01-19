import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetTimeEntriesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({}, { message: 'From date must be a valid ISO 8601 date string' })
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({}, { message: 'To date must be a valid ISO 8601 date string' })
  to?: string;

  @ApiPropertyOptional({
    description: 'Filter time entries by activity ID',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Activity ID must be a valid UUID' })
  activityId?: string;
}
