import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  StyleProp,
  ViewStyle,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CardStackProps<T> {
  items: T[];
  renderCard: (item: T) => React.ReactNode;
  onSwipeLeft?: (item: T) => void;
  onSwipeRight?: (item: T) => void;
  style?: StyleProp<ViewStyle>;
}

export default function CardStack<T extends { id: string | number }>({
  items,
  renderCard,
  onSwipeLeft,
  onSwipeRight,
  style,
}: CardStackProps<T>) {
  const [index, setIndex] = useState(0);
  const pan = useRef(new Animated.ValueXY()).current;

  useEffect(() => {
    if (index >= items.length) {
      requestAnimationFrame(() => setIndex(0));
    }
  }, [items.length, index]);

  const next = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    pan.setValue({ x: 0, y: 0 });
    setIndex((prev) => (prev + 1) % items.length);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x }], 
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (e, gesture) => {
        const threshold = 100;
        if (gesture.dx > threshold) {
          Animated.timing(pan, {
            toValue: { x: 500, y: 0 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            onSwipeRight?.(items[index]);
            next();
          });
        } else if (gesture.dx < -threshold) {
          Animated.timing(pan, {
            toValue: { x: -500, y: 0 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            onSwipeLeft?.(items[index]);
            next();
          });
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={[styles.container, style]}>
      {items.map((item, i) => {
        if (i < index) return null;
        const isTop = i === index;

        if (isTop) {
          return (
            <Animated.View
              key={item.id}
              style={[
                styles.card,
                {
                  zIndex: items.length - i,
                  transform: pan.getTranslateTransform(),
                },
              ]}
              {...panResponder.panHandlers}
            >
              {renderCard(item)}
            </Animated.View>
          );
        }

        return (
          <Animated.View
            key={item.id}
            style={[
              styles.card,
              {
                zIndex: items.length - i,
                transform: [
                  { scale: 0.95 },
                  { translateY: 10 * (i - index) },
                ],
              },
            ]}
          >
            {renderCard(item)}
          </Animated.View>
        );
      }).reverse()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
    height: 200, 
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
});
