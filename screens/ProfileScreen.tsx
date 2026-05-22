import { deactivateAccount, getProfile, updateProfile } from "@/api/auth";
import {
  getNotificationPreferences,
  NotificationPreferences,
  updateNotificationPreferences,
} from "@/api/push";
import { useAuth } from "@/contexts/AuthContext";
import {
  getNotificationPermissionStatus,
  registerDeviceForPushNotifications,
} from "@/services/pushNotifications";
import { clearBoardCache, clearSensorCache, setUser } from "@/utils/storage";
import LiquidTouchable from "@/components/LiquidTouchable";
import Constants from "expo-constants";
import {
  Bell,
  CreditCard as Edit2,
  HelpCircle,
  Mail,
  Phone,
  Save,
  User,
  X,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState("🙂");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>("unknown");
  const [pushRegistering, setPushRegistering] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [preferencesSaving, setPreferencesSaving] = useState(false);

  useEffect(() => {
    loadProfile();
    loadNotificationSettings();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const userDetails = await getProfile();
      const userObj = {
        id: userDetails.id,
        phone: userDetails.phone,
        full_name: userDetails?.firstName
          ? (userDetails?.firstName ?? "") + " " + (userDetails?.lastName ?? "")
          : "Not Set",
        email: userDetails?.email,
        avatar: userDetails?.avatar || "🙂",
      };
      setProfile(userObj);
      setFullName(userObj.full_name);
      setPhone(userObj.phone);
      setEmail(userObj.email || "");
      setAvatar(userObj.avatar || "🙂");
    } catch (err) {
      const fallback = {
        id: user?.id,
        phone: user?.phone,
        full_name: user?.full_name || user?.name || "Not Set",
        email: user?.email,
        avatar: user?.avatar || "🙂",
      };
      setProfile(fallback);
      setFullName(fallback.full_name || "");
      setPhone(fallback.phone || "");
      setEmail(fallback.email || "");
      setAvatar(fallback.avatar || "🙂");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert("Error", "Please enter your name");
      return;
    }

    setSaving(true);
    try {
      const [firstName, ...rest] = fullName.trim().split(" ");
      const lastName = rest.join(" ").trim();
      const updated = await updateProfile({
        firstName,
        lastName,
        email: email?.trim() || undefined,
        avatar,
      });
      await setUser(updated as any);
      const userObj = {
        id: updated.id,
        phone: updated.phone,
        full_name: updated?.firstName
          ? (updated?.firstName ?? "") + " " + (updated?.lastName ?? "")
          : fullName.trim(),
        email: updated?.email,
        avatar: updated?.avatar || avatar,
      };
      setProfile(userObj);
      setEditing(false);
      Alert.alert("Success", "Profile updated successfully");
    } catch (err) {
      Alert.alert("Error", "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const loadNotificationSettings = async () => {
    try {
      const permission = await getNotificationPermissionStatus();
      setPushPermission(permission.granted ? "granted" : permission.status);
    } catch {
      setPushPermission("unknown");
    }

    try {
      const nextPreferences = await getNotificationPreferences();
      setPreferences(nextPreferences);
    } catch {
      setPreferences({
        deviceAlerts: true,
        switchAlerts: true,
        marketing: false,
        quietHoursEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      });
    }
  };

  const handleEnableNotifications = async () => {
    setPushRegistering(true);
    try {
      const result = await registerDeviceForPushNotifications({ force: true });
      await loadNotificationSettings();

      if (result.registered) {
        Alert.alert("Notifications Enabled", "This device is registered for push notifications.");
      } else if (result.reason === "android-fcm-missing") {
        Alert.alert(
          "Firebase Setup Needed",
          "Android push notifications need google-services.json and Firebase credentials before this device can register.",
        );
      } else {
        Alert.alert(
          "Permission Needed",
          "Notification permission was not granted. Enable notifications in system settings and try again.",
        );
      }
    } catch {
      Alert.alert(
        "Notification Setup Failed",
        "Unable to register this device for push notifications right now.",
      );
    } finally {
      setPushRegistering(false);
    }
  };

  const updatePreference = async (
    patch: Partial<NotificationPreferences>,
  ) => {
    if (!preferences) return;
    const previous = preferences;
    const next = { ...preferences, ...patch };

    setPreferences(next);
    setPreferencesSaving(true);
    try {
      await updateNotificationPreferences(patch);
    } catch {
      setPreferences(previous);
      Alert.alert("Update Failed", "Unable to update notification preferences.");
    } finally {
      setPreferencesSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const handleClearBoardCache = () => {
    Alert.alert(
      "Clear Board Cache",
      "This will clear cached boards, layouts, and nearby device data. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearBoardCache();
            Alert.alert("Done", "Board cache cleared");
          },
        },
      ],
    );
  };

  const handleClearSensorCache = () => {
    Alert.alert(
      "Clear Sensor Cache",
      "This will clear cached/ignored sensor data on this device. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearSensorCache();
            Alert.alert("Done", "Sensor cache cleared");
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account and associated data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "Are you absolutely sure? Your account data will be permanently removed.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete",
                  style: "destructive",
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      const uid = String(profile?.id || user?.id || "").trim();
                      if (!uid) {
                        Alert.alert(
                          "Deletion Failed",
                          "Missing user id. Please re-login and try again.",
                        );
                        return;
                      }
                      await deactivateAccount(uid);
                      await clearBoardCache();
                      await clearSensorCache();
                      Alert.alert(
                        "Account Deleted",
                        "Your account and data were deleted successfully.",
                        [
                          {
                            text: "OK",
                            onPress: async () => {
                              await logout();
                            },
                          },
                        ],
                      );
                    } catch {
                      Alert.alert(
                        "Deletion Failed",
                        "Unable to delete your account right now. Please try again in a moment.",
                      );
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <LiquidTouchable onPress={() => navigation.goBack()} borderRadius={16}>
          <Text style={styles.backButton}>← Back</Text>
        </LiquidTouchable>
        <Text style={styles.title}>Profile</Text>
        {!editing ? (
          <Pressable
            onPress={() => setEditing(true)}
            hitSlop={14}
            pressRetentionOffset={14}
            style={({ pressed }) => [
              styles.headerIconButton,
              pressed && styles.headerIconButtonPressed,
            ]}
          >
            <Edit2 size={20} color="#3b82f6" />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setEditing(false)}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            pressRetentionOffset={14}
            style={({ pressed }) => [
              styles.headerIconButton,
              pressed && styles.headerIconButtonPressed,
            ]}
          >
            <X size={20} color="#ef4444" />
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.content}>
        {loading && (
          <View style={styles.loadingInline}>
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text style={styles.loadingText}>Loading profile...</Text>
          </View>
        )}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>{profile?.avatar || avatar}</Text>
          </View>
          <Text style={styles.profileName}>
            {profile?.full_name || fullName || "User"}
          </Text>
          {/* removed ID display */}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>

          <View style={styles.field}>
            <View style={styles.fieldLabel}>
              <User size={18} color="#94a3b8" />
              <Text style={styles.label}>Full Name</Text>
            </View>
            {editing ? (
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor="#64748b"
                value={fullName}
                onChangeText={setFullName}
                editable={!saving}
              />
            ) : (
              <Text style={styles.value}>
                {profile?.full_name || "Not set"}
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <View style={styles.fieldLabel}>
              <Phone size={18} color="#94a3b8" />
              <Text style={styles.label}>Phone Number</Text>
            </View>
            <Text style={styles.value}>{profile?.phone || "Not set"}</Text>
          </View>

          <View style={styles.field}>
            <View style={styles.fieldLabel}>
              <Mail size={18} color="#94a3b8" />
              <Text style={styles.label}>Email</Text>
            </View>
            {editing ? (
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#64748b"
                value={email}
                onChangeText={setEmail}
                editable={!saving}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            ) : (
              <Text style={styles.value}>{profile?.email || "Not set"}</Text>
            )}
          </View>
        </View>

        {editing && (
          <LiquidTouchable
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
            borderRadius={18}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Save size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </LiquidTouchable>
        )}

        {editing && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose Avatar</Text>
            <View style={styles.avatarGrid}>
              {[
                { icon: "👨‍👩‍👧‍👦", label: "Family" },
                { icon: "👨‍👩‍👦", label: "Parents" },
                { icon: "👩‍👧", label: "Mother" },
                { icon: "👨‍👧", label: "Father" },
                { icon: "👩‍🦰", label: "Mom" },
                { icon: "👨‍🦱", label: "Dad" },
                { icon: "👧", label: "Daughter" },
                { icon: "👦", label: "Son" },
                { icon: "👵", label: "Grandma" },
                { icon: "👴", label: "Grandpa" },
              ].map((a) => (
                <LiquidTouchable
                  key={a.icon}
                  style={[
                    styles.avatarOption,
                    avatar === a.icon && styles.avatarOptionActive,
                  ]}
                  onPress={() => setAvatar(a.icon)}
                  borderRadius={18}
                >
                  <Text style={styles.avatarEmojiSmall}>{a.icon}</Text>
                  <Text style={styles.avatarLabel}>{a.label}</Text>
                </LiquidTouchable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <View style={styles.permissionRow}>
            <View style={styles.fieldLabel}>
              <Bell size={18} color="#94a3b8" />
              <Text style={styles.label}>Push Notifications</Text>
            </View>
            <Text style={styles.permissionStatus}>
              {pushPermission === "granted" ? "Enabled" : "Not enabled"}
            </Text>
          </View>

          <LiquidTouchable
            style={[styles.actionButtonNeutral, pushRegistering && styles.buttonDisabled]}
            onPress={handleEnableNotifications}
            disabled={pushRegistering}
            borderRadius={18}
          >
            {pushRegistering ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>
                {pushPermission === "granted"
                  ? "Re-register This Device"
                  : "Enable Notifications"}
              </Text>
            )}
          </LiquidTouchable>

          {preferences ? (
            <View style={styles.preferenceList}>
              <View style={styles.preferenceRow}>
                <Text style={styles.preferenceLabel}>Device alerts</Text>
                <Switch
                  value={preferences.deviceAlerts}
                  onValueChange={(value) => updatePreference({ deviceAlerts: value })}
                  disabled={preferencesSaving}
                  trackColor={{ false: "#334155", true: "#1d4ed8" }}
                  thumbColor={preferences.deviceAlerts ? "#bfdbfe" : "#94a3b8"}
                />
              </View>
              <View style={styles.preferenceRow}>
                <Text style={styles.preferenceLabel}>Switch alerts</Text>
                <Switch
                  value={preferences.switchAlerts}
                  onValueChange={(value) => updatePreference({ switchAlerts: value })}
                  disabled={preferencesSaving}
                  trackColor={{ false: "#334155", true: "#1d4ed8" }}
                  thumbColor={preferences.switchAlerts ? "#bfdbfe" : "#94a3b8"}
                />
              </View>
              <View style={styles.preferenceRow}>
                <Text style={styles.preferenceLabel}>Marketing</Text>
                <Switch
                  value={preferences.marketing}
                  onValueChange={(value) => updatePreference({ marketing: value })}
                  disabled={preferencesSaving}
                  trackColor={{ false: "#334155", true: "#1d4ed8" }}
                  thumbColor={preferences.marketing ? "#bfdbfe" : "#94a3b8"}
                />
              </View>
              <View style={styles.preferenceRow}>
                <Text style={styles.preferenceLabel}>Quiet hours</Text>
                <Switch
                  value={preferences.quietHoursEnabled}
                  onValueChange={(value) => updatePreference({ quietHoursEnabled: value })}
                  disabled={preferencesSaving}
                  trackColor={{ false: "#334155", true: "#1d4ed8" }}
                  thumbColor={preferences.quietHoursEnabled ? "#bfdbfe" : "#94a3b8"}
                />
              </View>
              <View style={styles.quietHoursRow}>
                <TextInput
                  style={styles.timeInput}
                  value={preferences.quietHoursStart}
                  onChangeText={(value) =>
                    setPreferences((prev) =>
                      prev ? { ...prev, quietHoursStart: value } : prev,
                    )
                  }
                  onBlur={() =>
                    updatePreference({ quietHoursStart: preferences.quietHoursStart })
                  }
                  editable={!preferencesSaving}
                  placeholder="22:00"
                  placeholderTextColor="#64748b"
                />
                <Text style={styles.timeSeparator}>to</Text>
                <TextInput
                  style={styles.timeInput}
                  value={preferences.quietHoursEnd}
                  onChangeText={(value) =>
                    setPreferences((prev) =>
                      prev ? { ...prev, quietHoursEnd: value } : prev,
                    )
                  }
                  onBlur={() =>
                    updatePreference({ quietHoursEnd: preferences.quietHoursEnd })
                  }
                  editable={!preferencesSaving}
                  placeholder="07:00"
                  placeholderTextColor="#64748b"
                />
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>

          <LiquidTouchable
            style={styles.actionButtonNeutral}
            onPress={() => navigation.navigate("ContactUs")}
            borderRadius={18}
          >
            <View style={styles.actionButtonContent}>
              <HelpCircle size={18} color="#e2e8f0" />
              <Text style={styles.actionButtonText}>Contact Us</Text>
            </View>
          </LiquidTouchable>

          <LiquidTouchable
            style={styles.actionButtonNeutral}
            onPress={handleClearBoardCache}
            borderRadius={18}
          >
            <Text style={styles.actionButtonText}>Clear Board Cache</Text>
          </LiquidTouchable>

          <LiquidTouchable
            style={styles.actionButtonNeutral}
            onPress={handleClearSensorCache}
            borderRadius={18}
          >
            <Text style={styles.actionButtonText}>Clear Sensor Cache</Text>
          </LiquidTouchable>

          <LiquidTouchable
            style={styles.actionButton}
            onPress={handleSignOut}
            borderRadius={18}
          >
            <Text style={styles.actionButtonTextDanger}>Sign Out</Text>
          </LiquidTouchable>

          <LiquidTouchable
            style={[styles.actionButtonDelete, deleting && styles.buttonDisabled]}
            onPress={handleDeleteAccount}
            disabled={deleting}
            borderRadius={18}
          >
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonDeleteText}>
                Delete My Account & Data
              </Text>
            )}
          </LiquidTouchable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            App Version {Constants.expoConfig?.version}
          </Text>
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
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconButtonPressed: {
    opacity: 0.9,
    backgroundColor: "rgba(148, 163, 184, 0.12)",
  },
  placeholder: {
    width: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loadingText: {
    color: "#94a3b8",
    fontSize: 13,
  },
  content: {
    flex: 1,
  },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarEmoji: {
    fontSize: 44,
  },
  profileName: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  section: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 20,
  },
  field: {
    marginBottom: 24,
  },
  fieldLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#94a3b8",
  },
  value: {
    fontSize: 16,
    color: "#e2e8f0",
    paddingLeft: 26,
  },
  permissionRow: {
    marginBottom: 14,
  },
  permissionStatus: {
    color: "#cbd5e1",
    fontSize: 14,
    paddingLeft: 26,
    textTransform: "capitalize",
  },
  preferenceList: {
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    marginTop: 8,
    paddingTop: 8,
  },
  preferenceRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  preferenceLabel: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "600",
  },
  quietHoursRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 16,
  },
  timeInput: {
    flex: 1,
    minHeight: 44,
    backgroundColor: "#1e293b",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    color: "#fff",
    fontSize: 15,
    paddingHorizontal: 12,
  },
  timeSeparator: {
    color: "#94a3b8",
    fontSize: 14,
  },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#334155",
    marginLeft: 26,
  },
  saveButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  actionButton: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ef4444",
    marginTop: 12,
  },
  actionButtonNeutral: {
    backgroundColor: "#0b1220",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 12,
  },
  actionButtonText: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "600",
  },
  actionButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionButtonTextDanger: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "600",
  },
  actionButtonDelete: {
    backgroundColor: "#7f1d1d",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ef4444",
    marginTop: 12,
  },
  actionButtonDeleteText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 4,
  },
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  avatarOption: {
    width: 70,
    height: 70,
    borderRadius: 16,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOptionActive: {
    borderColor: "#3b82f6",
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
  avatarEmojiSmall: {
    fontSize: 24,
  },
  avatarLabel: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
  },
  footerText: {
    fontSize: 12,
    color: "#64748b",
  },
});
