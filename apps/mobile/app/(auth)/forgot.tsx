import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@jdm/shared/auth';
import type { ForgotPasswordInput } from '@jdm/shared/auth';
import { Button, Text } from '@jdm/ui';
import { useRouter } from 'expo-router';
import { ArrowLeft, Mail } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  View,
} from 'react-native';

import { forgotPasswordRequest } from '~/api/auth';
import { ApiError } from '~/api/client';
import { TextField } from '~/components/TextField';
import { authCopy } from '~/copy/auth';

const RESEND_COOLDOWN_SECONDS = 30;

const obscureEmail = (email: string): string => {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 1) return `${local}${domain}`;
  return `${local[0]}${'•'.repeat(Math.max(local.length - 1, 1))}${domain}`;
};

const mapErrorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 404) return authCopy.forgot.notFound;
    if (err.status === 429) return authCopy.errors.rateLimited;
    return authCopy.errors.unknown;
  }
  return authCopy.errors.network;
};

export default function ForgotScreen() {
  const router = useRouter();
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(
    () => () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    },
    [],
  );

  const onSubmit = handleSubmit(async (values) => {
    try {
      await forgotPasswordRequest(values);
      setSentEmail(values.email);
      setResendError(null);
      startCooldown();
    } catch (err) {
      setError('email', { message: mapErrorMessage(err) });
    }
  });

  const onResend = useCallback(async () => {
    if (!sentEmail || cooldown > 0 || resending) return;
    setResending(true);
    setResendError(null);
    try {
      await forgotPasswordRequest({ email: sentEmail });
      startCooldown();
    } catch (err) {
      setResendError(mapErrorMessage(err));
    } finally {
      setResending(false);
    }
  }, [sentEmail, cooldown, resending, startCooldown]);

  const goToLogin = useCallback(() => router.replace('/login'), [router]);
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  }, [router]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center gap-3 h-14 mt-3">
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={authCopy.common.back}
              onPress={goBack}
              hitSlop={12}
              className="w-11 h-11 -ml-2 items-center justify-center active:opacity-60"
            >
              <ArrowLeft size={24} color="#F5F5F5" strokeWidth={1.75} />
            </Pressable>
            <Text variant="h2" weight="semibold" accessibilityRole="header">
              {authCopy.forgot.title}
            </Text>
          </View>

          <View style={{ height: 24 }} />

          {sentEmail === null ? (
            <View accessibilityLiveRegion="polite">
              <Text variant="body" tone="secondary">
                {authCopy.forgot.subtitle}
              </Text>

              <View style={{ height: 24 }} />

              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                  <TextField
                    label={authCopy.forgot.email}
                    placeholder={authCopy.forgot.emailPlaceholder}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    value={value}
                    onChangeText={onChange}
                    error={errors.email?.message}
                    onSubmitEditing={() => void onSubmit()}
                    returnKeyType="send"
                  />
                )}
              />

              <View style={{ height: 24 }} />

              <Button
                label={authCopy.forgot.submit}
                variant="primary"
                size="lg"
                fullWidth
                loading={isSubmitting}
                onPress={() => void onSubmit()}
              />

              <View style={{ height: 16 }} />

              <View className="items-center">
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={authCopy.forgot.back}
                  onPress={goToLogin}
                  hitSlop={12}
                  className="h-11 px-4 items-center justify-center active:opacity-60"
                >
                  <Text tone="muted">{authCopy.forgot.back}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View accessibilityLiveRegion="polite" className="items-center">
              <View
                className="w-[72px] h-[72px] rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(225, 6, 0, 0.12)' }}
              >
                <Mail size={32} color="#F5F5F5" strokeWidth={1.75} />
              </View>

              <View style={{ height: 20 }} />

              <Text variant="h2" weight="semibold" className="text-center">
                {authCopy.forgot.successTitle}
              </Text>

              <View style={{ height: 8 }} />

              <Text variant="body" tone="secondary" className="text-center">
                {authCopy.forgot.successBody(obscureEmail(sentEmail))}
              </Text>

              <View style={{ height: 24 }} />

              <Pressable
                accessibilityRole="link"
                accessibilityLabel={
                  cooldown > 0 ? authCopy.forgot.resendIn(cooldown) : authCopy.forgot.resend
                }
                accessibilityState={{ disabled: cooldown > 0 || resending }}
                onPress={() => void onResend()}
                disabled={cooldown > 0 || resending}
                hitSlop={12}
                className="h-11 px-4 items-center justify-center active:opacity-60"
              >
                <Text tone={cooldown > 0 || resending ? 'muted' : 'brand'} weight="semibold">
                  {cooldown > 0 ? authCopy.forgot.resendIn(cooldown) : authCopy.forgot.resend}
                </Text>
              </Pressable>

              {resendError ? (
                <Text variant="bodySm" tone="danger" className="mt-1 text-center">
                  {resendError}
                </Text>
              ) : null}

              <View style={{ height: 8 }} />

              <Pressable
                accessibilityRole="link"
                accessibilityLabel={authCopy.forgot.back}
                onPress={goToLogin}
                hitSlop={12}
                className="h-11 px-4 items-center justify-center active:opacity-60"
              >
                <Text tone="muted">{authCopy.forgot.back}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
