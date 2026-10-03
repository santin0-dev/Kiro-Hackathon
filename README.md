# Vitality minimum referral demo

BHW screening and original documents → hospital acceptance and demo appointment → reviewed SMS instructions → assessment outcome returned to the BHW.

Run `npm run dev -- --hostname 127.0.0.1 --port 3000`.

## Setup

Run `supabase/setup.sql` in Supabase SQL Editor. Set server-only variables from `.env.example` in `.env.local` and restart Next.js. SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are required. The server seeds five fictional cases on first database read. Documents use a private Storage bucket. Case saves use version checks and a database unique appointment index. Earlier browser-local records remain untouched but are not imported.

SNS uses AWS_SNS_REGION or AWS_REGION, registered AWS_SMS_SENDER_ID, verified recipients in AWS_SMS_ALLOWED_NUMBERS, and LOCAL_DEMO_SMS_ENABLED=true. Review the preview and recipient consent before sending. AWS acceptance does not confirm receipt. Persistent send records suppress duplicates even after server restart. Check AWS when a submission is unknown; no automatic retries.

Bedrock uses AWS_BEDROCK_REGION or AWS_REGION and AWS_BEDROCK_MODEL_ID, with LOCAL_DEMO_AI_ENABLED=true. Standard SDK server credential chain supports local profiles and environment credentials. Never expose credentials using NEXT_PUBLIC_. AI drafts summaries and approved-plan explanations, with clinician review. It does not select diagnosis, treatment or appointments.

## Limits

Localhost-only fictional demo; staff roles are simulated. No real authentication, hospital partner/scheduler, SMS replies, delivery receipts, real clinical care, document extraction or map. Do not deploy or enter real patient data without authentication and authorization.

## Checks

Lint, TypeScript and production build passed. Sixteen workflow/referral/SMS tests and one local PostgreSQL schema integration test passed. Hosted Supabase, private Storage and live AWS delivery/model output remain unverified until user setup. No SMS or model invocation was sent during these checks.
