import { zodResolver } from '@hookform/resolvers/zod';
import { signupSchema } from '@jdm/shared/auth';
import type { SignupInput } from '@jdm/shared/auth';
import { Button, Text } from '@jdm/ui';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  View,
} from 'react-native';

import { ApiError } from '~/api/client';
import { useAuth } from '~/auth/context';
import { TextField } from '~/components/TextField';
import { authCopy } from '~/copy/auth';

type FieldName = 'name' | 'email' | 'password';

const FIELD_KEYS: readonly FieldName[] = ['name', 'email', 'password'] as const;

const isFieldName = (k: string): k is FieldName => (FIELD_KEYS as readonly string[]).includes(k);

export default function SignupScreen() {
  const { signup } = useAuth();
  const router = useRouter();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', name: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signup(values);
      router.replace({
        pathname: '/verify-email-pending',
        params: { email: values.email },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError('email', { message: authCopy.errors.emailExists });
        } else if (err.status === 422 || err.status === 400) {
          const mapped = mapFieldErrors(err.body);
          if (mapped) {
            for (const [field, message] of Object.entries(mapped)) {
              setError(field as FieldName, { message });
            }
          } else {
            setError('password', { message: authCopy.errors.unknown });
          }
        } else if (err.status === 429) {
          setError('password', { message: authCopy.errors.rateLimited });
        } else {
          setError('password', { message: authCopy.errors.unknown });
        }
      } else {
        setError('password', { message: authCopy.errors.network });
      }
    }
  });

  const canSubmit = termsAccepted && !isSubmitting;
  const passwordError = errors.password?.message;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pt-2 pb-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-start gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={authCopy.signup.back}
              onPress={() => router.back()}
              hitSlop={12}
              className="h-12 w-12 -ml-3 items-center justify-center active:opacity-70"
            >
              <ArrowLeft size={24} color="#F5F5F5" strokeWidth={1.75} />
            </Pressable>
            <View className="flex-1 pt-2 gap-1">
              <Text variant="eyebrow" tone="muted">
                {authCopy.signup.eyebrow}
              </Text>
              <Text variant="h2" weight="bold" accessibilityRole="header">
                {authCopy.signup.title}
              </Text>
            </View>
          </View>

          <View style={{ height: 24 }} />

          <View accessibilityLiveRegion="polite">
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, value } }) => (
                <TextField
                  label={authCopy.signup.name}
                  placeholder={authCopy.signup.namePlaceholder}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  value={value}
                  onChangeText={onChange}
                  error={errors.name?.message}
                />
              )}
            />

            <View style={{ height: 20 }} />

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
                  textContentType="emailAddress"
                  value={value}
                  onChangeText={onChange}
                  error={errors.email?.message}
                />
              )}
            />

            <View style={{ height: 20 }} />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <TextField
                  label={authCopy.signup.password}
                  secureTextEntry
                  autoComplete="password-new"
                  textContentType="newPassword"
                  value={value}
                  onChangeText={onChange}
                  error={passwordError}
                />
              )}
            />

            {!passwordError ? (
              <Text variant="bodySm" tone="muted" className="mt-2">
                {authCopy.signup.passwordHint}
              </Text>
            ) : null}
          </View>

          <View style={{ height: 20 }} />

          <ConsentRow
            checked={termsAccepted}
            onToggle={() => setTermsAccepted((v) => !v)}
            accessibilityLabel={`${authCopy.signup.termsPrefix}${authCopy.signup.termsLink}${authCopy.signup.termsBetween}${authCopy.signup.privacyLink}`}
          >
            <Text variant="bodySm" tone="secondary">
              {authCopy.signup.termsPrefix}
              <Text tone="brand" weight="semibold">
                {authCopy.signup.termsLink}
              </Text>
              {authCopy.signup.termsBetween}
              <Text tone="brand" weight="semibold">
                {authCopy.signup.privacyLink}
              </Text>
              {authCopy.signup.termsSuffix}
            </Text>
          </ConsentRow>

          <View style={{ height: 12 }} />

          <ConsentRow
            checked={marketingOptIn}
            onToggle={() => setMarketingOptIn((v) => !v)}
            accessibilityLabel={authCopy.signup.marketingConsent}
          >
            <Text variant="bodySm" tone="muted">
              {authCopy.signup.marketingConsent}
            </Text>
          </ConsentRow>

          <View style={{ height: 32 }} />

          <Button
            label={authCopy.signup.submit}
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting}
            disabled={!canSubmit}
            onPress={() => void onSubmit()}
          />

          <View style={{ height: 24 }} />

          <View className="flex-row items-center justify-center">
            <Text tone="muted">{authCopy.signup.haveAccountPrefix}</Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={authCopy.signup.haveAccountLink}
              onPress={() => router.replace('/login')}
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

interface ConsentRowProps {
  checked: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}

function ConsentRow({ checked, onToggle, accessibilityLabel, children }: ConsentRowProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={onToggle}
      hitSlop={8}
      className="flex-row items-start gap-3 active:opacity-70"
    >
      <View
        className={`h-6 w-6 items-center justify-center rounded-md border ${
          checked ? 'bg-brand border-brand' : 'bg-transparent border-border-strong'
        }`}
      >
        {checked ? <Check size={16} color="#0A0A0A" strokeWidth={2.5} /> : null}
      </View>
      <View className="flex-1">{children}</View>
    </Pressable>
  );
}

const mapFieldErrors = (body: unknown): Partial<Record<FieldName, string>> | null => {
  if (!body || typeof body !== 'object') return null;
  const fields = (body as { fields?: unknown }).fields;
  if (!fields || typeof fields !== 'object') return null;
  const out: Partial<Record<FieldName, string>> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (isFieldName(key) && typeof value === 'string') {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
};
