import { zodResolver } from '@hookform/resolvers/zod';
import {
  type PublicProfile,
  BRAZIL_STATE_CODES,
  updateProfileSchema,
  type UpdateProfileInput,
} from '@jdm/shared/profile';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getProfile, updateProfile } from '~/api/profile';
import { useAuth } from '~/auth/context';
import { Button } from '~/components/Button';
import { TextField } from '~/components/TextField';
import { authCopy } from '~/copy/auth';
import { profileCopy } from '~/copy/profile';
import { pickAndUpload } from '~/lib/upload-image';
import { theme } from '~/theme';

export default function ProfileScreen() {
  const { logout } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = (msg: string) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner(msg);
    bannerTimer.current = setTimeout(() => setBanner(null), 3000);
  };

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: '', bio: '', city: '', stateCode: undefined },
  });

  useEffect(() => {
    void (async () => {
      const p = await getProfile();
      setProfile(p);
      form.reset({
        name: p.name,
        bio: p.bio ?? '',
        city: p.city ?? '',
        stateCode: (p.stateCode as UpdateProfileInput['stateCode']) ?? undefined,
      });
    })();
  }, [form]);

  const onSave = form.handleSubmit(async (values) => {
    try {
      const updated = await updateProfile(values);
      setProfile(updated);
      showBanner(profileCopy.profile.saved);
    } catch {
      showBanner(profileCopy.profile.saveFailed);
    }
  });

  const onChangeAvatar = async () => {
    setUploading(true);
    try {
      const up = await pickAndUpload('avatar');
      if (!up) return;
      const updated = await updateProfile({ avatarObjectKey: up.presign.objectKey });
      setProfile(updated);
    } catch {
      showBanner(profileCopy.errors.unknown);
    } finally {
      setUploading(false);
    }
  };

  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable
        onPress={() => void onChangeAvatar()}
        style={styles.avatarBtn}
        accessibilityRole="button"
      >
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]} />
        )}
        <Text style={styles.link}>
          {uploading ? profileCopy.profile.avatarUploading : profileCopy.profile.avatarChange}
        </Text>
      </Pressable>

      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.profile.nameLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="bio"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.profile.bioLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            multiline
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="city"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.profile.cityLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="stateCode"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.profile.stateLabel}
            value={field.value ?? ''}
            onChangeText={(v) =>
              field.onChange(v.toUpperCase().slice(0, 2) as UpdateProfileInput['stateCode'])
            }
            autoCapitalize="characters"
            maxLength={2}
            error={fieldState.error?.message}
            placeholder={BRAZIL_STATE_CODES.join(', ')}
          />
        )}
      />

      {banner ? <Text style={styles.banner}>{banner}</Text> : null}
      <Button label={profileCopy.profile.save} onPress={() => void onSave()} />
      <Button label={authCopy.common.logout} variant="secondary" onPress={() => void logout()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.xl, gap: theme.spacing.md, backgroundColor: theme.colors.bg },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
  },
  avatarBtn: { alignItems: 'center', gap: theme.spacing.xs },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: { backgroundColor: theme.colors.muted },
  link: { color: theme.colors.fg, textDecorationLine: 'underline' },
  banner: { color: theme.colors.muted },
});
