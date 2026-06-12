export interface PropertyListing {
  /** Database id — present on rows read back from Supabase, absent on freshly scraped ones */
  id?: string;
  source: 'immoweb' | 'zimmo' | 'realo' | 'immovlan' | 'immoscoop';
  external_id: string;
  url: string;
  title?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  price?: number;
  property_type?: 'house' | 'apartment' | 'land' | 'other';
  bedrooms?: number;
  surface_area?: number;
  land_area?: number;
  image_url?: string;
  scraped_at?: string;
  /** Set once when the listing first appears in the DB; never updated by upserts */
  first_seen_at?: string;
  /** The price before the most recent change, if it ever changed */
  previous_price?: number | null;
  price_changed_at?: string | null;
  /** 'exact' = source coords or street-level geocode; 'approximate' = postcode centroid */
  location_precision?: 'exact' | 'approximate';
}
