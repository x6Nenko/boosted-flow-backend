import { IsISO8601, IsOptional } from 'class-validator';
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

  @ApiPropertyOptional()
  @IsOptional()
  activityId?: string;
}
