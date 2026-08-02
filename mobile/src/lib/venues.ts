import { supabase } from '@/lib/supabase';

export interface Venue {
  id: string;
  name: string;
  county: string | null;
}

/** Case-insensitive prefix/substring search — venues have no uniqueness
 * constraint on name by design (CLAUDE.md: "expect duplicates, merge, never
 * delete"), so this is a plain search, not a lookup. */
export async function searchVenues(query: string): Promise<Venue[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const { data, error } = await supabase
    .from('venues')
    .select('id, name, county')
    .ilike('name', `%${trimmed}%`)
    .order('name')
    .limit(20);

  if (error) throw error;
  return data;
}
