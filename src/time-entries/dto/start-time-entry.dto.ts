import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartTimeEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @ApiProperty({ description: 'Activity ID to track time against' })
  @IsUUID('all', { message: 'Invalid activity ID' })
  activityId: string;
}
