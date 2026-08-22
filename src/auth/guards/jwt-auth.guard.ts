import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt"
import { Request } from "express";
import { Observable } from "rxjs";

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();

        const authHeader = request.headers.authorization;

        if (!authHeader) {
            throw new UnauthorizedException('Authorization header is required',);
        }

        const [type, token] = authHeader.split(' ');

        if (type !== 'Bearer' || !token) {
            throw new UnauthorizedException('Invalid authorization format',);
        }

        try {
            const payload = this.jwtService.verify(token, {
                secret: process.env.JWT_ACCESS_SECRET,
            });

            request.user = payload as any;

            return true;
        } catch {
            throw new UnauthorizedException('Invalid or expired access token',);
        }
    }
}