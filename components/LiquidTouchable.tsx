import React from "react";
import {
  GestureResponderEvent,
  Insets,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";
import Reanimated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

type LiquidTouchableProps = Omit<PressableProps, "style"> & {
  activeOpacity?: number;
  borderRadius?: number;
  children: React.ReactNode;
  glowColor?: string;
  hitSlop?: Insets | number;
  intensity?: "soft" | "medium";
  pressRetentionOffset?: Insets | number;
  style?: StyleProp<ViewStyle>;
};

const INTENSITY = {
  soft: {
    lift: -1.5,
    scale: 0.988,
    tilt: 6,
    glowOpacity: 0.24,
  },
  medium: {
    lift: -2.5,
    scale: 0.982,
    tilt: 8,
    glowOpacity: 0.3,
  },
} as const;

export default function LiquidTouchable({
  activeOpacity = 0.92,
  borderRadius = 18,
  children,
  disabled,
  glowColor = "rgba(255,255,255,0.16)",
  hitSlop,
  intensity = "soft",
  onLongPress,
  onPress,
  onPressIn,
  onPressOut,
  pressRetentionOffset,
  style,
  ...rest
}: LiquidTouchableProps) {
  const enableLiquid = Platform.OS === "ios";
  const progress = useSharedValue(0);
  const focusX = useSharedValue(0.5);
  const focusY = useSharedValue(0.3);
  const config = INTENSITY[intensity];

  const release = React.useCallback(() => {
    if (!enableLiquid) return;
    progress.value = withSpring(0, {
      damping: 18,
      stiffness: 240,
      mass: 0.82,
    });
  }, [enableLiquid, progress]);

  const handlePressIn = React.useCallback(
    (event: GestureResponderEvent) => {
      onPressIn?.(event);
      if (!enableLiquid) return;
      const locationX = event.nativeEvent.locationX ?? 0;
      const locationY = event.nativeEvent.locationY ?? 0;
      focusX.value = Math.max(0, Math.min(1, locationX / 220));
      focusY.value = Math.max(0, Math.min(1, locationY / 220));
      progress.value = withSpring(1, {
        damping: 16,
        stiffness: 260,
        mass: 0.72,
      });
    },
    [enableLiquid, focusX, focusY, onPressIn, progress],
  );

  const handlePressOut = React.useCallback(
    (event: GestureResponderEvent) => {
      onPressOut?.(event);
      release();
    },
    [onPressOut, release],
  );

  const shellStyle = useAnimatedStyle(() => {
    if (!enableLiquid) return {};
    const pointerX = focusX.value - 0.5;
    const pointerY = focusY.value - 0.5;
    return {
      transform: [
        { perspective: 920 },
        {
          rotateX: `${interpolate(
            progress.value,
            [0, 1],
            [0, pointerY * -config.tilt],
          )}deg`,
        },
        {
          rotateY: `${interpolate(
            progress.value,
            [0, 1],
            [0, pointerX * config.tilt],
          )}deg`,
        },
        { scale: interpolate(progress.value, [0, 1], [1, config.scale]) },
        { translateY: interpolate(progress.value, [0, 1], [0, config.lift]) },
      ],
      opacity: interpolate(progress.value, [0, 1], [1, activeOpacity]),
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    if (!enableLiquid) return { opacity: 0 };
    return {
      opacity: interpolate(progress.value, [0, 1], [0.1, config.glowOpacity]),
      transform: [
        { translateX: interpolate(focusX.value, [0, 1], [-42, 72]) },
        { translateY: interpolate(focusY.value, [0, 1], [-46, 78]) },
        { scale: interpolate(progress.value, [0, 1], [1, 1.08]) },
      ],
    };
  });

  const contentStyle = useAnimatedStyle(() => {
    if (!enableLiquid) return {};
    const pointerX = focusX.value - 0.5;
    const pointerY = focusY.value - 0.5;
    return {
      transform: [
        {
          translateX: interpolate(progress.value, [0, 1], [0, pointerX * 4.2]),
        },
        {
          translateY: interpolate(
            progress.value,
            [0, 1],
            [0, pointerY * 4.2 - 1.2],
          ),
        },
      ],
    };
  });

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      hitSlop={hitSlop}
      onLongPress={onLongPress}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      pressRetentionOffset={pressRetentionOffset}
    >
      <Reanimated.View style={[style, shellStyle]}>
        {enableLiquid ? (
          <Reanimated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: -58,
                left: -42,
                width: 160,
                height: 160,
                borderRadius: 80,
                backgroundColor: glowColor,
              },
              glowStyle,
            ]}
          />
        ) : null}
        <Reanimated.View
          style={[
            {
              borderRadius,
              overflow: "hidden",
            },
            contentStyle,
          ]}
        >
          <View>{children}</View>
        </Reanimated.View>
      </Reanimated.View>
    </Pressable>
  );
}
