import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetOrCreateTagsDto {
  @ApiProperty({
    description: 'Tag names to get or create',
    example: ['urgent', 'review'],
  })
  @IsArray({ message: 'Names must be an array' })
  @ArrayMaxSize(3, { message: 'Cannot have more than 3 tags' })
  @IsString({ each: true, message: 'Each name must be a string' })
  @MaxLength(50, { each: true, message: 'Each name cannot exceed 50 characters' })
  names: string[];
}
