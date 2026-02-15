# CommonGround - Vercel Deployment Guide

## Prerequisites
- GitHub repository with code pushed
- Vercel account (free tier)
- Supabase project created

## Environment Variables

Add these to your Vercel project (Settings → Environment Variables):

```
NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN=pk.your_public_token_here
MAPBOX_SECRET_TOKEN=sk.your_secret_token_here
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

**Note**: All four variables are required for the app to work.

## Deployment Steps

1. **Connect GitHub to Vercel:**
   - Login to vercel.com
   - Click "Add New Project"
   - Import your GitHub repository

2. **Configure Build Settings:**
   - Framework Preset: Next.js (auto-detected)
   - Build Command: `npm run build`
   - Output Directory: `.next`

3. **Add Environment Variables:**
   - Add all 4 variables listed above
   - Make sure to add them to Production, Preview, and Development

4. **Deploy:**
   - Click "Deploy"
   - Wait for build to complete

## Post-Deployment

Your app will be live at: `https://your-project.vercel.app`

### Features Ready:
- ✅ Create collaborative sessions
- ✅ Share session URLs
- ✅ Real-time updates (see others add/edit/delete immediately)
- ✅ Car/Bike transport modes
- ✅ Full CRUD operations on user locations
- ✅ Map visualization with isochrones
- ✅ Common area calculation

## Testing

1. Visit the deployed URL
2. Click "Create New Session"
3. Copy the session link
4. Open in another browser/incognito window
5. Add users in both windows - watch them sync in real-time!

## Troubleshooting

**If build fails:**
- Check all environment variables are set
- Ensure Supabase database tables exist
- Check Vercel build logs for errors

**If app doesn't load:**
- Verify Mapbox tokens are valid
- Check Supabase connection is working
- Check browser console for errors

## Files Created for Collaboration:

- `src/lib/supabase.ts` - Supabase client
- `src/app/api/sessions/` - Session management API
- `src/components/SessionManager.tsx` - Landing page UI
- `src/components/ShareLink.tsx` - Copy link button
- `src/app/session/[id]/page.tsx` - Collaborative session page
- `src/app/page.tsx` - Updated landing page

## Database Schema

Tables created in Supabase:
- `sessions` - Stores session IDs
- `session_users` - Stores user data per session

RLS policies allow public read/write for open collaboration.
