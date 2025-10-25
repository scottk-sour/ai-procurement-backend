# Render Deployment Verification Guide

**Your Render URL**: https://ai-procurement-backend-q35u.onrender.com

---

## Current Status

**Issue Detected**: Service returning 403 "Access denied"

This means the service is running but blocking access. Let's diagnose and fix it.

---

## Step 1: Check Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click on your service: `ai-procurement-backend`
3. Check the status:
   - Should show "Live" (green)
   - If "Sleeping", it will wake up on first request (takes 1-2 minutes)

---

## Step 2: Check Deployment Logs

In Render Dashboard:
1. Click on your service
2. Go to "Logs" tab
3. Look for:
   - ✅ `Rate limiting enabled: 100 requests per 15 minutes per IP`
   - ✅ `API Documentation available at /api-docs`
   - ✅ `MongoDB connected` or similar success message
   - ❌ Any error messages

**If you see connection errors**, your environment variables might not be set correctly.

---

## Step 3: Verify Environment Variables

In Render Dashboard → Environment tab, ensure you have:

### Required Variables:
```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=[your-secret]
OPENAI_API_KEY=sk-...
NODE_ENV=production
PORT=5001
FRONTEND_URL=https://your-frontend-url.com
```

**Important**: After changing environment variables, Render will automatically redeploy.

---

## Step 4: Check Service Settings

In Render Dashboard → Settings:

1. **Instance Type**: Should be "Free" or "Starter"
2. **Auto-Deploy**: Should be "Yes" (deploys on git push)
3. **Health Check Path**: Not required but can set to `/api/health`

---

## Step 5: Test the Deployment

### Option A: From Render Dashboard (Recommended)

In Render Dashboard:
1. Click "Shell" tab
2. Run these commands:

```bash
# Test within the container
curl http://localhost:5001/
curl http://localhost:5001/api/health
```

This tests from inside the Render environment, bypassing any external restrictions.

### Option B: From Your Computer

**Wait for service to wake up** (if sleeping), then try:

```bash
# Test health endpoint
curl https://ai-procurement-backend-q35u.onrender.com/api/health

# Test root endpoint
curl https://ai-procurement-backend-q35u.onrender.com/

# Test API docs (in browser)
open https://ai-procurement-backend-q35u.onrender.com/api-docs
```

**Expected Response** (health check):
```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T...",
  "uptime": 12345.67
}
```

---

## Step 6: Redeploy Latest Code

If your deployment is outdated, redeploy:

### Option A: Manual Deploy (Render Dashboard)
1. Go to your service in Render Dashboard
2. Click "Manual Deploy" → "Deploy latest commit"
3. Wait for deployment to complete (~5 minutes)

### Option B: Git Push (Automatic)
```bash
# Ensure you're on the correct branch
git branch

# Push to trigger auto-deploy
git push origin claude/check-file-access-011CUL9FY39f4MZyytfWRGPS
```

**Note**: Make sure your Render service is connected to the correct branch!

---

## Common Issues & Solutions

### Issue 1: "Access denied" (403)

**Possible Causes**:
- Service is private (check Settings → Public access)
- IP restriction enabled
- CORS issues (but shouldn't affect health checks)

**Solution**:
1. Render Dashboard → Settings
2. Ensure the service is not set to "Private"
3. Check if there's an IP allowlist configured

---

### Issue 2: Service Sleeping (Free Tier)

**Symptom**: Slow first request, then works fine

**Explanation**:
- Render free tier services sleep after 15 minutes of inactivity
- First request wakes the service (takes 1-2 minutes)
- Subsequent requests are fast

**Solution**:
- Use Render "Starter" plan ($7/mo) for always-on service
- Or accept the cold start delay (acceptable for development)

---

### Issue 3: MongoDB Connection Failed

**Symptom**: Logs show "Failed to connect to MongoDB"

**Causes**:
- MONGODB_URI not set or incorrect
- MongoDB Atlas IP whitelist doesn't include `0.0.0.0/0`
- Wrong database password

**Solution**:
1. Check MONGODB_URI in environment variables
2. MongoDB Atlas → Network Access → Add IP: `0.0.0.0/0`
3. Verify database user password

---

### Issue 4: Environment Variables Not Set

**Symptom**:
- Service crashes on startup
- Logs show "Missing required environment variables"

**Solution**:
1. Render Dashboard → Environment
2. Add all required variables:
   - MONGODB_URI
   - JWT_SECRET
   - OPENAI_API_KEY
   - NODE_ENV=production
   - FRONTEND_URL
3. Save (triggers auto-redeploy)

---

### Issue 5: Wrong Branch Deployed

**Symptom**: Latest changes not showing up

**Solution**:
1. Render Dashboard → Settings → Build & Deploy
2. Check "Branch": Should match your git branch
3. Change to: `claude/check-file-access-011CUL9FY39f4MZyytfWRGPS`
4. Save and redeploy

---

## Step 7: Verify All Optimizations Are Active

Once the service is accessible, verify our work:

### Check 1: No Warnings in Logs
```
✅ Should NOT see: "Duplicate schema index"
✅ Should NOT see: "useNewUrlParser is deprecated"
✅ Should NOT see: "useUnifiedTopology is deprecated"
```

### Check 2: Rate Limiting Active
```
✅ Should see: "Rate limiting enabled: 100 requests per 15 minutes per IP"
```

### Check 3: API Documentation
```
✅ Should see: "API Documentation available at /api-docs"
```

### Check 4: Database Connection
```
✅ Should see: MongoDB connection success (no ECONNREFUSED errors)
```

---

## Step 8: Test Endpoints

Once accessible, test these:

### Health Checks
```bash
# Root health
curl https://ai-procurement-backend-q35u.onrender.com/

# API health
curl https://ai-procurement-backend-q35u.onrender.com/api/health
```

### API Documentation (Browser)
```
https://ai-procurement-backend-q35u.onrender.com/api-docs
```

### Test Registration
```bash
curl -X POST https://ai-procurement-backend-q35u.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "Test123!"
  }'
```

**Expected**:
```json
{
  "message": "User registered successfully"
}
```

### Test Login
```bash
curl -X POST https://ai-procurement-backend-q35u.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'
```

**Expected**:
```json
{
  "message": "Login successful",
  "token": "eyJhbGci...",
  "userId": "...",
  "role": "user",
  "name": "Test User",
  "email": "test@example.com"
}
```

### Test Rate Limiting
```bash
# Make 105 rapid requests to test general rate limit
for i in {1..105}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    https://ai-procurement-backend-q35u.onrender.com/api/health
done
```

**Expected**: First 100 return `200`, then `429` (Too Many Requests)

---

## Step 9: Update Frontend

Once backend is verified, update your frontend `.env`:

```bash
VITE_API_URL=https://ai-procurement-backend-q35u.onrender.com
```

Or if using Next.js:
```bash
NEXT_PUBLIC_API_URL=https://ai-procurement-backend-q35u.onrender.com
```

Then redeploy your frontend.

---

## Step 10: Monitor the Deployment

### Set Up Monitoring

1. **Render Dashboard**:
   - Check "Metrics" tab for CPU, Memory, Requests
   - Review logs regularly

2. **Uptime Monitoring**:
   - [UptimeRobot](https://uptimerobot.com) (Free)
   - Monitor: `https://ai-procurement-backend-q35u.onrender.com/api/health`
   - Alert on downtime

3. **Error Tracking**:
   - Consider adding Sentry for error tracking
   - Add `SENTRY_DSN` to environment variables

---

## Troubleshooting Checklist

If deployment is not working:

- [ ] Service status is "Live" in Render Dashboard
- [ ] All environment variables are set
- [ ] MongoDB URI is correct and accessible
- [ ] MongoDB Atlas allows IP `0.0.0.0/0`
- [ ] Correct branch is deployed
- [ ] No error messages in logs
- [ ] Service is not set to "Private"
- [ ] Waited for cold start (if free tier)

---

## Getting Help

If issues persist:

1. **Check Render Logs**: Most issues are visible in logs
2. **Render Status**: https://status.render.com
3. **Render Community**: https://community.render.com
4. **GitHub Issues**: Check if others have same issue

---

## Success Criteria

Your deployment is successful when:

- ✅ Health endpoint returns JSON with "healthy" status
- ✅ API documentation loads at `/api-docs`
- ✅ Can register and login users
- ✅ Rate limiting returns 429 after limit exceeded
- ✅ No warnings in deployment logs
- ✅ MongoDB connection successful
- ✅ Frontend can communicate with backend

---

## Next Steps After Successful Deployment

1. **Test all features** with your frontend
2. **Monitor for first week** - watch for errors
3. **Set up alerting** - UptimeRobot or Pingdom
4. **Share API docs** with frontend team
5. **Plan enhancements** based on user feedback

---

**Need Help?**
- Check the logs first - they usually tell you what's wrong
- Verify all environment variables
- Make sure MongoDB is accessible
- Try the Render Shell to test from inside the container

**Your deployment URL**: https://ai-procurement-backend-q35u.onrender.com

Good luck! 🚀
