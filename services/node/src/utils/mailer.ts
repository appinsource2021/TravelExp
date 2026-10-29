import nodemailer, { type TransportOptions } from 'nodemailer'

export function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    requireTLS: true,
    auth: { type: 'LOGIN', user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { rejectUnauthorized: false },
  } as TransportOptions)
}

export async function sendVerificationCode(email: string, code: string) {
  const transporter = createTransporter()
  await transporter.verify()

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: `TravelExp Bestätigungscode: ${code}`,
    text: [
      'TravelExp Reisekosten Manager',
      '',
      `Ihr Bestätigungscode lautet: ${code}`,
      '',
      'Der Code ist 10 Minuten gültig.',
      'Falls Sie diesen Code nicht angefordert haben, ignorieren Sie diese E-Mail.',
    ].join('\n'),
  })
}
