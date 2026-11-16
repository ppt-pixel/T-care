export function assertLocalPaymentTestDatabase(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== 'localhost' ||
    Number(url.port) !== 55432 ||
    url.pathname !== '/tcare_payment_test' ||
    decodeURIComponent(url.username) !== 'tcare_payment_test'
  ) {
    throw new Error('Refusing to seed: DATABASE_URL is not the expected local payment test database.');
  }

  return url;
}
