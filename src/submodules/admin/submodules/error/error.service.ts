import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ErrorLogEntity } from '@opize/calendar2notion-object';
import { Repository } from 'typeorm';

import { GetErrorsResDto } from './dto/getErrors.res.dto';

@Injectable()
export class AdminErrorService {
    constructor(
        @InjectRepository(ErrorLogEntity)
        private readonly errorLogRepository: Repository<ErrorLogEntity>,
    ) {}

    async getErrors(
        page: number,
        pageSize: number,
        where?: {
            userId?: number;
            errorCode?: string;
            isUserConnected?: boolean;
        },
    ) {
        const errors = await this.errorLogRepository.find({
            where: {
                user: {
                    id: where?.userId,
                    isConnected: where?.isUserConnected,
                },
                code: where?.errorCode,
            },
            order: {
                createdAt: {
                    direction: 'DESC',
                },
            },
            take: pageSize,
            skip: (page - 1) * pageSize,
            relations: ['user'],
        });

        return new GetErrorsResDto(errors);
    }

    async deleteError(errorId: number) {
        await this.errorLogRepository.delete({
            id: errorId,
        });
    }
}
