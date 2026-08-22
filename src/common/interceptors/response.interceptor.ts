import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor
    implements NestInterceptor {
    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<any> {
        return next.handle().pipe(
            map((data) => {
                // Agar response allaqachon standard formatda bo'lsa
                if (
                    data &&
                    typeof data === 'object' &&
                    'success' in data
                ) {
                    return data;
                }

                return {
                    success: true,
                    message: data?.message ?? 'Request successful',
                    data:
                        data?.message !== undefined
                            ? this.removeMessage(data)
                            : data,
                };
            }),
        );
    }

    private removeMessage(data: any) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const { message, ...rest } = data;

        return rest;
    }
}