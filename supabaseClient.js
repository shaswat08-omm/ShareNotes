import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://agqvbqwchsmfgoyklrcl.supabase.co"
const supabaseKey = "sb_publishable_IpDkbnGsGxzpMOoGxaLW3A_UOlBgRF1"

export const supabase = createClient(supabaseUrl, supabaseKey)
