import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export const sendOTP = async (email: string, otp: string) => {
    const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: email,
        subject: 'Your OTP Code - DDS Validation Portal',
        html: `
            <h2>Your OTP Code</h2>
            <p>Your one-time password is: <strong>${otp}</strong></p>
            <p>This code will expire in ${process.env.OTP_EXPIRES_MINUTES || 10} minutes.</p>
            <p>If you didn't request this code, please ignore this email.</p>
        `,
    };

    await transporter.sendMail(mailOptions);
};

export const sendAccessLink = async (email: string, poNumber: string, deliveryId: string, accessUrl: string) => {
    const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: email,
        subject: 'Access Your Reference Numbers',
        html: `
            <h2>Reference Number Access</h2>
            <p>You requested access to reference numbers for:</p>
            <ul>
                <li><strong>PO Number:</strong> ${poNumber}</li>
                <li><strong>Delivery ID:</strong> ${deliveryId}</li>
            </ul>
            <p><a href="${accessUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Reference Numbers</a></p>
            <p>This link will expire in 24 hours.</p>
        `,
    };

    await transporter.sendMail(mailOptions);
};