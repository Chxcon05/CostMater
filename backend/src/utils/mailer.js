import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });
  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const transport = getTransporter();
  if (!transport) return false;
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || `CostMaster <${process.env.SMTP_USER || 'noreply@costmaster.local'}>`,
      to,
      subject,
      html,
      text
    });
    return true;
  } catch (error) {
    console.error('Error al enviar correo:', error.message);
    return false;
  }
}

export function isEmailConfigured() {
  return !!process.env.SMTP_HOST;
}
