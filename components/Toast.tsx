import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, ViewStyle } from 'react-native';

const { width } = Dimensions.get('window');

interface ToastProps {
  visible: boolean;
  message: string;
  duration?: number;
  onHide?: () => void;
  style?: ViewStyle;
}

const Toast: React.FC<ToastProps> = ({
  visible,
  message,
  duration = 2000,
  onHide,
  style,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 350,
            useNativeDriver: true,
          }).start(() => {
            if (onHide) onHide();
          });
        }, duration);
      });
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.toast, style, { opacity: fadeAnim }]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 70,
    left: width * 0.1,
    width: width * 0.8,
    backgroundColor: 'rgba(50,50,50,0.97)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    zIndex: 999,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  toastText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: 'bold',
    letterSpacing: 0.15,
  },
});

export default Toast;
