import * as MediaLibrary from 'expo-media-library';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { describe, expect, it, vi } from 'vitest';

import { exportTicketImage } from './export-ticket-image';

vi.mock('expo-media-library', () => ({
  requestPermissionsAsync: vi.fn(),
  saveToLibraryAsync: vi.fn(),
}));

vi.mock('react-native-view-shot', () => ({
  captureRef: vi.fn(),
}));

function makeRef(): RefObject<View | null> {
  return { current: {} as View };
}

describe('exportTicketImage', () => {
  it('returns permission_denied when media library permission is not granted', async () => {
    vi.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValue({
      granted: false,
    } as unknown as MediaLibrary.PermissionResponse);

    const result = await exportTicketImage(makeRef());
    expect(result).toBe('permission_denied');
    expect(captureRef).not.toHaveBeenCalled();
  });

  it('returns saved on successful capture and library save', async () => {
    vi.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValue({
      granted: true,
    } as unknown as MediaLibrary.PermissionResponse);
    vi.mocked(captureRef).mockResolvedValue('file:///tmp/ticket.png');
    vi.mocked(MediaLibrary.saveToLibraryAsync).mockResolvedValue(undefined);

    const ref = makeRef();
    const result = await exportTicketImage(ref);
    expect(result).toBe('saved');
    expect(captureRef).toHaveBeenCalledWith(ref, expect.objectContaining({ format: 'png' }));
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///tmp/ticket.png');
  });

  it('returns error when captureRef throws', async () => {
    vi.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValue({
      granted: true,
    } as unknown as MediaLibrary.PermissionResponse);
    vi.mocked(captureRef).mockRejectedValue(new Error('capture failed'));

    const result = await exportTicketImage(makeRef());
    expect(result).toBe('error');
  });

  it('returns error when saveToLibraryAsync throws', async () => {
    vi.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValue({
      granted: true,
    } as unknown as MediaLibrary.PermissionResponse);
    vi.mocked(captureRef).mockResolvedValue('file:///tmp/ticket.png');
    vi.mocked(MediaLibrary.saveToLibraryAsync).mockRejectedValue(new Error('save failed'));

    const result = await exportTicketImage(makeRef());
    expect(result).toBe('error');
  });
});
