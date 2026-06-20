import { describe, expect, it, vi } from 'vitest';
import { route } from './route';
import { Invalid, NotFound } from './errors';

const req = {} as never;
const ctx = {} as never;

describe('route', () => {
  it('returns the handler value as JSON with 200', async () => {
    const res = await route(async () => ({ ok: true }))(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('maps Invalid to 400', async () => {
    const res = await route(async () => {
      throw new Invalid('reaction must be love or veto');
    })(req, ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'reaction must be love or veto' });
  });

  it('maps NotFound to 404', async () => {
    const res = await route(async () => {
      throw new NotFound('session', 's1');
    })(req, ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'session not found: s1' });
  });

  it('maps unknown errors to 500 without leaking the message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await route(async () => {
      throw new Error('boom');
    })(req, ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
