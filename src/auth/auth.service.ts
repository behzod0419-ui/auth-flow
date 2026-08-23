import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { MailService } from 'src/mail/mail.service';

import { PrismaService } from './prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) { }

  private generateVerificationToken(): string {
    return randomBytes(32).toString('hex');
  }

  async register(registerDto: RegisterDto) {
    const { name, email, password } = registerDto;

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const verificationToken = this.generateVerificationToken();


    const hashedVerificationToken = await bcrypt.hash(
      verificationToken,
      12,
    );


    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,

        emailVerified: false,

        verificationToken: hashedVerificationToken,

        verificationTokenExpiresAt: new Date(
          Date.now() + 15 * 60 * 1000,
        ),
      },
    });

    await this.mailService.sendVerificationEmail(
      user.email,
      user.name,
      verificationToken,
    );

    return {
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password,
    );

    if (!passwordMatch) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN as JwtSignOptions['expiresIn'],
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
      },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN as JwtSignOptions['expiresIn'],
      },
    );

    const refreshTokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        refreshTokenHash,
      },
    });

    return {
      message: 'Login successful',

      accessToken,

      refreshToken,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        verified: user.emailVerified,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException(
        'Refresh token is required',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync(
        refreshToken,
        {
          secret: process.env.JWT_REFRESH_SECRET,
        },
      );

      const user = await this.prisma.user.findUnique({
        where: {
          id: payload.sub,
        },
      });

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException(
          'Invalid refresh token',
        );
      }

      const refreshTokenMatches = await bcrypt.compare(
        refreshToken,
        user.refreshToken,
      );

      if (!refreshTokenMatches) {
        throw new UnauthorizedException(
          'Invalid refresh token',
        );
      }

      const newPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };

      const accessToken = await this.jwtService.signAsync(
        newPayload,
        {
          secret: process.env.JWT_ACCESS_SECRET,
          expiresIn: '15m',
        },
      );

      const newRefreshToken =
        await this.jwtService.signAsync(
          newPayload,
          {
            secret: process.env.JWT_REFRESH_SECRET,
            expiresIn: '7d',
          },
        );

      const hashedRefreshToken = await bcrypt.hash(
        newRefreshToken,
        12,
      );

      await this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          refreshToken: hashedRefreshToken,
        },
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
      };
    } catch {
      throw new UnauthorizedException(
        'Invalid refresh token',
      );
    }
  }

  async logout(userId: number) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    if (!user) {
      throw new UnauthorizedException(
        'User not found',
      );
    }

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        refreshTokenHash: null,
      },
    });

    return {
      message: 'Logout successful',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!token || !newPassword) {
      throw new BadRequestException(
        'Token and new password are required',
      );
    }

    const users = await this.prisma.user.findMany({
      where: {
        resetPasswordToken: {
          not: null,
        },
      },
    });

    let matchedUser: (typeof users)[number] | null = null;

    for (const user of users) {
      if (
        user.resetPasswordToken &&
        (await bcrypt.compare(
          token,
          user.resetPasswordToken,
        ))
      ) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      throw new UnauthorizedException(
        'Invalid or expired reset token',
      );
    }

    if (
      !matchedUser.resetPasswordTokenExpiresAt ||
      matchedUser.resetPasswordTokenExpiresAt < new Date()
    ) {
      throw new UnauthorizedException(
        'Reset token has expired',
      );
    }

    const hashedPassword = await bcrypt.hash(
      newPassword,
      10,
    );

    await this.prisma.user.update({
      where: {
        id: matchedUser.id,
      },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordTokenExpiresAt: null,
      },
    });

    return {
      success: true,
      message: 'Password reset successfully',
    };
  }

  private async hashToken(token: string): Promise<string> {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }

  async refreshAccessToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.prisma.user.findUnique({
        where: {
          id: payload.sub,
        },
      });

      if (!user || !user.refreshTokenHash) {
        throw new UnauthorizedException(
          'Invalid refresh token',
        );
      }

      const refreshTokenHash = await this.hashToken(
        refreshToken,
      );

      if (refreshTokenHash !== user.refreshTokenHash) {
        throw new UnauthorizedException(
          'Invalid refresh token',
        );
      }

      const accessToken = this.jwtService.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
        },
        {
          secret: process.env.JWT_ACCESS_SECRET,
          expiresIn: process.env.JWT_ACCESS_EXPIRES_IN as JwtSignOptions['expiresIn'],
        },
      );

      return {
        accessToken,
      };
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired refresh token',
      );
    }
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      user,
    };
  }

  async verifyEmail(token: string) {
    if (!token) {
      throw new UnauthorizedException('Verification token is required');
    }

    const users = await this.prisma.user.findMany({
      where: {
        verificationToken: {
          not: null,
        },
      },
    });

    let matchedUser: (typeof users)[number] | null = null;

    for (const user of users) {
      if (
        user.verificationToken &&
        (await bcrypt.compare(token, user.verificationToken))
      ) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      throw new UnauthorizedException('Invalid verification token');
    }

    if (
      !matchedUser.verificationTokenExpiresAt ||
      matchedUser.verificationTokenExpiresAt < new Date()
    ) {
      throw new UnauthorizedException('Verification token has expired');
    }

    await this.prisma.user.update({
      where: {
        id: matchedUser.id,
      },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
      },
    });

    return {
      success: true,
      message: 'Email verified successfully',
    };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return {
        success: true,
        message: 'If this email exists, a password reset link has been sent',
      };
    }

    const resetToken = randomBytes(32).toString('hex');

    const hashedToken = await bcrypt.hash(resetToken, 10);

    const expiresAt = new Date(
      Date.now() + 15 * 60 * 1000,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedToken,
        resetPasswordTokenExpiresAt: expiresAt,
      },
    });

    const resetUrl =
      `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    await this.mailService.sendPasswordResetEmail(
      user.email,
      user.name,
      resetUrl,
    );

    return {
      success: true,
      message: 'If this email exists, a password reset link has been sent',
    };
  }
}
