import React, { useMemo } from 'react';
import { View, Text, Dimensions } from 'react-native';
import tw from 'twrnc';
import { CandlestickChart } from 'react-native-wagmi-charts';
import { HistoricalData } from '../types';

interface Props {
  data: HistoricalData[];
}

export default function ChartWidget({ data }: Props) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map(d => ({
      timestamp: new Date(d.date).getTime(),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
    })).sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <View style={tw`flex-1 items-center justify-center`}>
        <Text style={tw`text-zinc-500 text-xs`}>暫無圖表數據</Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-zinc-950 p-2`}>
      <CandlestickChart.Provider data={chartData}>
        <CandlestickChart height={Dimensions.get('window').height * 0.4}>
          <CandlestickChart.Candles 
            positiveColor="#10b981" 
            negativeColor="#f43f5e" 
          />
          <CandlestickChart.Crosshair>
            <CandlestickChart.Tooltip />
          </CandlestickChart.Crosshair>
        </CandlestickChart>
        
        <View style={tw`flex-row justify-between mt-4 px-2`}>
          <View>
            <CandlestickChart.PriceText type="open" style={tw`text-zinc-400 text-[10px]`} />
            <CandlestickChart.PriceText type="high" style={tw`text-zinc-400 text-[10px]`} />
          </View>
          <View>
            <CandlestickChart.PriceText type="low" style={tw`text-zinc-400 text-[10px]`} />
            <CandlestickChart.PriceText type="close" style={tw`text-zinc-100 font-bold text-xs`} />
          </View>
          <View>
             <CandlestickChart.DatetimeText style={tw`text-zinc-500 text-[10px]`} />
          </View>
        </View>
      </CandlestickChart.Provider>
    </View>
  );
}
