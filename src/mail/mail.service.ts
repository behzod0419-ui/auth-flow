import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class MailService {
    private transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: Number(process.env.SMTP_PORT) === 465,
            family: 4,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            },
        } as SMTPTransport.Options);

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
        const missingVariables = [
            'SMTP_HOST',
            'SMTP_PORT',
            'SMTP_USER',
            'SMTP_PASSWORD',
        ].filter((name) => !process.env[name]);

        if (missingVariables.length > 0) {
            throw new Error(
                `Missing SMTP configuration: ${missingVariables.join(', ')}`,
            );
        }

        return this.transporter.sendMail({
            from: `"Auth Flow" <${process.env.SMTP_USER}>`,
            to: options.to,
            subject: options.subject,
            html: options.html,
        });
    }
}