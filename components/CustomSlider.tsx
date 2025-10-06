import React, { useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

interface CustomSliderProps {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onValueChange: (value: number) => void;
  style?: any;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
}

export default function CustomSlider({
  value,
  minimumValue,
  maximumValue,
  step = 1,
  onValueChange,
  style,
  minimumTrackTintColor = '#3b82f6',
  maximumTrackTintColor = '#334155',
  thumbTintColor = '#3b82f6',
}: CustomSliderProps) {
  const [sliderWidth, setSliderWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const calculateValue = (locationX: number) => {
    const percentage = Math.max(0, Math.min(1, locationX / sliderWidth));
    const range = maximumValue - minimumValue;
    let newValue = minimumValue + percentage * range;

    if (step > 0) {
      newValue = Math.round(newValue / step) * step;
    }

    return Math.max(minimumValue, Math.min(maximumValue, newValue));
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      setIsDragging(true);
      const newValue = calculateValue(evt.nativeEvent.locationX);
      onValueChange(newValue);
    },
    onPanResponderMove: (evt) => {
      const newValue = calculateValue(evt.nativeEvent.locationX);
      onValueChange(newValue);
    },
    onPanResponderRelease: () => {
      setIsDragging(false);
    },
  });

  const percentage = ((value - minimumValue) / (maximumValue - minimumValue)) * 100;

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
    >
      <View style={[styles.track, { backgroundColor: maximumTrackTintColor }]}>
        <View
          style={[
            styles.filledTrack,
            { width: `${percentage}%`, backgroundColor: minimumTrackTintColor },
          ]}
        />
      </View>
      <View
        style={[
          styles.thumb,
          {
            left: `${percentage}%`,
            backgroundColor: thumbTintColor,
            transform: [{ scale: isDragging ? 1.2 : 1 }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  filledTrack: {
    height: '100%',
  },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});
