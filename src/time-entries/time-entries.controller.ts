import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetTimeEntriesQueryDto } from './dto/get-time-entries-query.dto';
import { StartTimeEntryDto } from './dto/start-time-entry.dto';
import { StopTimeEntryDto } from './dto/stop-time-entry.dto';
import { TimeEntriesService } from './time-entries.service';

@ApiTags('time-entries')
@ApiBearerAuth()
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) { }

  @Post('start')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async start(
    @CurrentUser() user: { userId: string },
    @Body() dto: StartTimeEntryDto,
  ) {
    return this.timeEntriesService.start(user.userId, dto.description);
  }

  @Post('stop')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async stop(
    @CurrentUser() user: { userId: string },
    @Body() dto: StopTimeEntryDto,
  ) {
    return this.timeEntriesService.stop(user.userId, dto.id);
  }

  @Get()
  async findAll(
    @CurrentUser() user: { userId: string },
    @Query() query: GetTimeEntriesQueryDto,
  ) {
    return this.timeEntriesService.findAll(user.userId, query.from, query.to);
  }

  @Get('current')
  async findCurrent(@CurrentUser() user: { userId: string }) {
    const entry = await this.timeEntriesService.findActive(user.userId);
    // Wrap in object to ensure proper JSON serialization
    return { entry };
  }
}
