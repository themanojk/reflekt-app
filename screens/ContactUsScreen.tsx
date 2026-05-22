import {
  ContactContent,
  getContactContent,
  submitSupportRequest,
} from "@/api/support";
import LiquidTouchable from "@/components/LiquidTouchable";
import { useAuth } from "@/contexts/AuthContext";
import {
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const getApiMessage = (err: any, fallback: string) =>
  err?.response?.data?.message ||
  err?.response?.data?.err ||
  err?.response?.data?.error ||
  err?.message ||
  fallback;

export default function ContactUsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [contact, setContact] = useState<ContactContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(
    [user?.firstName, user?.lastName].filter(Boolean).join(" "),
  );
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadContact();
  }, []);

  const loadContact = async () => {
    setLoading(true);
    try {
      const data = await getContactContent();
      setContact(data);
    } catch (err: any) {
      Alert.alert("Unable to Load", getApiMessage(err, "Contact details are unavailable right now."));
    } finally {
      setLoading(false);
    }
  };

  const openUrl = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch {
      Alert.alert("Unable to Open", "This action is not available on this device.");
    }
  };

  const handleSubmit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    if (!subject.trim()) {
      Alert.alert("Error", "Please enter a subject");
      return;
    }
    if (!message.trim()) {
      Alert.alert("Error", "Please enter your message");
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      await submitSupportRequest({
        name: name.trim() || undefined,
        email: trimmedEmail,
        phone: phone.trim() || undefined,
        subject: subject.trim(),
        message: message.trim(),
      });
      Alert.alert("Submitted", "Your request has been submitted.");
      setSubject("");
      setMessage("");
    } catch (err: any) {
      Alert.alert("Unable to Submit", getApiMessage(err, "Please try again later."));
    } finally {
      setSubmitting(false);
    }
  };

  const supportEmail = contact?.supportEmail;
  const supportPhone = contact?.supportPhone;
  const whatsappNumber = contact?.whatsappNumber;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <LiquidTouchable onPress={() => navigation.goBack()} borderRadius={16}>
          <Text style={styles.backButton}>Back</Text>
        </LiquidTouchable>
        <Text style={styles.title}>{contact?.title || "Contact Us"}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentBody}>
        {loading ? (
          <View style={styles.loadingInline}>
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text style={styles.loadingText}>Loading contact details...</Text>
          </View>
        ) : null}

        {contact?.message ? (
          <Text style={styles.message}>{contact.message}</Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support Details</Text>

          {supportEmail ? (
            <LiquidTouchable
              style={styles.contactRow}
              onPress={() => openUrl(`mailto:${supportEmail}`)}
              borderRadius={18}
            >
              <Mail size={18} color="#94a3b8" />
              <Text style={styles.contactText}>{supportEmail}</Text>
            </LiquidTouchable>
          ) : null}

          {supportPhone ? (
            <LiquidTouchable
              style={styles.contactRow}
              onPress={() => openUrl(`tel:${supportPhone}`)}
              borderRadius={18}
            >
              <Phone size={18} color="#94a3b8" />
              <Text style={styles.contactText}>{supportPhone}</Text>
            </LiquidTouchable>
          ) : null}

          {whatsappNumber ? (
            <LiquidTouchable
              style={styles.contactRow}
              onPress={() =>
                openUrl(`https://wa.me/${whatsappNumber.replace(/\D/g, "")}`)
              }
              borderRadius={18}
            >
              <MessageCircle size={18} color="#94a3b8" />
              <Text style={styles.contactText}>{whatsappNumber}</Text>
            </LiquidTouchable>
          ) : null}

          {contact?.businessHours ? (
            <View style={styles.contactRow}>
              <Clock size={18} color="#94a3b8" />
              <Text style={styles.contactText}>{contact.businessHours}</Text>
            </View>
          ) : null}

          {contact?.address ? (
            <View style={styles.contactRow}>
              <MapPin size={18} color="#94a3b8" />
              <Text style={styles.contactText}>{contact.address}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send Request</Text>

          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#64748b"
            value={name}
            onChangeText={setName}
            editable={!submitting}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#64748b"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!submitting}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone"
            placeholderTextColor="#64748b"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            editable={!submitting}
          />
          <TextInput
            style={styles.input}
            placeholder="Subject"
            placeholderTextColor="#64748b"
            value={subject}
            onChangeText={setSubject}
            editable={!submitting}
          />
          <TextInput
            style={[styles.input, styles.messageInput]}
            placeholder="Message"
            placeholderTextColor="#64748b"
            value={message}
            onChangeText={setMessage}
            editable={!submitting}
            multiline
            textAlignVertical="top"
          />

          <LiquidTouchable
            style={[styles.submitButton, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            borderRadius={18}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Send size={18} color="#fff" />
                <Text style={styles.submitButtonText}>Submit Request</Text>
              </>
            )}
          </LiquidTouchable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  backButton: {
    color: "#3b82f6",
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  placeholder: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  contentBody: {
    paddingBottom: 32,
  },
  loadingInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  loadingText: {
    color: "#94a3b8",
    fontSize: 13,
  },
  message: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
  },
  contactRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  contactText: {
    flex: 1,
    color: "#e2e8f0",
    fontSize: 15,
    lineHeight: 21,
  },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 12,
  },
  messageInput: {
    minHeight: 120,
  },
  submitButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
