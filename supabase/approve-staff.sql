-- Replace the email and role, then run as administrator in Supabase SQL Editor.
update public.vitality_staff set approved=true,role='BHW' where email='REPLACE_WITH_STAFF_EMAIL';
-- Hospital staff use role='Doctor'.
