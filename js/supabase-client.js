import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
  'https://exiiyhlyhtoxmpjecper.supabase.co',
  'sb_publishable_La4N49OJpEFP0VEF9JD1iA_qtHXK47c',
);

window.supabase = supabase;
