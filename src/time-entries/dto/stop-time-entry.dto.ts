import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StopTimeEntryDto {
  @ApiProperty()
  @IsUUID('all', { message: 'Please provide a valid time entry ID' })
  @IsString()
  id: string;
}
