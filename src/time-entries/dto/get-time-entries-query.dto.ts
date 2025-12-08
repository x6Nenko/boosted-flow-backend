import { IsISO8601, IsOptional } from 'class-validator';

export class GetTimeEntriesQueryDto {
  @IsOptional()
  @IsISO8601({}, { message: 'From date must be a valid ISO 8601 date string' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'To date must be a valid ISO 8601 date string' })
  to?: string;
}
