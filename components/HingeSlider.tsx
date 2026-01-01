import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View
} from 'react-native';

type HingeSliderProps = {
  value: number;                 // current value
  minimumValue?: number;         // default 0
  maximumValue?: number;         // default 100
  step?: number;                 // default 1
  onValueChange?: (v: number) => void;
  onSlidingComplete?: (v: number) => void;

  // styling
  trackHeight?: number;          // default 10
  trackColor?: string;           // default '#334155'
  fillColor?: string;            // default '#5b8def'
  hingeColor?: string;           // default '#5b8def'
  hingeCapColor?: string;        // default '#ffffff'
};

export default function HingeSlider({
  value,
  minimumValue = 0,
  maximumValue = 100,
  step = 1,
  onValueChange,
  onSlidingComplete,
  trackHeight = 10,
  trackColor = '#334155',
  fillColor = '#5b8def',
  hingeColor = '#5b8def',
  hingeCapColor = '#ffffff',
  hingeThickness = 6,
  hingeExtra = 8
}: HingeSliderProps) {
  const lastValueRef = React.useRef(value);
  const [width, setWidth] = useState(0);

  // clamp + step helpers
  const clamp = (v: number) => Math.min(maximumValue, Math.max(minimumValue, v));
  const snapToStep = (v: number) => {
    const snapped = Math.round((v - minimumValue) / step) * step + minimumValue;
    return clamp(snapped);
  };

  // progress 0..1
  const progress = useMemo(() => {
    if (maximumValue === minimumValue) return 0;
    return (clamp(value) - minimumValue) / (maximumValue - minimumValue);
  }, [value, minimumValue, maximumValue]);

  // animated X position for the hinge (left-aligned)
  const knobX = useRef(new Animated.Value(0)).current;

  // keep animation in sync on render
  React.useEffect(() => {
    if (width <= 0) return;
    Animated.timing(knobX, {
      toValue: progress * width,
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [progress, width, knobX]);

  const updateFromGesture = (x: number, finished = false) => {
    const localX = Math.min(width, Math.max(0, x));
    const p = width ? localX / width : 0;
    const rawVal = minimumValue + p * (maximumValue - minimumValue);
    const v = snapToStep(rawVal);
    lastValueRef.current = v;            // <— keep latest
    onValueChange?.(v);
    if (finished) onSlidingComplete?.(v);
  };

  const panResponder = React.useMemo(
  () =>
    PanResponder.create({
      // grab immediately; prevents ScrollView from stealing touch
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onMoveShouldSetPanResponderCapture: () => true,

      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX;
        updateFromGesture(x, false);
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        updateFromGesture(x, false);
      },

      // if we keep control, this fires
      onPanResponderRelease: () => {
        onSlidingComplete?.(lastValueRef.current);
      },

      // if parent steals it, still emit the last value
      onPanResponderTerminate: () => {
        onSlidingComplete?.(lastValueRef.current);
      },

      // try to prevent termination by parent (e.g., ScrollView)
      onPanResponderTerminationRequest: () => false,
    }),
  [width, minimumValue, maximumValue, step]
);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  // sizes for the hinge look
  const hingeWidth = 22;   // rectangular “arm”
  const hingeHeight = Math.max(18, trackHeight + 6);
  const capSize = 14;      // round cap at the end
  const thumbX = progress * width;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.track,
          { height: trackHeight, backgroundColor: trackColor, borderRadius: 6 },
        ]}
        onLayout={onLayout}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        {...panResponder.panHandlers}
      >
        {/* Filled portion */}
        <Animated.View
          style={[
            styles.fill,
            {
              height: trackHeight,
              backgroundColor: fillColor,
              width: Animated.add(knobX, new Animated.Value(hingeWidth / 2)), // fill to hinge center
              borderTopLeftRadius: 6,
              borderBottomLeftRadius: 6,
              borderTopRightRadius: 4,
              borderBottomRightRadius: 4,
            },
          ]}
        />

        {/* Hinge thumb */}
        <Animated.View
          style={[
            styles.hingeWrap,
            {
              transform: [
                { translateX: Animated.subtract(knobX, hingeWidth / 2) },
                { translateY: -(hingeHeight - trackHeight) / 2 },
              ],
              width: hingeWidth,
              height: hingeHeight,
            },
          ]}
          pointerEvents="none"
        >
          {/* Rectangular arm */}
          <View
            style={[
              styles.hingeRect,
              {
                backgroundColor: hingeColor,
                width: hingeWidth,
                height: hingeHeight,
                borderTopLeftRadius: 6,
                borderBottomLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomRightRadius: 6,
              },
            ]}
          />
          {/* Circular cap (hinge end) */}
          <View
            style={[
              styles.cap,
              {
                width: capSize,
                height: capSize,
                borderRadius: capSize / 2,
                backgroundColor: hingeCapColor,
                borderColor: hingeColor,
                borderWidth: 2,
                position: 'absolute',
                right: -capSize / 2, // stick out on the end
                top: (hingeHeight - capSize) / 2,
              },
            ]}
          />
          
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  track: {
    width: '100%',
    backgroundColor: '#334155',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  hingeWrap: {
    position: 'absolute',
    top: 0,
  },
  hingeRect: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  cap: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
