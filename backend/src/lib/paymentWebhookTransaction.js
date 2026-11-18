export async function runWebhookTransaction({ run, eventExists }) {
  try {
    return await run();
  } catch (error) {
    if (error?.code !== 'P2002' || !await eventExists()) throw error;
    return { duplicate: true };
  }
}
