import { NextRequest, NextResponse } from 'next/server';
import { Invalid, NotFound } from './errors';

type Handler<Ctx> = (request: NextRequest, context: Ctx) => Promise<unknown>;

// Wrap a route handler so it returns the handler's value as JSON and maps the
// Session store's domain errors to status codes — the one place that mapping
// lives. Handlers throw Invalid / NotFound and never touch HTTP status.
export function route<Ctx>(handler: Handler<Ctx>) {
  return async (request: NextRequest, context: Ctx): Promise<NextResponse> => {
    try {
      return NextResponse.json(await handler(request, context));
    } catch (error) {
      if (error instanceof Invalid) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error instanceof NotFound) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      console.error('[route] unhandled error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
