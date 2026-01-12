import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TagsService } from './tags.service';
import { GetOrCreateTagsDto } from './dto';

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) { }

  @Get()
  async findAll(@CurrentUser() user: { userId: string }) {
    return this.tagsService.findAll(user.userId);
  }

  @Post('get-or-create')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getOrCreate(
    @CurrentUser() user: { userId: string },
    @Body() dto: GetOrCreateTagsDto,
  ) {
    return this.tagsService.getOrCreate(user.userId, dto.names);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async delete(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    await this.tagsService.delete(user.userId, id);
  }
}
