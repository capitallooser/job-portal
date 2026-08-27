#!/usr/bin/env bash
set -euo pipefail

export VITE_SUPABASE_URL="https://vizfrptpkdofnvykbtbh.supabase.co"
export VITE_SUPABASE_ANON_KEY="sb_publishable_kMixAxteWAZ01apzxAnNig_eZEX5KI5"
export VITE_APP_NAME="TalentBridge"

rm -rf app
mkdir -p app

cat .upload/chunk-* > /tmp/job-portal.tar.gz.b64
base64 --decode /tmp/job-portal.tar.gz.b64 > /tmp/job-portal.tar.gz

echo "4372085bbbd5c06d5c427111cbe48b7e4ca7895f82d9594d0236019cc0aa3b50  /tmp/job-portal.tar.gz" | sha256sum -c -

tar -xzf /tmp/job-portal.tar.gz -C app
cd app
npm install
npm run build
