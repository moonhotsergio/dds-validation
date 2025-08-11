import nodemailer from 'nodemailer';

// Check if SMTP is properly configured
const isSMTPConfigured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.FROM_EMAIL;

let transporter: nodemailer.Transporter | null = null;

if (isSMTPConfigured) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
} else {
    console.warn('⚠️  SMTP not configured. Email functionality will be disabled.');
    console.warn('   Set SMTP_HOST, SMTP_USER, SMTP_PASS, and FROM_EMAIL environment variables to enable email.');
}

export const sendOTP = async (email: string, otp: string, type: string = 'otp') => {
    if (!transporter) {
        console.warn(`📧 Email not sent to ${email} - SMTP not configured`);
        return;
    }

    try {
        if (type === 'supplier-link') {
            // Send supplier link email
            const mailOptions = {
                from: process.env.FROM_EMAIL,
                to: email,
                subject: 'Your Supplier Portal Access Link - DDS Validation Portal',
                html: `
                    <h2>Welcome to the DDS Validation Portal</h2>
                    <p>You have been granted access to submit reference numbers through our supplier portal.</p>
                    <p><a href="${otp}" style="background-color: #000000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; display: inline-block; margin: 20px 0;">Access Supplier Portal</a></p>
                    <p>This link will remain active until the expiration date set by your administrator.</p>
                    <p>If you have any questions, please contact your administrator.</p>
                `,
            };
            await transporter.sendMail(mailOptions);
            console.log(`✅ Supplier link email sent to ${email}`);
        } else {
            // Send regular OTP email
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
            console.log(`✅ OTP email sent to ${email}`);
        }
    } catch (error) {
        console.error(`❌ Failed to send email to ${email}:`, error);
        throw error;
    }
};

export const sendAccessLink = async (email: string, poNumber: string, deliveryId: string, accessUrl: string) => {
    if (!transporter) {
        console.warn(`📧 Email not sent to ${email} - SMTP not configured`);
        return;
    }

    try {
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
        console.log(`✅ Access link email sent to ${email}`);
    } catch (error) {
        console.error(`❌ Failed to send access link email to ${email}:`, error);
        throw error;
    }
};