import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@jdm/shared/auth';
import type { ForgotPasswordInput } from '@jdm/shared/auth';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { forgotPasswordRequest } from '~/api/auth';
import { Button } from '~/components/Button';
import { TextField } from '~/components/TextField';
import { authCopy } from '~/copy/auth';
import { theme } from '~/theme';

export default function ForgotScreen() {
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await forgotPasswordRequest(values);
    setSent(true);
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{authCopy.forgot.title}</Text>
      {!sent ? (
        <>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <TextField
                label={authCopy.forgot.email}
                autoCapitalize="none"
                keyboardType="email-address"
                value={value}
                onChangeText={onChange}
                error={errors.email?.message}
              />
            )}
          />
          <Button
            label={isSubmitting ? authCopy.common.loading : authCopy.forgot.submit}
            onPress={() => void onSubmit()}
          />
        </>
      ) : (
        <Text style={styles.body}>{authCopy.forgot.sent}</Text>
      )}
      <Link style={styles.link} href="/login">
        {authCopy.common.back}
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  title: { color: theme.colors.fg, fontSize: theme.font.size.xxl, fontWeight: '700' },
  body: { color: theme.colors.fg, fontSize: theme.font.size.md },
  link: { color: theme.colors.fg, fontSize: theme.font.size.md, textDecorationLine: 'underline' },
});
