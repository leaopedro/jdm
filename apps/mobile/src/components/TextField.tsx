import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { theme } from '../theme';

type Props = TextInputProps & {
  label: string;
  error: string | undefined;
};

export const TextField = ({ label, error, style, ...rest }: Props) => (
  <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      accessibilityLabel={error ? `${label}, error: ${error}` : label}
      placeholderTextColor={theme.colors.muted}
      style={[styles.input, error ? styles.inputError : null, style]}
      {...rest}
    />
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.xs },
  label: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  input: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg,
  },
  inputError: { borderColor: theme.colors.accent },
  error: { color: theme.colors.accent, fontSize: theme.font.size.sm },
});
