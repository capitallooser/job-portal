#!/usr/bin/env bash
set -euo pipefail

export VITE_SUPABASE_URL="https://vizfrptpkdofnvykbtbh.supabase.co"
export VITE_SUPABASE_ANON_KEY="sb_publishable_kMixAxteWAZ01apzxAnNig_eZEX5KI5"
export VITE_APP_NAME="TalentBridge"

rm -rf app
mkdir -p app

base64 --decode source_bundle.tar.gz.b64 > /tmp/job-portal-source.tar.gz
echo "c5ae7c68f582735cee4c7b854d07f2955e51a140dd43fb3e96e8bba3bf31da12  /tmp/job-portal-source.tar.gz" | sha256sum -c -
tar -xzf /tmp/job-portal-source.tar.gz -C app

cd app
npm install --no-audit --no-fund
npm run build
