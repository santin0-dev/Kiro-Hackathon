# MedMatch

**Community screening, hospital referrals, and patient follow-up in one shared workflow.**

MedMatch helps Barangay Health Workers (BHWs) submit screening information to a receiving hospital team. Doctors record assessments and next steps, patients receive SMS instructions, and BHWs track referral progress.

## Test accounts

These accounts are for the fictional hackathon environment. They use Supabase authentication and approved staff roles.


| Workspace | Email                       | Password       |
| --------- | --------------------------- | -------------- |
| BHW       | `bhw.demo@example.com`      | `BhwDemo123!`  |
| Hospital  | `hospital.demo@example.com` | `Hospital123!` |


Open the two accounts in **separate browsers or separate browser profiles**. Tabs in the same browser share a login session.

These credentials are intentionally documented for testing. Replace them and remove this table before using the application with real patient information.

## What each user does

**BHW:** Select a barangay on the map, add a patient, record screening readings and history, attach documents, and track the referral and follow-up.

**Hospital:** Review incoming referrals grouped by barangay, set visit instructions, confirm attendance and assessment, record results, and return the outcome to the BHW.

**Patient:** Receive instructions and completed assessment results through SMS. No patient account or mobile app is required.

## Referral workflow

1. The BHW selects a barangay and saves the screening.
2. The application routes the record to the configured receiving hospital.
3. The doctor reviews the record and saves the appointment and preparation instructions.
4. Hospital staff confirm the visit and assessment.
5. The doctor saves the result and follow-up instructions, then confirms that the results were explained.
6. **Finish review and text results** saves the completed referral and attempts to submit the results by SMS.
7. The BHW sees the returned outcome and tracks remaining follow-up.

If more assessment is needed, the referral remains open. **Completed means this referral is finished; it does not mean the patient is cured.**

“Results explained” becomes available after assessment results are saved. Sending an SMS alone does not confirm that the patient understood the results.

## Run locally

Requires Node.js and npm.

```bash
npm install
```

Copy `.env.example` to `.env.local`, fill in the required settings below, then run:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) and sign in. Restart the development server after changing environment variables.

## Configuration

Keep credentials in `.env.local` or your deployment's server environment. Never commit them or prefix secret keys with `NEXT_PUBLIC_`.


| Service                       | Settings                                                                    |
| ----------------------------- | --------------------------------------------------------------------------- |
| Supabase database and storage | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY` |


