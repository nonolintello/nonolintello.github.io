import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SUGGESTED_QUESTIONS, type Insight } from '@ai/core';
import { useApp } from '../data/store';
import { colors, hairline, radius, space, type } from '../theme/tokens';
import { Icon } from './Icon';
import { InsightCard } from './InsightCard';
import { Card, Caption, Label, Row } from './ui';

/**
 * The conversational surface of Intelligence.
 *
 * Answers come from the same analytics the rest of the app renders, so a
 * question and a dashboard card can never disagree. Suggested questions are
 * offered up front because a blank prompt gives no clue what the system can
 * actually reason about.
 */
export const AskMoov = () => {
  const { askQuestion } = useApp();
  const [draft, setDraft] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Insight[]>([]);
  const [pending, setPending] = useState(false);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setAsked(trimmed);
    setDraft('');
    try {
      setAnswers(await askQuestion(trimmed));
    } finally {
      setPending(false);
    }
  };

  return (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
        <Row gap={6}>
          <Icon name="sparkle" size={14} color={colors.violet} />
          <Label style={{ color: colors.violet }}>Ask MOOV</Label>
        </Row>
        {asked ? (
          <Pressable
            onPress={() => {
              setAsked(null);
              setAnswers([]);
            }}
            hitSlop={8}
          >
            <Text style={[type.caption, { color: colors.textTertiary }]}>Clear</Text>
          </Pressable>
        ) : null}
      </Row>

      <Card style={{ paddingVertical: space.md }}>
        <Row gap={space.sm}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => ask(draft)}
            placeholder="Ask about your training…"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="send"
            style={{
              flex: 1,
              color: colors.text,
              fontSize: 15,
              paddingVertical: space.sm,
            }}
          />
          <Pressable
            onPress={() => ask(draft)}
            hitSlop={8}
            accessibilityLabel="Send question"
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.sm,
              backgroundColor: draft.trim() ? colors.violet : 'rgba(255,255,255,0.06)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon
              name="send"
              size={16}
              color={draft.trim() ? colors.textInverse : colors.textTertiary}
              strokeWidth={2}
            />
          </Pressable>
        </Row>
      </Card>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm, paddingVertical: space.md }}
      >
        {SUGGESTED_QUESTIONS.map((question) => (
          <Pressable
            key={question}
            onPress={() => ask(question)}
            style={({ pressed }) => [
              {
                paddingHorizontal: space.md,
                paddingVertical: 9,
                borderRadius: radius.pill,
                borderWidth: hairline,
                borderColor: asked === question ? colors.violet : colors.border,
                backgroundColor: asked === question ? colors.violetSoft : 'rgba(255,255,255,0.03)',
              },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: asked === question ? colors.violet : colors.textSecondary,
              }}
            >
              {question}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {asked ? (
        <View style={{ gap: space.md }}>
          <Caption style={{ color: colors.textTertiary }}>“{asked}”</Caption>
          {pending ? (
            <Card>
              <Row gap={space.sm}>
                <ActivityIndicator color={colors.violet} size="small" />
                <Caption>Reading your training data…</Caption>
              </Row>
            </Card>
          ) : (
            answers.map((answer) => <InsightCard key={answer.id} insight={answer} />)
          )}
        </View>
      ) : null}
    </View>
  );
};
