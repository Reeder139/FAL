import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

/**
 * NOTE ON IMPORT ORDER: this module imports supabase.ts, which creates the
 * auth client at module scope — safe to import from onboarding.tsx (a
 * screen, not something SSR pre-renders at the root), but don't pull it
 * into anything reachable from the root layout's module graph. See
 * sessionStorage.ts / storage.ts for the SSR crash this caused before.
 */

const AVATARS_BUCKET = 'post-media';
const AVATAR_SIZE = 512;
const AVATAR_COMPRESSION = 0.85;

async function readUriAsBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

/**
 * Picks, square-crops, and uploads an avatar to the current user's folder
 * in post-media, returning the storage path for profiles.avatar_path.
 * Unlike catch evidence photos, cropping here is fine — this isn't
 * evidence, just a profile picture.
 */
export async function pickAndUploadAvatar(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || result.assets.length === 0) return null;

  const resized = await manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } }],
    { format: SaveFormat.JPEG, compress: AVATAR_COMPRESSION }
  );
  const bytes = await readUriAsBytes(resized.uri);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to upload an avatar.');

  const path = `${user.id}/avatar.jpg`;
  const { error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;

  return path;
}
