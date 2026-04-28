import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useAuth } from "../contexts/AuthContext";

export default function LoginScreen() {
  const [transactionId, setTransactionId] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const { signInWithPhone, verifyOTP } = useAuth();
  const otpInputRef = useRef<TextInput>(null);
  const lastAutoSentRef = useRef<string>("");

  const handleSendOTP = async () => {
    if (!phone || phone.length < 10) {
      Alert.alert("Error", "Please enter a valid phone number");
      return;
    }
    if (loading) return;

    setLoading(true);
    const id = await signInWithPhone(phone);
    setTransactionId(id);
    setLoading(false);

    setStep("otp");
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 4) {
      Alert.alert("Error", "Please enter the 4-digit OTP (1234)");
      return;
    }
    if (loading) return;

    setLoading(true);
    const { error } = await verifyOTP(transactionId, otp);
    setLoading(false);

    if (error) {
      Alert.alert("Error", error.message);
    }
  };

  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => otpInputRef.current?.focus(), 150);
    }
  }, [step]);

  useEffect(() => {
    if (step !== "phone") return;
    if (phone.length === 10 && !loading && lastAutoSentRef.current !== phone) {
      lastAutoSentRef.current = phone;
      handleSendOTP();
    }
  }, [phone, step, loading]);

  useEffect(() => {
    if (step !== "otp") return;
    if (otp.length === 4) {
      handleVerifyOTP();
    }
  }, [otp, step]);

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.container}
      enableOnAndroid
      extraScrollHeight={16}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Littra One Touch</Text>
          <Text style={styles.subtitle}>Control your home from anywhere</Text>
        </View>

        {step === "phone" ? (
          <View style={styles.form}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder=""
              value={phone}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, "").slice(0, 10);
                setPhone(digits);
              }}
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendOTP}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send OTP</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>Enter OTP</Text>
            <Text style={styles.hint}>For testing, use OTP: 1234</Text>
            <TextInput
              style={styles.input}
              placeholder="1234"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={4}
              editable={!loading}
              ref={otpInputRef}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerifyOTP}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setStep("phone");
                setOtp("");
              }}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>Change Phone Number</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#94a3b8",
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e2e8f0",
    marginBottom: -8,
  },
  hint: {
    fontSize: 14,
    color: "#94a3b8",
    marginBottom: -8,
  },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#334155",
  },
  button: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    alignItems: "center",
    marginTop: 8,
  },
  backButtonText: {
    color: "#3b82f6",
    fontSize: 14,
  },
});
