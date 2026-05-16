import { zodResolver } from '@hookform/resolvers/zod';
import { signupSchema } from '@jdm/shared/auth';
import type { SignupInput } from '@jdm/shared/auth';
import { Button, Text } from '@jdm/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  View,
} from 'react-native';

import { ApiError } from '~/api/client';
import { useAuth } from '~/auth/context';
import { buildLoginHref, sanitizeNext } from '~/auth/redirect-intent';
import { TextField } from '~/components/TextField';
import { authCopy } from '~/copy/auth';

function parseDobInput(raw: string): string | null {
  // Accepts DD/MM/AAAA and returns YYYY-MM-DD, or null if invalid
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const d = parseInt(dd, 10);
  const m = parseInt(mm, 10);
  const y = parseInt(yyyy, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function isAdult(isoDate: string): boolean {
  const dob = new Date(`${isoDate}T00:00:00.000Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age >= 18;
}

export default function SignupScreen() {
  const { signup } = useAuth();
  const router = useRouter();
  const { next: nextParam } = useLocalSearchParams<{ next?: string }>();
  const next = sanitizeNext(nextParam);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [dobRaw, setDobRaw] = useState('');
  const {
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', name: '', dateOfBirth: '' },
  });

  function handleDobChange(text: string) {
    setDobRaw(text);
    const iso = parseDobInput(text);
    setValue('dateOfBirth', iso ?? text, { shouldValidate: false });
  }

  function showUnderageAlert() {
    Alert.alert(authCopy.signup.underageTitle, authCopy.signup.underageBody, [
      { text: authCopy.signup.underageDismiss, style: 'default' },
    ]);
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!termsAccepted) {
      setTermsError(authCopy.signup.termsRequired);
      return;
    }
    setTermsError(null);

    const iso = parseDobInput(dobRaw);
    if (!iso) {
      setError('dateOfBirth', { message: authCopy.signup.dobInvalid });
      return;
    }
    if (!isAdult(iso)) {
      showUnderageAlert();
      return;
    }

    try {
      await signup({ ...values, dateOfBirth: iso });
      router.replace({
        pathname: '/verify-email-pending',
        params: next ? { email: values.email, next } : { email: values.email },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const body = err.body as { code?: string } | undefined;
        if (body?.code === 'UNDERAGE') {
          showUnderageAlert();
          return;
        }
      }
      if (err instanceof ApiError && err.status === 409) {
        setError('email', { message: authCopy.errors.emailExists });
      } else if (err instanceof ApiError && (err.status === 400 || err.status === 422)) {
        setError('password', { message: authCopy.errors.weakPassword });
      } else if (err instanceof ApiError && err.status === 429) {
        setError('password', { message: authCopy.errors.rateLimited });
      } else if (err instanceof ApiError) {
        setError('password', { message: authCopy.errors.unknown });
      } else {
        setError('password', { message: authCopy.errors.network });
      }
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-bg" style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <KeyboardAvoidingView
        className="flex-1"
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, flexGrow: 1 }}
          contentContainerClassName="px-5 pb-8 flex-grow"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-start pt-4 pb-2 gap-3">
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={authCopy.common.back}
              hitSlop={8}
              className="h-11 w-11 items-center justify-center -ml-2 active:opacity-70"
            >
              <ArrowLeft color="#F5F5F5" size={24} strokeWidth={1.75} />
            </Pressable>
            <View className="flex-1">
              <Text variant="bodySm" tone="muted">
                {authCopy.signup.eyebrow}
              </Text>
              <Text variant="h2" weight="bold">
                {authCopy.signup.title}
              </Text>
            </View>
          </View>

          <View className="pt-6 gap-4">
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, value } }) => (
                <TextField
                  label={authCopy.signup.name}
                  placeholder={authCopy.signup.namePlaceholder}
                  value={value}
                  onChangeText={onChange}
                  error={errors.name?.message}
                />
              )}
            />

            <TextField
              label={authCopy.signup.dob}
              placeholder={authCopy.signup.dobPlaceholder}
              value={dobRaw}
              onChangeText={handleDobChange}
              keyboardType="numeric"
              error={errors.dateOfBirth?.message}
              hint={!errors.dateOfBirth?.message ? authCopy.signup.dobHint : undefined}
            />

            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value } }) => (
                <TextField
                  label={authCopy.signup.email}
                  placeholder={authCopy.signup.emailPlaceholder}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={value}
                  onChangeText={onChange}
                  error={errors.email?.message}
                />
              )}
            />

            <View>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <TextField
                    label={authCopy.signup.password}
                    secureTextEntry
                    value={value}
                    onChangeText={onChange}
                    error={errors.password?.message}
                  />
                )}
              />
              {!errors.password?.message ? (
                <Text variant="caption" tone="muted" className="mt-2">
                  {authCopy.signup.passwordHint}
                </Text>
              ) : null}
            </View>

            <View className="flex-row items-start pt-2 gap-3">
              <Pressable
                onPress={() => {
                  setTermsAccepted((v) => !v);
                  if (!termsAccepted) setTermsError(null);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: termsAccepted }}
                accessibilityLabel="Aceito os termos e a política de privacidade"
                hitSlop={8}
                className="active:opacity-70"
              >
                <View
                  className={
                    'h-6 w-6 rounded-md border items-center justify-center ' +
                    (termsAccepted ? 'bg-brand border-brand' : 'border-border-strong')
                  }
                >
                  {termsAccepted ? <Check color="#0A0A0A" size={16} strokeWidth={3} /> : null}
                </View>
              </Pressable>
              <Text variant="bodySm" tone="secondary" className="flex-1">
                {authCopy.signup.termsAccept}
                <Text variant="bodySm" tone="brand" weight="semibold">
                  {authCopy.signup.termsLink}
                </Text>
                {authCopy.signup.termsAnd}
                <Text
                  variant="bodySm"
                  tone="brand"
                  weight="semibold"
                  onPress={() => router.push('/(auth)/privacidade' as never)}
                  accessibilityRole="link"
                >
                  {authCopy.signup.privacyLink}
                </Text>
              </Text>
            </View>
            {termsError ? (
              <Text variant="bodySm" tone="danger" className="-mt-1">
                {termsError}
              </Text>
            ) : null}

            <View className="pt-4">
              <Button
                label={authCopy.signup.submit}
                variant="primary"
                size="lg"
                fullWidth
                loading={isSubmitting}
                disabled={!termsAccepted}
                onPress={() => void onSubmit()}
              />
            </View>
          </View>

          <View className="flex-1" />

          <View className="flex-row items-center justify-center pt-6">
            <Text tone="muted">{authCopy.signup.haveAccountPrefix}</Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={authCopy.signup.haveAccountLink}
              onPress={() => router.replace(buildLoginHref(next) as never)}
              hitSlop={8}
            >
              <Text tone="brand" weight="semibold">
                {authCopy.signup.haveAccountLink}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
