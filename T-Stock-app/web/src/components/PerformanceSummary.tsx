import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingUp, TrendingDown, Target, Activity } from 'lucide-react-native';
import { Trade } from '../types';

interface PerformanceSummaryProps {
  trades: Trade[];
}

export const PerformanceSummary: React.FC<PerformanceSummaryProps> = React.memo(({ trades }) => {
  const { totalPnL, winRate, maxDrawdown } = useMemo(() => {
    const total = trades.reduce((acc, t) => acc + (t.pnl ?? 0), 0);
    const wins = trades.filter(t => (t.pnl ?? 0) > 0).length;
    const wr = trades.length > 0 ? (wins / trades.length) * 100 : 0;

    let peak = 0;
    let mdd = 0;
    let running = 0;

    trades.forEach(t => {
      running += (t.pnl ?? 0);
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > mdd) mdd = dd;
    });

    return { totalPnL: total, winRate: wr, maxDrawdown: mdd };
  }, [trades]);

  return (
    <View style={styles.container}>
      <SummaryCard
        title="總損益 (PnL)"
        value={`${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}`}
        icon={Activity}
        color={totalPnL >= 0 ? styles.positive : styles.negative}
      />
      <SummaryCard
        title="勝率 (Win Rate)"
        value={`${winRate.toFixed(1)}%`}
        icon={Target}
        color={styles.sky}
      />
      <SummaryCard
        title="最大回撤 (Max DD)"
        value={`${maxDrawdown.toFixed(2)}`}
        icon={TrendingDown}
        color={styles.negative}
      />
      <SummaryCard
        title="交易次數"
        value={trades.length.toString()}
        icon={TrendingUp}
        color={styles.neutral}
      />
    </View>
  );
});
PerformanceSummary.displayName = 'PerformanceSummary';

interface SummaryCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  color: any;
}

function SummaryCard({ title, value, icon: Icon, color }: SummaryCardProps) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, color]}>
        <Icon size={20} color={getIconColor(color)} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.value, color]}>{value}</Text>
      </View>
    </View>
  );
}

function getIconColor(colorStyle: any) {
  if (colorStyle === styles.positive) return '#34d399';
  if (colorStyle === styles.negative) return '#fda4af';
  if (colorStyle === styles.sky) return '#38bdf8';
  return '#a1a1aa';
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  card: {
    flexBasis: '100%',
    flexGrow: 1,
    flexShrink: 1,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: 'rgba(24, 24, 27, 0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconWrap: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(39, 39, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flexShrink: 1,
  },
  title: {
    fontSize: 14,
    color: '#a1a1aa',
    fontWeight: '500',
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  positive: {
    color: '#34d399',
  },
  negative: {
    color: '#fda4af',
  },
  sky: {
    color: '#38bdf8',
  },
  neutral: {
    color: '#a1a1aa',
  },
});
