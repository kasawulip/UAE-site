#!/bin/bash
# Script to update Resend API Key and Sender Email

echo "=== NIRA Appointment System - Resend Configuration ==="
echo ""
echo "This script will help you configure email sending."
echo ""

# Get API Key
read -p "Enter your Resend API Key (starts with re_...): " API_KEY

# Get Sender Email
echo ""
echo "Enter your verified sender email (must be verified in Resend):"
read -p "Sender Email: " SENDER_EMAIL

# Update .env file
ENV_FILE="/app/backend/.env"

# Backup original
cp $ENV_FILE "${ENV_FILE}.backup"

# Update RESEND_API_KEY
sed -i "s|RESEND_API_KEY=.*|RESEND_API_KEY=${API_KEY}|g" $ENV_FILE

# Update SENDER_EMAIL
sed -i "s|SENDER_EMAIL=.*|SENDER_EMAIL=${SENDER_EMAIL}|g" $ENV_FILE

echo ""
echo "✓ Configuration updated successfully!"
echo ""
echo "Updated values:"
echo "  RESEND_API_KEY: ${API_KEY:0:10}..."
echo "  SENDER_EMAIL: $SENDER_EMAIL"
echo ""
echo "Restarting backend service..."
sudo supervisorctl restart backend

echo ""
echo "✓ Backend restarted!"
echo ""
echo "To verify emails are working:"
echo "1. Go to your website and book a test appointment"
echo "2. Check your email inbox"
echo "3. View email logs: tail -f /var/log/supervisor/backend.out.log"
echo ""
