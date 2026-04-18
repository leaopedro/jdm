export type VerificationMail = { to: string; subject: string; html: string };
export type ResetMail = VerificationMail;

export const verificationMail = (to: string, link: string): VerificationMail => ({
  to,
  subject: 'JDM Experience — verifique seu e-mail',
  html: `
    <p>Olá!</p>
    <p>Clique no link abaixo para confirmar seu e-mail. Ele expira em 24h.</p>
    <p><a href="${link}">${link}</a></p>
    <p>Se você não criou a conta, ignore este e-mail.</p>
  `,
});

export const resetMail = (to: string, link: string): ResetMail => ({
  to,
  subject: 'JDM Experience — redefinição de senha',
  html: `
    <p>Recebemos um pedido para redefinir sua senha.</p>
    <p>Clique no link abaixo (expira em 1h):</p>
    <p><a href="${link}">${link}</a></p>
    <p>Se você não solicitou, ignore este e-mail.</p>
  `,
});
