import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StopTimeEntryDto {
  @ApiProperty()
  @IsUUID('all', { message: 'Please provide a valid time entry ID' })
  @IsString()
  id: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt({ message: 'Distraction count must be an integer' })
  @Min(0, { message: 'Distraction count must be at least 0' })
  distractionCount?: number;
}
