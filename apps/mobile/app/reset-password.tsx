import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@jdm/shared/auth';
import { Button, Card, Text } from '@jdm/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { resetPasswordRequest } from '~/api/auth';
import { ApiError } from '~/api/client';
import { TextField } from '~/components/TextField';
import { authCopy } from '~/copy/auth';

const formSchema = resetPasswordSchema
  .extend({ confirm: z.string() })
  .refine((d) => d.password === d.confirm, {
    path: ['confirm'],
    message: authCopy.reset.mismatch,
  });

type FormValues = z.infer<typeof formSchema>;

type StrengthTier = 0 | 1 | 2 | 3;

const computeStrength = (pw: string): StrengthTier => {
  if (pw.length === 0) return 0;
  const hasNumber = /\d/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  if (pw.length >= 12 && hasNumber && hasUpper && hasLower && hasSymbol) return 3;
  if (pw.length >= 8 && hasNumber && hasUpper && hasLower) return 2;
  if (pw.length >= 8 && hasNumber) return 1;
  return 0;
};

const strengthLabel = (tier: StrengthTier): string => {
  if (tier === 3) return authCopy.reset.strengthStrong;
  if (tier === 2) return authCopy.reset.strengthMedium;
  if (tier === 1) return authCopy.reset.strengthWeak;
  return '';
};

const strengthTone = (tier: StrengthTier): 'muted' | 'secondary' | 'brand' => {
  if (tier === 3) return 'brand';
  if (tier === 2) return 'secondary';
  return 'muted';
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = (params.token ?? '').trim();
  const hasToken = token.length > 0;

  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { token, password: '', confirm: '' },
  });

  const passwordValue = watch('password');
  const tier = useMemo<StrengthTier>(() => computeStrength(passwordValue ?? ''), [passwordValue]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  }, [router]);

  const goToForgot = useCallback(() => router.replace('/forgot'), [router]);

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await resetPasswordRequest({ token, password });
      router.replace('/login');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          setTokenInvalid(true);
          setError('password', { message: authCopy.reset.invalidLinkTitle });
        } else if (err.status === 422) {
          setError('password', { message: authCopy.errors.weakPassword });
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

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'left', 'right']}>
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
              {authCopy.reset.title}
            </Text>
          </View>

          <View style={{ height: 24 }} />

          {!hasToken ? (
            <NoTokenBlock onRequest={goToForgot} />
          ) : (
            <View accessibilityLiveRegion="polite">
              <Text variant="body" tone="secondary">
                {authCopy.reset.subtitle}
              </Text>

              <View style={{ height: 24 }} />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <View>
                    <TextField
                      label={authCopy.reset.password}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoComplete="password-new"
                      textContentType="newPassword"
                      value={value}
                      onChangeText={onChange}
                      error={errors.password?.message}
                    />
                    <VisibilityToggle
                      visible={showPassword}
                      onPress={() => setShowPassword((v) => !v)}
                    />
                  </View>
                )}
              />

              <StrengthMeter tier={tier} />

              <View style={{ height: 20 }} />

              <Controller
                control={control}
                name="confirm"
                render={({ field: { onChange, value } }) => (
                  <View>
                    <TextField
                      label={authCopy.reset.confirm}
                      secureTextEntry={!showConfirm}
                      autoCapitalize="none"
                      autoComplete="password-new"
                      textContentType="newPassword"
                      value={value}
                      onChangeText={onChange}
                      error={errors.confirm?.message}
                      onSubmitEditing={() => void onSubmit()}
                      returnKeyType="send"
                    />
                    <VisibilityToggle
                      visible={showConfirm}
                      onPress={() => setShowConfirm((v) => !v)}
                    />
                  </View>
                )}
              />

              <View style={{ height: 24 }} />

              <Button
                label={authCopy.reset.submit}
                variant="primary"
                size="lg"
                fullWidth
                loading={isSubmitting}
                onPress={() => void onSubmit()}
              />

              {tokenInvalid ? (
                <>
                  <View style={{ height: 12 }} />
                  <Button
                    label={authCopy.reset.requestNewLink}
                    variant="ghost"
                    size="md"
                    fullWidth
                    onPress={goToForgot}
                  />
                </>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface VisibilityToggleProps {
  visible: boolean;
  onPress: () => void;
}

function VisibilityToggle({ visible, onPress }: VisibilityToggleProps) {
  // Toggle sits over the right edge of the input row. Label is rendered
  // above the input by TextField (≈26pt), input row is 48pt tall — so
  // the 44pt toggle pinned at top:28pt vertically centers inside it.
  const Icon = visible ? EyeOff : Eye;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={visible ? authCopy.reset.hidePassword : authCopy.reset.showPassword}
      accessibilityState={{ selected: visible }}
      onPress={onPress}
      hitSlop={12}
      className="absolute right-2 w-11 h-11 items-center justify-center active:opacity-60"
      style={{ top: 28 }}
    >
      <Icon size={20} color="#C9C9CD" strokeWidth={1.75} />
    </Pressable>
  );
}

interface StrengthMeterProps {
  tier: StrengthTier;
}

function StrengthMeter({ tier }: StrengthMeterProps) {
  const segments: (0 | 1)[] = [tier >= 1 ? 1 : 0, tier >= 2 ? 1 : 0, tier >= 3 ? 1 : 0];
  const label = strengthLabel(tier);
  const tone = strengthTone(tier);
  return (
    <View
      className="mt-2"
      accessibilityRole="progressbar"
      accessibilityLabel={authCopy.reset.strengthLabel}
      accessibilityValue={{ min: 0, max: 3, now: tier }}
    >
      <View className="flex-row gap-1">
        {segments.map((on, i) => (
          <View
            key={i}
            className={`h-1 flex-1 rounded-full ${on ? 'bg-brand' : 'bg-surface-alt'}`}
          />
        ))}
      </View>
      {label ? (
        <Text variant="caption" tone={tone} className="mt-1">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

interface NoTokenBlockProps {
  onRequest: () => void;
}

function NoTokenBlock({ onRequest }: NoTokenBlockProps) {
  return (
    <View accessibilityLiveRegion="polite">
      <Card variant="outlined" padding="lg">
        <Text variant="h3" accessibilityRole="header">
          {authCopy.reset.invalidLinkTitle}
        </Text>
        <View style={{ height: 8 }} />
        <Text variant="body" tone="secondary">
          {authCopy.reset.invalidLinkBody}
        </Text>
      </Card>

      <View style={{ height: 24 }} />

      <Button
        label={authCopy.reset.requestNewLink}
        variant="primary"
        size="lg"
        fullWidth
        onPress={onRequest}
      />
    </View>
  );
}
