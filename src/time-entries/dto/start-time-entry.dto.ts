import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartTimeEntryDto {
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;
}
