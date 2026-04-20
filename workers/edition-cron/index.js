export default {
  async scheduled(event, env, ctx) {
    const url = env.EDITION_URL || 'https://sightful.pages.dev/api/push/send-edition';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-webhook-secret': env.WEBHOOK_SECRET,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    const text = await res.text();
    console.log(`[edition-cron] ${res.status} ${text.slice(0, 200)}`);
  },
};
