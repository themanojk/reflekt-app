import React from 'react';
import { StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';

interface CustomSliderProps {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onValueChange: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  style?: any;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  fullBleed?: boolean;
}

export default function CustomSlider({
  value,
  minimumValue,
  maximumValue,
  step = 1,
  onValueChange,
  onSlidingComplete,
  style,
  minimumTrackTintColor = '#3b82f6',
  maximumTrackTintColor = '#334155',
  thumbTintColor = '#3b82f6',
  fullBleed = false,
}: CustomSliderProps) {
  return (
    <View style={[styles.container, style]}>
      <Slider
        style={[styles.slider, fullBleed && styles.sliderFullBleed]}
        value={value}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        onValueChange={onValueChange}
        onSlidingComplete={onSlidingComplete}
        minimumTrackTintColor={minimumTrackTintColor}
        maximumTrackTintColor={maximumTrackTintColor}
        thumbTintColor={thumbTintColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    minHeight: 32,
    overflow: 'visible',
  },
  slider: {
    width: '100%',
    height: 32,
  },
  sliderFullBleed: {
    width: '145%',
    marginLeft: -12,
    marginRight: -34,
  },
});
