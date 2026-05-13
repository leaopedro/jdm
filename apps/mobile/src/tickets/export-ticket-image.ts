import * as MediaLibrary from 'expo-media-library';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export type ExportResult = 'saved' | 'permission_denied' | 'error';

export async function exportTicketImage(ref: RefObject<View | null>): Promise<ExportResult> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) return 'permission_denied';

  try {
    const uri = await captureRef(ref, { format: 'png', quality: 1 });
    await MediaLibrary.saveToLibraryAsync(uri);
    return 'saved';
  } catch {
    return 'error';
  }
}
