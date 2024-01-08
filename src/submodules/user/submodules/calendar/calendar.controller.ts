import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { UserEntity } from '@opize/calendar2notion-object';

import { Auth } from '../../decorator/auth.decorator';
import { User } from '../../decorator/user.decorator';

import { UserCalendarService } from './calendar.service';
import { AddCalendarDto } from './dto/add-calendar.dto';

@Controller('users/:userId/calendar')
@Auth()
export class UserCalendarController {
    constructor(private readonly userCalendarService: UserCalendarService) {}

    @Post(':calendarId/rename')
    async renameCalendar(
        @User() user: UserEntity,
        @Param('calendarId') calendarId: string,
    ) {
        return await this.userCalendarService.renameCalendar(user, +calendarId);
    }

    @Post('')
    async addCalendar(
        @User() user: UserEntity,
        @Body() addCalendarDto: AddCalendarDto,
    ) {
        return await this.userCalendarService.addCalendar(user, addCalendarDto);
    }

    @Delete(':calendarId')
    async removeCalendar(
        @User() user: UserEntity,
        @Param('calendarId') calendarId: string,
    ) {
        return await this.userCalendarService.removeCalendar(user, +calendarId);
    }
}
