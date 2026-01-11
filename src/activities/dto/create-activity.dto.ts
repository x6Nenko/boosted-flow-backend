import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateActivityDto {
  @ApiProperty({ description: 'Activity name', example: 'Learn TypeScript' })
  @IsString({ message: 'Name must be a string' })
  @MaxLength(255, { message: 'Name cannot exceed 255 characters' })
  name: string;
}
