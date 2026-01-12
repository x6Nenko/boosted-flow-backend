import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ActivityTasksService } from './activity-tasks.service';
import { CreateActivityTaskDto, UpdateActivityTaskDto } from './dto';

@ApiTags('activity-tasks')
@ApiBearerAuth()
@Controller('activities/:activityId/tasks')
export class ActivityTasksController {
  constructor(private readonly activityTasksService: ActivityTasksService) { }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async create(
    @CurrentUser() user: { userId: string },
    @Param('activityId') activityId: string,
    @Body() dto: CreateActivityTaskDto,
  ) {
    return this.activityTasksService.create(user.userId, activityId, dto.name);
  }

  @Get()
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    description: 'Include archived tasks in the response',
  })
  async findAll(
    @CurrentUser() user: { userId: string },
    @Param('activityId') activityId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const includeArchivedBool = includeArchived === 'true';
    return this.activityTasksService.findAllForActivity(
      user.userId,
      activityId,
      includeArchivedBool,
    );
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.activityTasksService.findById(user.userId, id);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateActivityTaskDto,
  ) {
    return this.activityTasksService.update(user.userId, id, dto);
  }

  @Post(':id/archive')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async archive(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.activityTasksService.archive(user.userId, id);
  }

  @Post(':id/unarchive')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async unarchive(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.activityTasksService.unarchive(user.userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async delete(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    await this.activityTasksService.delete(user.userId, id);
  }
}
