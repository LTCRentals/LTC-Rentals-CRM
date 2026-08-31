import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://octafffgcexzpdscxsmg.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Jnn4yKgrg9mrRlCIbGBaAA_8r64sail'

export const supabase = createClient(supabaseUrl, supabaseKey)
