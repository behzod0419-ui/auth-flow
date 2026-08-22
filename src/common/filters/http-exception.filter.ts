import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
} from '@nestjs/common';

import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter
    implements ExceptionFilter {
    catch(
        exception: unknown,
        host: ArgumentsHost,
    ) {
        const context = host.switchToHttp();

        const response =
            context.getResponse<Response>();

        const request =
            context.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;

        let message = 'Internal server error';

        let details: string[] | undefined;

        if (exception instanceof HttpException) {
            status = exception.getStatus();

            const exceptionResponse =
                exception.getResponse();

            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            } else if (
                typeof exceptionResponse === 'object' &&
                exceptionResponse !== null
            ) {
                const errorResponse =
                    exceptionResponse as any;

                if (Array.isArray(errorResponse.message)) {
                    details = errorResponse.message;
                    message = 'Validation failed';
                } else {
                    message =
                        errorResponse.message ??
                        'Request failed';
                }
            }
        }

        const errorResponse: any = {
            success: false,
            message,
            error:
                this.getErrorName(status),
            statusCode: status,
            path: request.url,
            timestamp: new Date().toISOString(),
        };

        if (details) {
            errorResponse.details = details;
        }

        response
            .status(status)
            .json(errorResponse);
    }

    private getErrorName(status: number): string {
        const errors: Record<number, string> = {
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            409: 'Conflict',
            422: 'Unprocessable Entity',
            500: 'Internal Server Error',
        };

        return (
            errors[status] ??
            'Error'
        );
    }
}