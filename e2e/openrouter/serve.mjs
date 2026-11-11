// The fake OpenRouter of the server's tests (fake-openrouter.ts), served for
// the end-to-end tests and the owner's preview. It runs in a container of the
// app's image with this file and the fake mounted beside each other under
// /app/openrouter; Node strips the fake's types. Its keys are sk-or-v1-good,
// sk-or-v1-broke and sk-or-v1-nolimit (fake-openrouter.ts).
//
//   FAKE_OPENROUTER_PORT      the port to listen on, inside the container
//   FAKE_OPENROUTER_DELAY_MS  how long each image takes
import { startFakeOpenRouter } from './fake-openrouter.ts';

const fake = await startFakeOpenRouter({
  host: '0.0.0.0',
  port: Number(process.env.FAKE_OPENROUTER_PORT ?? 8099),
  delayMs: Number(process.env.FAKE_OPENROUTER_DELAY_MS ?? 0),
});
console.log(`Fake OpenRouter at ${fake.baseUrl}`);

const stop = () => fake.close().then(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
