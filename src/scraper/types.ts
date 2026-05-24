export interface PropertyListing {
  source: 'immoweb' | 'zimmo' | 'realo' | 'immovlan';
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
}
