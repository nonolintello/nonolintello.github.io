import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Icon } from '../../src/components/Icon';
import { Body, Button, Caption, Card, Label, Row } from '../../src/components/ui';
import { useApp } from '../../src/data/store';
import { colors, hairline, radius, space, type } from '../../src/theme/tokens';

/**
 * Coach sign-in. One form serves both register and login: an email that
 * exists signs in, one that doesn't creates the account. Real auth sits behind
 * the repository; the demo just needs a coach to be someone.
 */
export default function CoachLoginScreen() {
  const router = useRouter();
  const { signInCoach } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('priya@moov.coach');
  const [name, setName] = useState('');
  const [credential, setCredential] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await signInCoach({ email, displayName: name, credential });
      router.replace('/coach');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.xl }}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={{ alignSelf: 'flex-start' }}>
        <Row gap={4}>
          <Icon name="chevronLeft" size={20} color={colors.textSecondary} />
          <Text style={[type.caption, { color: colors.textSecondary, fontWeight: '600' }]}>Back</Text>
        </Row>
      </Pressable>

      <View>
        <Label style={{ color: colors.cyan }}>MOOV for coaches</Label>
        <Text style={[type.display, { fontSize: 34, lineHeight: 38, marginTop: space.sm }]}>
          {mode === 'login' ? 'Welcome back, coach' : 'Start coaching on MOOV'}
        </Text>
        <Body style={{ marginTop: space.md, lineHeight: 21 }}>
          MOOV understands your athletes — their fitness, recovery, records and readiness. You use that to coach
          them. They use MOOV to execute and understand the plan.
        </Body>
      </View>

      <Card style={{ gap: space.lg }}>
        <Row style={{ gap: space.sm }}>
          {(['login', 'register'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: radius.pill,
                alignItems: 'center',
                backgroundColor: mode === m ? colors.surfaceRaised : 'transparent',
                borderWidth: hairline,
                borderColor: mode === m ? colors.borderStrong : 'transparent',
              }}
            >
              <Text style={[type.caption, { fontWeight: '700', color: mode === m ? colors.text : colors.textTertiary }]}>
                {m === 'login' ? 'Sign in' : 'Register'}
              </Text>
            </Pressable>
          ))}
        </Row>

        <View>
          <Label style={{ marginBottom: space.sm }}>Email</Label>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@club.run"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
          />
        </View>

        {mode === 'register' ? (
          <>
            <View>
              <Label style={{ marginBottom: space.sm }}>Name</Label>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Coach name"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
              />
            </View>
            <View>
              <Label style={{ marginBottom: space.sm }}>Credential</Label>
              <TextInput
                value={credential}
                onChangeText={setCredential}
                placeholder="e.g. UESCA certified, club head coach"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
              />
            </View>
          </>
        ) : (
          <View>
            <Label style={{ marginBottom: space.sm }}>Password</Label>
            <TextInput
              value="••••••••"
              editable={false}
              secureTextEntry
              style={[styles.input, { color: colors.textTertiary }]}
            />
            <Caption style={{ marginTop: space.sm, fontSize: 11.5, color: colors.textTertiary }}>
              Demo account — the password is prefilled.
            </Caption>
          </View>
        )}

        <Button onPress={submit}>{busy ? '…' : mode === 'login' ? 'Sign in as coach' : 'Create coach account'}</Button>
      </Card>

      <Caption style={{ textAlign: 'center', fontSize: 11.5, color: colors.textTertiary }}>
        Try priya@moov.coach — Priya already coaches two athletes on MOOV.
      </Caption>
    </Screen>
  );
}

const styles = {
  input: {
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    color: colors.text,
    fontSize: 15,
  },
};
