import { geocodeAddress } from '@/lib/mapbox';
import { route } from '@/lib/session/route';
import { Invalid, NotFound } from '@/lib/session/errors';

export const POST = route(async (request) => {
  const body = await request.json();
  const { address } = body;

  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    throw new Invalid('Address is required and must be a non-empty string');
  }

  const result = await geocodeAddress(address.trim());

  if (!result) {
    throw new NotFound('address', address.trim());
  }

  return result;
});
