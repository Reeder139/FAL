import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import 'react-native-get-random-values';
import { Platform } from 'react-native';

/**
 * Session storage for the Supabase client. Two constraints drive this:
 *
 * 1. SecureStore (the iOS Keychain / Android Keystore) caps individual
 *    values around 2048 bytes — a Supabase session (access + refresh JWT)
 *    can exceed that. So on native we don't put the session in SecureStore
 *    directly; we generate a random AES key, store *that* (small) in
 *    SecureStore, and store the AES-encrypted session (arbitrarily large)
 *    in AsyncStorage. This is Supabase's own documented pattern for Expo.
 * 2. SecureStore doesn't exist on web. This app does static SSR for web
 *    (app.json's web.output: "static"), which runs in Node, where `window`
 *    doesn't exist — AsyncStorage's web implementation touches `window`
 *    directly and crashes if called during that render pass (this already
 *    broke the app once, see storage.ts's comment). So the web storage
 *    adapter has to no-op during SSR and only touch AsyncStorage once
 *    there's an actual browser `window` to read/write against.
 */

interface SupportedStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

class LargeSecureStore implements SupportedStorage {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));

    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;

    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1)
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));

    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this.decrypt(key, encrypted);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

const isWebSsrPass = Platform.OS === 'web' && typeof window === 'undefined';

const webStorage: SupportedStorage = {
  getItem: (key) => (isWebSsrPass ? Promise.resolve(null) : AsyncStorage.getItem(key)),
  setItem: (key, value) => (isWebSsrPass ? Promise.resolve() : AsyncStorage.setItem(key, value)),
  removeItem: (key) => (isWebSsrPass ? Promise.resolve() : AsyncStorage.removeItem(key)),
};

export const sessionStorage: SupportedStorage = Platform.OS === 'web' ? webStorage : new LargeSecureStore();
