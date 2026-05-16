import { privacyPolicySections, PRIVACY_POLICY_VERSION } from '@jdm/shared/legal';
import { Text } from '@jdm/ui';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Pressable, SafeAreaView, ScrollView, View } from 'react-native';

export default function PrivacidadeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 8,
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
          style={{
            height: 44,
            width: 44,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: -8,
          }}
        >
          <ArrowLeft color="#F5F5F5" size={24} strokeWidth={1.75} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="bodySm" tone="muted">
            JDM Experience
          </Text>
          <Text variant="h3" weight="bold">
            Política de privacidade
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="caption" tone="muted" style={{ marginBottom: 24 }}>
          Versão: {PRIVACY_POLICY_VERSION} · Vigência: 14 de maio de 2026
        </Text>

        {privacyPolicySections.map((section) => (
          <View key={section.id} style={{ marginBottom: 28 }}>
            <Text variant="bodyMd" weight="semibold" style={{ marginBottom: 8 }}>
              {section.title}
            </Text>
            <PolicyBody text={section.body} />
          </View>
        ))}

        <View
          style={{ borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingTop: 16, marginTop: 8 }}
        >
          <Text variant="caption" tone="muted">
            Dúvidas? Fale com nosso Encarregado:{'\n'}privacidade@jdmexperience.com.br
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PolicyBody({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  const rendered: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith('|')) return;
    if (line.startsWith('- ')) {
      rendered.push(
        <Text key={i} variant="bodySm" tone="secondary" style={{ marginBottom: 4 }}>
          {'• '}
          {line.slice(2).replace(/\*\*/g, '')}
        </Text>,
      );
    } else if (line.startsWith('**') && line.endsWith('**')) {
      rendered.push(
        <Text key={i} variant="bodySm" weight="semibold" style={{ marginTop: 8, marginBottom: 4 }}>
          {line.replace(/\*\*/g, '')}
        </Text>,
      );
    } else {
      rendered.push(
        <Text key={i} variant="bodySm" tone="secondary" style={{ marginBottom: 4 }}>
          {line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1')}
        </Text>,
      );
    }
  });

  return <View>{rendered}</View>;
}
