import { NextRequest, NextResponse } from 'next/server';
import { Invalid, NotFound, Unauthorized } from './errors';

type Handler<Ctx> = (request: NextRequest, context: Ctx) => Promise<unknown>;

// Wrap a route handler so it returns the handler's value as JSON and maps the
// Session store's domain errors to status codes — the one place that mapping
// lives. Handlers throw Invalid / NotFound and never touch HTTP status.
export function route<Ctx>(handler: Handler<Ctx>) {
  return async (request: NextRequest, context: Ctx): Promise<NextResponse> => {
    try {
      return NextResponse.json(await handler(request, context));
    } catch (error) {
      if (error instanceof Unauthorized) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error instanceof Invalid) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error instanceof NotFound) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      // Supabase errors are plain objects whose fields are not enumerable the
      // way console.error expects, so logging them directly prints "{}" and
      // leaves a 500 with nothing to debug from. Pull the fields out by name.
      const e = error as { message?: string; code?: string; details?: string; hint?: string };
      console.error('[route] unhandled error:', {
        message: e?.message ?? String(error),
        code: e?.code,
        details: e?.details,
        hint: e?.hint,
      });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
