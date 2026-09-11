import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Insight, InsightKind } from '@ai/core';
import { colors, radius, space, type } from '../theme/tokens';
import { Icon } from './Icon';
import { Card } from './ui';

/**
 * Each insight kind gets its own colour and its own word. The product promises
 * never to present a projection as a measurement, and this mapping is where
 * that promise is actually kept in the interface.
 */
const KIND_STYLE: Record<InsightKind, { label: string; color: string; soft: string }> = {
  fact: { label: 'Measured', color: colors.text, soft: 'rgba(255,255,255,0.07)' },
  metric: { label: 'Analysis', color: colors.cyan, soft: colors.cyanSoft },
  prediction: { label: 'Projection', color: colors.violet, soft: colors.violetSoft },
  recommendation: { label: 'Suggested', color: colors.accent, soft: colors.accentSoft },
};

export const InsightCard = ({ insight, compact = false }: { insight: Insight; compact?: boolean }) => {
  const [showEvidence, setShowEvidence] = useState(false);
  const style = KIND_STYLE[insight.kind];
  const evidenceEntries = Object.entries(insight.evidence).filter(([, v]) => v !== null);

  return (
    <Card style={{ borderColor: showEvidence ? style.soft : colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 8,
            backgroundColor: style.soft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={
              insight.kind === 'recommendation'
                ? 'target'
                : insight.kind === 'prediction'
                  ? 'sparkle'
                  : insight.kind === 'metric'
                    ? 'trendUp'
                    : 'pulse'
            }
            size={14}
            color={style.color}
            strokeWidth={2.2}
          />
        </View>
        <Text style={[type.label, { color: style.color }]}>{style.label}</Text>

        {insight.confidence != null ? (
          <Text style={[type.label, { color: colors.textTertiary, marginLeft: 'auto' }]}>
            {Math.round(insight.confidence * 100)}% confidence
          </Text>
        ) : null}
      </View>

      <Text style={[type.subtitle, { marginBottom: 6 }]}>{insight.headline}</Text>
      <Text style={[type.body, { lineHeight: 22 }]} numberOfLines={compact ? 3 : undefined}>
        {insight.body}
      </Text>

      {evidenceEntries.length > 0 && !compact ? (
        <>
          <Pressable
            onPress={() => setShowEvidence((v) => !v)}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.md }}
          >
            <Text style={[type.label, { color: colors.textTertiary }]}>
              {showEvidence ? 'Hide' : 'Show'} the numbers
            </Text>
            <Icon
              name={showEvidence ? 'chevronLeft' : 'chevronRight'}
              size={12}
              color={colors.textTertiary}
            />
          </Pressable>

          {showEvidence ? (
            <View
              style={{
                marginTop: space.md,
                padding: space.md,
                borderRadius: radius.sm,
                backgroundColor: 'rgba(255,255,255,0.03)',
                gap: 6,
              }}
            >
              {evidenceEntries.map(([key, value]) => (
                <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[type.caption, { color: colors.textTertiary, fontSize: 12 }]}>
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                  </Text>
                  <Text
                    style={[
                      type.caption,
                      { color: colors.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
                    ]}
                  >
                    {typeof value === 'number' ? Math.round(value * 1000) / 1000 : String(value)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
};
