import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
    CalendarEntity,
    EventEntity,
    UserEntity,
} from '@opize/calendar2notion-object';
import { calendar_v3 } from 'googleapis';
import { GoogleCalendarClient } from 'src/common/api-client/googleCalendar.client';
import { getGoogleCalendarTokensByUser } from 'src/common/api-client/googleCalendarToken';
import { NotionClient } from 'src/common/api-client/notion.client';
import { Not, Repository } from 'typeorm';

import { AddCalendarDto } from './dto/add-calendar.dto';

@Injectable()
export class UserCalendarService {
    constructor(
        @InjectRepository(UserEntity)
        private usersRepository: Repository<UserEntity>,
        @InjectRepository(CalendarEntity)
        private calendarsRepository: Repository<CalendarEntity>,
        @InjectRepository(EventEntity)
        private eventsRepository: Repository<EventEntity>,
    ) {}

    async addCalendar(user: UserEntity, addCalendarDto: AddCalendarDto) {
        const googleCalendar = await this.getCalendar(
            user,
            addCalendarDto.googleCalendarId,
        );

        // 동일한 이름의 캘린더 거부
        const sameNameCalendar = await this.calendarsRepository.findOne({
            where: [
                {
                    userId: user.id,
                    googleCalendarName: googleCalendar.summary,
                    status: 'CONNECTED',
                },
                {
                    userId: user.id,
                    googleCalendarName: googleCalendar.summary,
                    status: 'PENDING',
                },
            ],
        });

        if (sameNameCalendar) {
            throw new BadRequestException({
                code: 'same_name_calendar_exist',
            });
        }

        const oldCalendar = await this.calendarsRepository.findOne({
            where: {
                userId: user.id,
                googleCalendarId: addCalendarDto.googleCalendarId,
            },
        });

        if (
            oldCalendar &&
            (oldCalendar.status === 'CONNECTED' ||
                oldCalendar.status === 'PENDING')
        ) {
            throw new BadRequestException({
                code: 'calendar_already_exist',
            });
        }

        if (
            !oldCalendar ||
            (oldCalendar && oldCalendar.status === 'DISCONNECTED')
        ) {
            const calendar = CalendarEntity.create({
                accessRole:
                    googleCalendar.accessRole as CalendarEntity['accessRole'],
                googleCalendarId: googleCalendar.id,
                googleCalendarName: googleCalendar.summary,
                user: user,
            });

            await this.calendarsRepository.save(calendar);
        } else {
            const calendar = oldCalendar;
            calendar.accessRole = googleCalendar.accessRole as
                | 'none'
                | 'freeBusyReader'
                | 'reader'
                | 'writer'
                | 'owner';
            calendar.googleCalendarId = googleCalendar.id;
            calendar.googleCalendarName = googleCalendar.summary;
            calendar.status = 'PENDING';
            calendar.user = user;
            await this.calendarsRepository.save(calendar);
        }

        return;
    }

    async removeCalendar(user: UserEntity, calendarId: number) {
        const calendar = await this.calendarsRepository.findOne({
            where: {
                id: calendarId,
                userId: user.id,
                status: Not('DISCONNECTED'),
            },
        });

        if (!calendar)
            throw new NotFoundException({
                code: 'calendar_not_found',
            });

        if (user.isWork) {
            return {
                code: 'user_is_work',
            };
        }

        await this.eventsRepository.update(
            {
                calendar: calendar,
                userId: user.id,
            },
            {
                willRemove: true,
            },
        );

        calendar.status = 'DISCONNECTED';
        await this.calendarsRepository.save(calendar);

        return;
    }

    async renameCalendar(user: UserEntity, calendarId: number) {
        const calendar = await this.calendarsRepository.findOne({
            where: {
                id: calendarId,
                userId: user.id,
            },
        });

        const googleCalendar = await this.getCalendar(
            user,
            calendar.googleCalendarId,
        );

        // 이미 캘린더 이름이 같을 경우
        if (calendar.googleCalendarName === googleCalendar.summary) {
            return {
                code: 'already_same_name',
            };
        }

        // 노션 속성이 변경되었는지 확인
        const notionClient = new NotionClient(
            user.notionWorkspace.accessToken || user.notionAccessToken,
        );
        const notionDatabase = await notionClient.getDatabase(
            user.notionDatabaseId,
        );
        if (!notionDatabase) {
            throw new BadRequestException({
                code: 'notion_database_not_found',
                message: '노션 데이터베이스를 찾을 수 없어요.',
            });
        }

        const calendarProp = Object.values(notionDatabase.properties).find(
            (prop) => prop.id === user.parsedNotionProps.calendar,
        );
        if (!calendarProp) {
            console.log(notionDatabase.properties);
            console.log('==============');
            console.log(user.parsedNotionProps);
            throw new BadRequestException({
                code: 'calendar_prop_not_found',
                message: '캘린더 속성을 찾을 수 없어요.',
            });
        }
        if (calendarProp.type !== 'select') {
            throw new BadRequestException({
                code: 'wrong_calendar_prop_type',
                message: '캘린더 속성이 올바르지 않아요',
            });
        }

        if (
            !calendarProp.select.options.some(
                (e) => e.name === googleCalendar.summary,
            )
        ) {
            throw new BadRequestException({
                code: 'calendar_name_not_match',
                message: '캘린더 이름이 일치하지 않아요',
            });
        }

        await this.calendarsRepository.update(
            {
                id: calendarId,
                userId: user.id,
            },
            {
                googleCalendarName: googleCalendar.summary,
            },
        );
        return {
            code: 'calendar_name_changed',
        };
    }

    async getCalendar(user: UserEntity, googleCalendarId: string) {
        const tokens = getGoogleCalendarTokensByUser(user);

        const googleClient = new GoogleCalendarClient(
            tokens.accessToken,
            tokens.refreshToken,
            tokens.callbackUrl,
        );

        let googleCalendar: calendar_v3.Schema$CalendarListEntry;
        try {
            googleCalendar = (await googleClient.getCalendar(googleCalendarId))
                .data;
        } catch (err) {
            if (err.code === 404)
                throw new NotFoundException({
                    code: 'calendar_not_found',
                });

            console.error(err);
            throw new InternalServerErrorException({
                code: `google_calendar_api_error_${err.code}`,
            });
        }

        return googleCalendar;
    }
}
