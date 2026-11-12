import { defaultSettings } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/accounts/users.js';
import { db, ORIGIN, PASSWORD, signedIn, startApp, steve } from './helpers.js';

describe('settings', () => {
  it('starts from the defaults and keeps what was saved', async () => {
    await steve();
    const app = await startApp();
    const headers = { cookie: `pb_session=${await signedIn(app)}`, origin: ORIGIN };
    expect((await app.inject({ url: '/api/settings', headers })).json()).toEqual(defaultSettings());

    const settings = defaultSettings();
    settings.todoTemplates['one-shot'].push('Stampare le schede');
    settings.author = 'Stefano Sibilia';
    settings.licence = 'CC-BY-NC-SA-4.0';
    settings.system = 'Kulthos';
    const put = await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: settings });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual(settings);

    // A fresh app, as after a reload or a restart.
    const again = await startApp();
    expect((await again.inject({ url: '/api/settings', headers })).json()).toEqual(settings);
  });

  it('keeps each user apart', async () => {
    await steve();
    await createUser(db, { username: 'anna', password: PASSWORD });
    const app = await startApp();
    const steveHeaders = { cookie: `pb_session=${await signedIn(app)}`, origin: ORIGIN };
    const annaHeaders = { cookie: `pb_session=${await signedIn(app, 'anna')}`, origin: ORIGIN };
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: steveHeaders,
      payload: { ...defaultSettings(), author: 'Stefano Sibilia' },
    });
    expect((await app.inject({ url: '/api/settings', headers: annaHeaders })).json().author).toBe('');
  });

  it('keeps the defaults for Generate, also when an older client leaves them out', async () => {
    await steve();
    const app = await startApp();
    const headers = { cookie: `pb_session=${await signedIn(app)}`, origin: ORIGIN };
    const put = (payload: unknown) => app.inject({ method: 'PUT', url: '/api/settings', headers, payload: payload as object });
    expect((await app.inject({ url: '/api/settings', headers })).json().imageGeneration).toEqual({ model: 'gpt', count: 2, provider: 'openrouter' });

    const saved = await put({ ...defaultSettings(), imageGeneration: { model: 'nb', count: 4 } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().imageGeneration).toEqual({ model: 'nb', count: 4, provider: 'openrouter' });

    const { imageGeneration: _left, ...older } = defaultSettings();
    const kept = await put({ ...older, author: 'Stefano Sibilia' });
    expect(kept.statusCode).toBe(200);
    expect(kept.json()).toMatchObject({ author: 'Stefano Sibilia', imageGeneration: { model: 'nb', count: 4 } });
    expect((await app.inject({ url: '/api/settings', headers })).json().imageGeneration).toEqual({ model: 'nb', count: 4, provider: 'openrouter' });

    // A row saved before image generation reads with the default.
    await db.query(`update user_settings set settings = settings - 'imageGeneration'`);
    expect((await app.inject({ url: '/api/settings', headers })).json()).toMatchObject({
      author: 'Stefano Sibilia',
      imageGeneration: { model: 'gpt', count: 2 },
    });

    for (const imageGeneration of [{ model: 'midjourney', count: 2 }, { model: 'gpt', count: 5 }, { model: 'gpt', count: 0 }, { model: 'gpt' }]) {
      const response = await put({ ...defaultSettings(), imageGeneration });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('validation_error');
    }
  });

  it('keeps the chosen provider when a client sends defaults without one (atelier-image-provider D5)', async () => {
    await steve();
    const app = await startApp();
    const headers = { cookie: `pb_session=${await signedIn(app)}`, origin: ORIGIN };
    const put = (payload: unknown) => app.inject({ method: 'PUT', url: '/api/settings', headers, payload: payload as object });
    const read = async () => (await app.inject({ url: '/api/settings', headers })).json().imageGeneration;

    const chosen = await put({ ...defaultSettings(), imageGeneration: { model: 'gpt', count: 2, provider: 'atelier' } });
    expect(chosen.statusCode).toBe(200);
    expect(chosen.json().imageGeneration).toEqual({ model: 'gpt', count: 2, provider: 'atelier' });
    expect(await read()).toEqual({ model: 'gpt', count: 2, provider: 'atelier' });

    // Defaults without a provider, as a client from before Atelier sends them.
    const older = await put({ ...defaultSettings(), imageGeneration: { model: 'nb', count: 3 } });
    expect(older.statusCode).toBe(200);
    expect(older.json().imageGeneration).toEqual({ model: 'nb', count: 3, provider: 'atelier' });
    expect(await read()).toEqual({ model: 'nb', count: 3, provider: 'atelier' });

    // Without any defaults, likewise.
    const { imageGeneration: _left, ...oldest } = defaultSettings();
    await put(oldest);
    expect(await read()).toEqual({ model: 'nb', count: 3, provider: 'atelier' });

    // A provider sent is the one kept.
    await put({ ...defaultSettings(), imageGeneration: { model: 'nb', count: 3, provider: 'openrouter' } });
    expect(await read()).toEqual({ model: 'nb', count: 3, provider: 'openrouter' });

    // A row saved before Atelier reads OpenRouter.
    await db.query(`update user_settings set settings = jsonb_set(settings, '{imageGeneration}', '{"model":"gpt","count":1}')`);
    expect(await read()).toEqual({ model: 'gpt', count: 1, provider: 'openrouter' });

    expect((await put({ ...defaultSettings(), imageGeneration: { model: 'gpt', count: 2, provider: 'flux' } })).statusCode).toBe(400);
  });

  it('refuses a body that is not a whole settings object', async () => {
    await steve();
    const app = await startApp();
    const headers = { cookie: `pb_session=${await signedIn(app)}`, origin: ORIGIN };
    const put = (payload: unknown) => app.inject({ method: 'PUT', url: '/api/settings', headers, payload: payload as object });
    const { author: _author, ...partial } = defaultSettings();
    for (const payload of [
      partial,
      { ...defaultSettings(), colour: 'blue' },
      { ...defaultSettings(), todoTemplates: { adventure: [], 'one-shot': [] } },
      { ...defaultSettings(), todoTemplates: { ...defaultSettings().todoTemplates, campaign: ['  '] } },
    ]) {
      const response = await put(payload);
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('validation_error');
    }
    expect(await db.query('select * from user_settings')).toEqual([]);
  });
});
