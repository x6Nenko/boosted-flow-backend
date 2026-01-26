import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateManualTimeEntryDto {
  @ApiProperty({ description: 'Activity ID to track time against' })
  @IsUUID('all', { message: 'Invalid activity ID' })
  activityId: string;

  @ApiProperty({ description: 'Start time in ISO 8601 format' })
  @IsISO8601({}, { message: 'startedAt must be a valid ISO 8601 date' })
  startedAt: string;

  @ApiProperty({ description: 'Stop time in ISO 8601 format' })
  @IsISO8601({}, { message: 'stoppedAt must be a valid ISO 8601 date' })
  stoppedAt: string;

  @ApiPropertyOptional({ description: 'Task ID within the activity' })
  @IsOptional()
  @IsUUID('all', { message: 'Invalid task ID' })
  taskId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt({ message: 'Rating must be an integer' })
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating must be at most 5' })
  rating?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString({ message: 'Comment must be a string' })
  @MaxLength(1000, { message: 'Comment cannot exceed 1000 characters' })
  comment?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt({ message: 'Distraction count must be an integer' })
  @Min(0, { message: 'Distraction count must be at least 0' })
  distractionCount?: number;
}
