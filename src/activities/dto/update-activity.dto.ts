import { IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateActivityDto {
  @ApiPropertyOptional({
    description: 'Activity name',
    example: 'Learn TypeScript',
  })
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @MaxLength(255, { message: 'Name cannot exceed 255 characters' })
  name?: string;
}
