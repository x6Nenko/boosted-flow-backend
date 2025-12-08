import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetTimeEntriesQueryDto } from './dto/get-time-entries-query.dto';
import { StartTimeEntryDto } from './dto/start-time-entry.dto';
import { StopTimeEntryDto } from './dto/stop-time-entry.dto';
import { TimeEntriesService } from './time-entries.service';

@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Post('start')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async start(
    @CurrentUser() user: { sub: string; email: string },
    @Body() dto: StartTimeEntryDto,
  ) {
    return this.timeEntriesService.start(user.sub, dto.description);
  }

  @Post('stop')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async stop(
    @CurrentUser() user: { sub: string; email: string },
    @Body() dto: StopTimeEntryDto,
  ) {
    return this.timeEntriesService.stop(user.sub, dto.id);
  }

  @Get()
  async findAll(
    @CurrentUser() user: { sub: string; email: string },
    @Query() query: GetTimeEntriesQueryDto,
  ) {
    return this.timeEntriesService.findAll(user.sub, query.from, query.to);
  }

  @Get('current')
  async findCurrent(@CurrentUser() user: { sub: string; email: string }) {
    const entry = await this.timeEntriesService.findActive(user.sub);
    // Wrap in object to ensure proper JSON serialization
    return { entry };
  }
}
