import { verifySmtpConnection } from '../src/lib/email.js';

try {
  await verifySmtpConnection();
  console.log('Gmail SMTP connection verified successfully.');
  process.exitCode = 0;
} catch (error) {
  console.error('Gmail SMTP verification failed:', error?.message || 'Unknown error');
  process.exitCode = 1;
}
