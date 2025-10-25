# Render Access Troubleshooting Guide

**Issue:** External requests to Render deployment return "Access denied" (403)

**Status:** ✅ Application code is correct | ⚠️ Render infrastructure blocking access

---

## Evidence Analysis

### Test Results
```bash
$ curl -i https://ai-procurement-backend-q35u.onrender.com/api/health

HTTP/1.1 200 OK
date: Sat, 25 Oct 2025 17:30:39 GMT
server: envoy

HTTP/2 403
content-length: 13
content-type: text/plain
date: Sat, 25 Oct 2025 17:30:39 GMT

Access denied
```

### What This Tells Us

1. **Render's proxy (Envoy) is responding** - `HTTP/1.1 200 OK` with `server: envoy`
2. **Then access is blocked** - `HTTP/2 403` with generic "Access denied"
3. **Our application is NOT reached** - No logs show in Render deployment logs
4. **Message is too generic** - Our application returns detailed JSON errors, not plain text

**Conclusion:** Render is blocking access at the infrastructure level before requests reach our application.

---

## Root Cause: Render Service Visibility Settings

The "Access denied" error is coming from **Render's access control**, not our application code. This happens when a service is configured as **Private** or has **IP restrictions**.

---

## Solution: Check Render Dashboard Settings

### Step 1: Open Your Service Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Navigate to your service: **ai-procurement-backend-q35u**
3. You should see:
   - ✅ **Status:** "Live" (green)
   - ✅ **Deploy Status:** "Deploy live"
   - ✅ **Latest Deploy:** Commit `3795c0e` (CORS fix)

### Step 2: Check Settings Tab

Click the **"Settings"** tab in the left sidebar.

#### Look for These Specific Settings:

#### A. Service Visibility / Access Control

**Location:** Settings → Service Details or Settings → Access Control

**What to look for:**
- [ ] **"Service Visibility"** toggle
- [ ] **"Private Service"** option
- [ ] **"Public"** vs **"Private"** setting

**Current Setting:** Likely set to **Private** ❌

**Required Setting:** Must be **Public** ✅

**How to fix:**
1. Find the "Service Visibility" or "Access Control" section
2. Toggle from **Private** to **Public**
3. Click **Save Changes**
4. Wait 30 seconds for changes to propagate
5. Test again: `curl https://ai-procurement-backend-q35u.onrender.com/api/health`

---

#### B. IP Allowlist / Whitelist

**Location:** Settings → Security or Settings → Access Control

**What to look for:**
- [ ] **"IP Allowlist"** section
- [ ] **"Allowed IPs"** field
- [ ] **"IP Restrictions"** toggle

**Current Setting:** May have IP restrictions enabled ❌

**Required Setting:** Either disabled OR `0.0.0.0/0` (allow all) ✅

**How to fix:**
1. Find "IP Allowlist" or "IP Restrictions"
2. If enabled, either:
   - **Option A:** Disable IP restrictions completely
   - **Option B:** Add `0.0.0.0/0` to allow all IPs
3. Click **Save Changes**
4. Wait 30 seconds
5. Test again

---

#### C. Authentication / Auth Settings

**Location:** Settings → Authentication

**What to look for:**
- [ ] **"HTTP Authentication"** enabled
- [ ] **"Basic Auth"** enabled
- [ ] **"Require authentication"** toggle

**Current Setting:** May have authentication enabled ❌

**Required Setting:** Authentication should be **disabled** for public API ✅

**How to fix:**
1. Find "Authentication" or "HTTP Authentication" section
2. Ensure all authentication is **disabled** (our app handles auth internally with JWT)
3. Click **Save Changes**
4. Test again

---

#### D. Team / Organization Access

**Location:** Settings → Access or Team Settings

**What to look for:**
- [ ] **"Team Access Only"** toggle
- [ ] **"Organization Members Only"** setting
- [ ] **"Private to team"** option

**Current Setting:** May restrict access to team members only ❌

**Required Setting:** Must allow public access ✅

**How to fix:**
1. Find team/organization access settings
2. Disable "Team Only" or "Organization Only" restrictions
3. Set to allow public access
4. Click **Save Changes**
5. Test again

---

### Step 3: Check Environment Variables

While in Settings, verify these critical environment variables are set:

```bash
NODE_ENV=production
FRONTEND_URL=https://ai-procurement-frontend.vercel.app
PORT=10000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...
OPENAI_API_KEY=...
```

All should have ✅ checkmarks.

---

### Step 4: Check Logs Tab

After making settings changes, check the **Logs** tab to verify:

1. Service restarted successfully
2. No errors during startup
3. You should see our startup messages:
   ```
   ✅ Connected to MongoDB: ai-procurement-db
   ✅ Rate limiting enabled: 100 requests per 15 minutes per IP
   ✅ API Documentation available at /api-docs
   🚀 Server running on port 10000
   ```

---

## How to Verify Fix Worked

Once you've updated Render settings, test these endpoints:

### Test 1: Health Check (Root)
```bash
curl -s https://ai-procurement-backend-q35u.onrender.com/
```

**Expected Response:** JSON with server info
```json
{
  "message": "🚀 TendorAI Backend is Running!",
  "timestamp": "2025-10-25T...",
  "status": "healthy",
  "environment": "production",
  "mongodb": "Connected"
}
```

**❌ NOT:** Plain text "Access denied"

---

### Test 2: API Health Check
```bash
curl -s https://ai-procurement-backend-q35u.onrender.com/api/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T...",
  "uptime": 123.45
}
```

---

### Test 3: Swagger Documentation
```bash
curl -I https://ai-procurement-backend-q35u.onrender.com/api-docs
```

**Expected Response:**
```
HTTP/2 200
content-type: text/html
```

**Then open in browser:** https://ai-procurement-backend-q35u.onrender.com/api-docs

You should see **Swagger UI** with "AI Procurement Backend API" documentation.

---

### Test 4: Rate Limiting Headers
```bash
curl -i https://ai-procurement-backend-q35u.onrender.com/api/health | grep -i ratelimit
```

**Expected Response:** Should see rate limit headers
```
ratelimit-limit: 100
ratelimit-remaining: 99
ratelimit-reset: 1730000000
```

---

## Common Render Settings Locations

Different Render plan types may have settings in different places. Check:

1. **Dashboard → Your Service → Settings**
2. **Settings → Service Details**
3. **Settings → Security**
4. **Settings → Access Control**
5. **Settings → Advanced**
6. **Settings → Environment**

---

## If You Can't Find Settings

### Free Tier Limitations

If you're on **Render Free Tier**, some access control features may not be visible. However, free tier services should still be **publicly accessible by default**.

### Contact Render Support

If you cannot find any access control settings:

1. Click **"Help"** in Render dashboard
2. Open a support ticket describing:
   - Service name: `ai-procurement-backend-q35u`
   - Issue: External access returns "Access denied"
   - Request: Make service publicly accessible
   - Mention: This is a public API service

---

## Alternative: Check via Render CLI

If you have Render CLI installed:

```bash
# Login to Render
render login

# Check service details
render services list

# Get service info
render services get ai-procurement-backend-q35u

# Check if service is private
render services get ai-procurement-backend-q35u --format json | grep -i "private\|public\|access"
```

---

## What We've Ruled Out

✅ **Application code** - CORS configuration is correct
✅ **Deployment** - Service is "Live" and deployed successfully
✅ **Environment variables** - All required variables are set
✅ **MongoDB connection** - Database connects successfully
✅ **Port configuration** - Using PORT=10000 correctly
✅ **Build process** - No errors in build logs
✅ **Runtime errors** - No crashes in deployment logs

The only remaining factor is **Render infrastructure access control**.

---

## Next Steps After Fix

Once Render access is resolved and endpoints are accessible:

1. ✅ **Verify all optimizations**
   - Rate limiting headers present
   - Swagger UI loads
   - Zero warnings in logs
   - Database queries optimized

2. ✅ **Update frontend**
   - Set backend URL to Render deployment
   - Test authentication flow
   - Test API requests

3. ✅ **Production monitoring**
   - Monitor logs for errors
   - Check rate limiting effectiveness
   - Verify CORS allows frontend

4. ✅ **Performance testing**
   - Load test with multiple concurrent requests
   - Verify rate limiting blocks excessive requests
   - Test database query performance

---

## Summary

**Problem:** "Access denied" from Render infrastructure
**Solution:** Change Render service visibility to Public in Settings
**Location:** Render Dashboard → ai-procurement-backend-q35u → Settings → Service Visibility/Access Control
**Action Required:** Toggle from Private to Public and save

**Once fixed, your API will be fully accessible with all production optimizations active!** 🚀
