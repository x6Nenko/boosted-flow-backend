import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

@ApiTags('activities')
@ApiBearerAuth()
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) { }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateActivityDto,
  ) {
    return this.activitiesService.create(user.userId, dto.name);
  }

  @Get()
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    description: 'Include archived activities in the response',
  })
  async findAll(
    @CurrentUser() user: { userId: string },
    @Query('includeArchived') includeArchived?: string,
  ) {
    const includeArchivedBool = includeArchived === 'true';
    return this.activitiesService.findAll(user.userId, includeArchivedBool);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.activitiesService.findById(user.userId, id);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.activitiesService.update(user.userId, id, dto);
  }

  @Post(':id/archive')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async archive(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.activitiesService.archive(user.userId, id);
  }

  @Post(':id/unarchive')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async unarchive(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.activitiesService.unarchive(user.userId, id);
  }
}
