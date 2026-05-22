import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useAuth } from "../contexts/AuthContext";

type LoginStep = "credentials" | "change-passcode" | "email";

const getApiMessage = (err: any, fallback: string) =>
  err?.response?.data?.message ||
  err?.response?.data?.err ||
  err?.response?.data?.error ||
  err?.message ||
  fallback;

const onlyDigits = (value: string, maxLength: number) =>
  value.replace(/\D/g, "").slice(0, maxLength);

function PasscodeBoxes({
  value,
  onChange,
  editable,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  autoFocus?: boolean;
}) {
  const inputs = useRef<(TextInput | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] || "");

  const focusBox = (index: number) => {
    inputs.current[index]?.focus();
  };

  const handleChange = (text: string, index: number) => {
    const cleaned = onlyDigits(text, 6);
    if (!cleaned) {
      const next = value.split("");
      next[index] = "";
      onChange(next.join("").slice(0, 6));
      return;
    }

    const next = value.padEnd(6, " ").split("");
    cleaned.split("").forEach((digit, offset) => {
      if (index + offset < 6) {
        next[index + offset] = digit;
      }
    });
    const nextValue = next.join("").replace(/\s/g, "").slice(0, 6);
    onChange(nextValue);

    const nextIndex = Math.min(index + cleaned.length, 5);
    if (index + cleaned.length < 6) {
      focusBox(nextIndex);
    } else {
      inputs.current[index]?.blur();
    }
  };

  const handleKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (event.nativeEvent.key !== "Backspace") return;
    if (digits[index]) return;
    if (index > 0) {
      focusBox(index - 1);
    }
  };

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => focusBox(0), 150);
    }
  }, [autoFocus]);

  return (
    <View style={styles.passcodeRow}>
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(input) => {
            inputs.current[index] = input;
          }}
          style={styles.passcodeBox}
          value={digit}
          onChangeText={(text) => handleChange(text, index)}
          onKeyPress={(event) => handleKeyPress(event, index)}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={index === 0 ? 6 : 1}
          editable={editable}
          selectTextOnFocus
          textAlign="center"
        />
      ))}
    </View>
  );
}

export default function LoginScreen() {
  const [phone, setPhone] = useState("");
  const [passcode, setPasscode] = useState("");
  const [currentPasscode, setCurrentPasscode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [email, setEmail] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [step, setStep] = useState<LoginStep>("credentials");
  const [loading, setLoading] = useState(false);
  const { loginPasscode, changeUserPasscode, completeEmail } = useAuth();
  const emailInputRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (phone.length !== 10) {
      Alert.alert("Error", "Please enter a valid 10-digit phone number");
      return;
    }
    if (passcode.length !== 6) {
      Alert.alert("Error", "Please enter your 6-digit passcode");
      return;
    }
    if (loading) return;

    setLoading(true);
    try {
      const response = await loginPasscode(phone, passcode);
      if (!response.success) {
        Alert.alert("Error", response.message || "Login failed");
        return;
      }
      if (response.status === "change_passcode_required") {
        setChallengeToken(response.challengeToken);
        setCurrentPasscode(passcode);
        setStep("change-passcode");
        return;
      }
      if (response.status === "email_required") {
        setChallengeToken(response.challengeToken);
        setStep("email");
      }
    } catch (err: any) {
      Alert.alert("Error", getApiMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleChangePasscode = async () => {
    if (!challengeToken) {
      Alert.alert("Session Expired", "Please login again to continue");
      resetToLogin();
      return;
    }
    if (
      currentPasscode.length !== 6 ||
      newPasscode.length !== 6 ||
      confirmPasscode.length !== 6
    ) {
      Alert.alert("Error", "All passcodes must be exactly 6 digits");
      return;
    }
    if (newPasscode !== confirmPasscode) {
      Alert.alert("Error", "New passcode and confirmation do not match");
      return;
    }
    if (newPasscode === currentPasscode) {
      Alert.alert("Error", "New passcode must be different");
      return;
    }
    if (loading) return;

    setLoading(true);
    try {
      const response = await changeUserPasscode(
        {
          currentPasscode,
          newPasscode,
          confirmPasscode,
        },
        challengeToken,
      );
      if (!response.success) {
        Alert.alert("Error", response.message || "Unable to change passcode");
        return;
      }
      if (response.status === "email_required") {
        setChallengeToken(response.challengeToken);
        setStep("email");
        return;
      }
      if (response.status === "change_passcode_required") {
        setChallengeToken(response.challengeToken);
      }
    } catch (err: any) {
      Alert.alert("Error", getApiMessage(err, "Unable to change passcode"));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteEmail = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!challengeToken) {
      Alert.alert("Session Expired", "Please login again to continue");
      resetToLogin();
      return;
    }
    if (!trimmedEmail || !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    if (loading) return;

    setLoading(true);
    try {
      const response = await completeEmail(trimmedEmail, challengeToken);
      if (!response.success) {
        Alert.alert("Error", response.message || "Unable to save email");
      }
    } catch (err: any) {
      Alert.alert("Error", getApiMessage(err, "Unable to save email"));
    } finally {
      setLoading(false);
    }
  };

  const resetToLogin = () => {
    setStep("credentials");
    setChallengeToken("");
    setPasscode("");
    setCurrentPasscode("");
    setNewPasscode("");
    setConfirmPasscode("");
    setEmail("");
  };

  useEffect(() => {
    if (step === "email") {
      setTimeout(() => emailInputRef.current?.focus(), 150);
    }
  }, [step]);

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.container}
      enableOnAndroid
      extraScrollHeight={16}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Neytri One Touch</Text>
          <Text style={styles.subtitle}>Control your home from anywhere</Text>
        </View>

        {step === "credentials" && (
          <View style={styles.form}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(value) => setPhone(onlyDigits(value, 10))}
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={!loading}
              maxLength={10}
            />

            <Text style={styles.label}>6-Digit Passcode</Text>
            <PasscodeBoxes
              value={passcode}
              onChange={setPasscode}
              editable={!loading}
              autoFocus={step === "credentials" && phone.length === 10}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {step === "change-passcode" && (
          <View style={styles.form}>
            <Text style={styles.stepTitle}>Change Passcode</Text>
            <Text style={styles.hint}>
              Create a new 6-digit passcode to continue.
            </Text>

            <Text style={styles.label}>Current Passcode</Text>
            <PasscodeBoxes
              value={currentPasscode}
              onChange={setCurrentPasscode}
              editable={!loading}
            />

            <Text style={styles.label}>New Passcode</Text>
            <PasscodeBoxes
              value={newPasscode}
              onChange={setNewPasscode}
              editable={!loading}
              autoFocus={step === "change-passcode"}
            />

            <Text style={styles.label}>Confirm New Passcode</Text>
            <PasscodeBoxes
              value={confirmPasscode}
              onChange={setConfirmPasscode}
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleChangePasscode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Save Passcode</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {step === "email" && (
          <View style={styles.form}>
            <Text style={styles.stepTitle}>Add Email</Text>
            <Text style={styles.hint}>
              Email is mandatory before entering the app.
            </Text>

            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
              ref={emailInputRef}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleCompleteEmail}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {step !== "credentials" && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={resetToLogin}
            disabled={loading}
          >
            <Text style={styles.backButtonText}>Back to Login</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
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
    fontSize: 34,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#94a3b8",
    textAlign: "center",
  },
  form: {
    gap: 16,
  },
  stepTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: -4,
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
    marginBottom: 4,
    lineHeight: 20,
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
  passcodeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  passcodeBox: {
    flex: 1,
    aspectRatio: 1,
    minHeight: 48,
    maxHeight: 56,
    backgroundColor: "#1e293b",
    borderRadius: 10,
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#334155",
    padding: 0,
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
    marginTop: 20,
    alignItems: "center",
  },
  backButtonText: {
    color: "#94a3b8",
    fontSize: 14,
  },
});
