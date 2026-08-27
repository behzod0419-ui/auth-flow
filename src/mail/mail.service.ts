import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
    private transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            },
        });

        this.transporter.verify((error, success) => {
            if (error) {
                console.error('❌ SMTP CONNECTION ERROR:', error);
            } else {
                console.log('✅ SMTP SERVER IS READY');
            }
        });
    }

    async sendVerificationEmail(
        email: string,
        name: string,
        token: string,
    ) {
        const verificationUrl =
            `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

        await this.transporter.sendMail({
            from: `"Auth Flow" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'Verify your email',
            html: `
                <h2>Hello ${name}!</h2>

                <p>
                    Thank you for registering.
                    Please veriy your email address.
                </p>

                <p>
                    <a href="${verificationUrl}">
                        Verify Email
                    </a>
                </p>

                <p>
                    This link will expire in 15 minutes.
                </p>
            `,
        });
    }

    async sendMail(options: {
        to: string;
        subject: string;
        html: string;
    }) {
        return this.transporter.sendMail({
            from: `"Auth Flow" <${process.env.SMTP_USER}>`,
            to: options.to,
            subject: options.subject,
            html: options.html,
        });
    }

    async sendPasswordResetEmail(
        email: string,
        name: string,
        resetUrl: string,
    ) {
        return this.sendMail({
            to: email,
            subject: 'Reset your password',
            html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: Arial, sans-serif;">

            <h2>Password Reset</h2>

            <p>Hello ${name},</p>

            <p>
              We received a request to reset your password.
            </p>

            <p>
              Click the button below to create a new password:
            </p>

            <a
              href="${resetUrl}"
              style="
                display: inline-block;
                padding: 12px 20px;
                background-color: #2563eb;
                color: white;
                text-decoration: none;
                border-radius: 6px;
              "
            >
              Reset Password
            </a>

            <p>
              This link will expire in 15 minutes.
            </p>

            <p>
              If you did not request this password reset,
              you can safely ignore this email.
            </p>

          </body>
        </html>
      `,
        });
    }
}