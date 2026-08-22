import { CanActivate, ExecutionContext, ForbiddenException, Injectable, } from "@nestjs/common";
import { Reflector } from '@nestjs/core';

import { ROLES_KEY, } from "src/auth/decorators/roles.decorators";
import { Role } from "src/auth/enums/roles.enums";

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflactor: Reflector,) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflactor.getAllAndOverride<Role[]>(
            ROLES_KEY,
            [
                context.getHandler(),
                context.getClass(),
            ]
        );

        const request = context.switchToHttp().getRequest();

        const user = request.user;

        if (!user) {
            throw new ForbiddenException('User not found');
        }

        if (!requiredRoles.includes(user.role)) {
            throw new ForbiddenException('You do not have permission to access this resource',);
        }

        return true;
    }
}