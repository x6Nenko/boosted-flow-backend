import { IsString, IsUUID } from 'class-validator';

export class StopTimeEntryDto {
  @IsUUID('all', { message: 'Please provide a valid time entry ID' })
  @IsString()
  id: string;
}
