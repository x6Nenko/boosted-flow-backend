import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTimeEntryDto {
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

  @ApiPropertyOptional({
    description: 'Tag IDs to attach to this entry (max 3)',
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'Tag IDs must be an array' })
  @ArrayMaxSize(3, { message: 'Cannot have more than 3 tags' })
  @IsUUID('all', { each: true, message: 'Each tag ID must be a valid UUID' })
  tagIds?: string[];

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt({ message: 'Distraction count must be an integer' })
  @Min(0, { message: 'Distraction count must be at least 0' })
  distractionCount?: number;
}
