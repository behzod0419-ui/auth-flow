import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { MailService } from 'src/mail/mail.service';

import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

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

  async googleLogin(user: any) {
    let existingUser = await this.prisma.user.findUnique({
      where: {
        email: user.email,
      },
    });

    if (!existingUser) {
      existingUser = await this.prisma.user.create({
        data: {
          email: user.email,
          name: user.name,
          password: '',
          role: 'USER',
        },
      });
    }

    const accessToken = await this.jwtService.signAsync({
      sub: existingUser.id,
      email: existingUser.email,
      role: existingUser.role,
    });

    return {
      success: true,
      message: 'Google login successful',
      data: {
        accessToken,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          role: existingUser.role,
        },
      },
    };
  }

  async updateProfile(
    userId: number,
    updateProfileDto: UpdateProfileDto,
  ) {
    const {
      name,
      email,
      currentPassword,
      newPassword,
      confirmPassword,
    } = updateProfileDto;

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const updateData: any = {};

    // NAME
    if (name !== undefined) {
      updateData.name = name;
    }

    // EMAIL
    if (email !== undefined) {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          email,
        },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException(
          'Email already registered',
        );
      }

      updateData.email = email;
    }

    // PASSWORD
    if (
      currentPassword !== undefined ||
      newPassword !== undefined ||
      confirmPassword !== undefined
    ) {
      if (!currentPassword) {
        throw new BadRequestException(
          'Current password is required',
        );
      }

      if (!newPassword) {
        throw new BadRequestException(
          'New password is required',
        );
      }

      if (!confirmPassword) {
        throw new BadRequestException(
          'Password confirmation is required',
        );
      }

      const passwordMatch = await bcrypt.compare(
        currentPassword,
        user.password,
      );

      if (!passwordMatch) {
        throw new UnauthorizedException(
          'Current password is incorrect',
        );
      }

      if (newPassword !== confirmPassword) {
        throw new BadRequestException(
          'New passwords do not match',
        );
      }

      const hashedPassword = await bcrypt.hash(
        newPassword,
        12,
      );

      updateData.password = hashedPassword;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException(
        'No changes provided',
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
      },
    });

    return {
      message: 'Profile updated successfully',
      user: updatedUser,
    };
  }
}
