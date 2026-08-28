import { describe, expect, it, vi } from 'vitest';
import { getSession, listUsers } from '@/lib/session/store';

vi.mock('@/lib/session/store', () => ({
  getSession: vi.fn(),
  listUsers: vi.fn(),
}));

// GET is imported after the mock, matching this repo's convention for testing
// a route handler directly rather than through a server.
import { GET } from './route';

const mockedGetSession = vi.mocked(getSession);
const mockedListUsers = vi.mocked(listUsers);

function ctxWithId(id: string) {
  return { params: Promise.resolve({ id }) } as never;
}

const req = {} as never;

describe('GET /api/sessions/[id]', () => {
  it('returns the session and its users', async () => {
    const session = { id: 's1', name: 'Home hunt', created_by: 'a1', search_buffer_pct: 10 };
    const users = [{ accountId: 'a1' }] as never;
    mockedGetSession.mockResolvedValueOnce(session as never);
    mockedListUsers.mockResolvedValueOnce(users);

    const res = await GET(req, ctxWithId('s1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ session, users });
  });

  // getSession and listUsers don't depend on each other's result, so they
  // must be fetched concurrently rather than one after the other. A
  // deliberately delayed getSession proves this: if the handler awaited
  // getSession before calling listUsers, listUsers would only be invoked
  // after getSession resolves. Under Promise.all, listUsers is invoked
  // immediately, well before getSession's delayed resolution.
  it('fetches the session and the users concurrently', async () => {
    let getSessionResolvedAt = 0;
    let listUsersCalledAt = 0;

    mockedGetSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            getSessionResolvedAt = Date.now();
            resolve({
              id: 's1',
              name: null,
              created_by: null,
              search_buffer_pct: 0,
            } as never);
          }, 20);
        })
    );
    mockedListUsers.mockImplementationOnce(() => {
      listUsersCalledAt = Date.now();
      return Promise.resolve([] as never);
    });

    await GET(req, ctxWithId('s1'));

    expect(listUsersCalledAt).toBeGreaterThan(0);
    expect(getSessionResolvedAt).toBeGreaterThan(0);
    expect(listUsersCalledAt).toBeLessThan(getSessionResolvedAt);
  });
});
