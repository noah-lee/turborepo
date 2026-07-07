import type { FastifyBaseLogger } from 'fastify';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

// The seam: everything that sends mail depends on this interface, not on a
// concrete provider. Decorated onto the Fastify instance as `app.email`.
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

// Default provider: logs instead of sending, so a fresh clone needs no mail
// account. Swap in a real provider (Resend/Postmark/SES) by implementing
// EmailProvider and returning it here — nothing else changes. Example:
//
//   import { Resend } from 'resend';
//   const resend = new Resend(process.env.RESEND_API_KEY);
//   return {
//     async send({ to, subject, text, html }) {
//       await resend.emails.send({ from, to, subject, text, html });
//     },
//   };
export function createEmailProvider(opts: {
  log: FastifyBaseLogger;
  from: string;
}): EmailProvider {
  return {
    async send(message) {
      opts.log.info(
        { from: opts.from, to: message.to, subject: message.subject },
        'email not sent (console provider) — configure a real EmailProvider',
      );
    },
  };
}
