# Email Configuration Guide - NIRA National ID Appointment System

## How to Enable Email Sending

Currently, the system is configured but emails are not being sent because the Resend API key needs to be added.

### Step 1: Get Your Resend API Key

1. **Create Account:**
   - Go to https://resend.com
   - Sign up for a free account
   - Free tier includes:
     - 100 emails per day
     - 3,000 emails per month
     - Perfect for testing and initial deployment

2. **Verify Your Email:**
   - Check your inbox for verification email
   - Click the verification link

3. **Get API Key:**
   - Log in to Resend dashboard
   - Navigate to: **API Keys** section
   - Click **"Create API Key"**
   - Name it: "NIRA Production"
   - Copy the key (it starts with `re_...`)
   - **IMPORTANT:** Save this key securely - it won't be shown again!

4. **Verify Sender Domain (Optional but Recommended):**
   - For production use, verify your domain (nira.go.ug)
   - Follow Resend's domain verification guide
   - Add DNS records to your domain
   - Once verified, you can send from paul.kasawuli@nira.go.ug

### Step 2: Add API Key to Your System

#### Option A: Using the Update Script (Easiest)

```bash
# Run the configuration script
bash /app/scripts/update_resend_key.sh

# Follow the prompts:
# 1. Enter your Resend API key (re_...)
# 2. Enter sender email (paul.kasawuli@nira.go.ug or onboarding@resend.dev for testing)
# 3. Script will automatically restart backend
```

#### Option B: Manual Configuration

1. **Edit the .env file:**
   ```bash
   nano /app/backend/.env
   ```

2. **Update these lines:**
   ```
   RESEND_API_KEY=re_your_actual_api_key_here
   SENDER_EMAIL=paul.kasawuli@nira.go.ug
   ```

3. **Save and exit** (Ctrl+X, then Y, then Enter)

4. **Restart backend:**
   ```bash
   sudo supervisorctl restart backend
   ```

### Step 3: Test Email Sending

1. **Book a Test Appointment:**
   - Go to your website
   - Fill in all fields with valid data
   - Use your personal email to receive the test
   - Complete the booking

2. **Check Email Delivery:**
   - Check your inbox (and spam folder)
   - You should receive the confirmation email

3. **View Logs (if email not received):**
   ```bash
   # Check backend logs for errors
   tail -f /var/log/supervisor/backend.out.log
   
   # Look for email sending messages
   grep -i "email" /var/log/supervisor/backend.out.log
   ```

### Step 4: Verify Email Content

The emails sent include:

**For Abu Dhabi:**
- Venue: Uganda Embassy, Abu Dhabi
- Work hours: 9am to 1pm
- Signature: NIRA Diaspora Desk for Middle East

**For Dubai:**
- Venue: Uganda Consulate, Dubai
- Work hours: 9am to 1pm
- Signature: NIRA Diaspora Desk for Middle East

## Troubleshooting

### Email Not Sending?

1. **Check API Key:**
   ```bash
   grep RESEND_API_KEY /app/backend/.env
   # Should show: RESEND_API_KEY=re_...
   ```

2. **Check Sender Email:**
   - If using custom domain: Must be verified in Resend
   - For testing: Use onboarding@resend.dev
   - For production: Verify nira.go.ug domain first

3. **Check Backend Logs:**
   ```bash
   tail -n 100 /var/log/supervisor/backend.err.log
   ```

4. **Common Issues:**
   - **"Invalid API key"**: API key not correct
   - **"Sender not verified"**: Domain not verified in Resend
   - **"Rate limit exceeded"**: Free tier limit reached (100/day)

### Resend Dashboard

Monitor email sending in real-time:
- Log in to https://resend.com
- Go to **Emails** tab
- See all sent emails, delivery status, and any errors

## Production Recommendations

1. **Verify Your Domain:**
   - Verify nira.go.ug in Resend
   - Allows sending from any @nira.go.ug email
   - Improves deliverability
   - Prevents emails going to spam

2. **Upgrade Plan (if needed):**
   - Free: 3,000 emails/month
   - Paid plans available for higher volume
   - Check Resend pricing page

3. **Monitor Usage:**
   - Check Resend dashboard regularly
   - Set up alerts for delivery failures
   - Monitor bounce rates

## Support

If you encounter any issues:
- **Resend Support:** https://resend.com/docs
- **System Admin:** paul.kasawuli@nira.go.ug
- **Backend Logs:** /var/log/supervisor/backend.out.log

## Current Configuration

```
Email Provider: Resend
Free Tier: 100 emails/day, 3,000/month
Support Email: paul.kasawuli@nira.go.ug
Backend Location: /app/backend/server.py
Environment File: /app/backend/.env
```

---
**Last Updated:** February 22, 2026
**System:** NIRA National ID Appointment System
