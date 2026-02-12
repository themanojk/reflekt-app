import { getProfile, updateProfile } from '@/api/auth';
import { useAuth } from '@/contexts/AuthContext';
import Constants from 'expo-constants';
import { CreditCard as Edit2, Mail, Phone, Save, User, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { clearBoardCache, clearSensorCache, setUser } from '@/utils/storage';

export default function ProfileScreen({ navigation }: any) {

  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('🙂');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
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
      Alert.alert('Error', 'Please enter your name');
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
      Alert.alert('Success', 'Profile updated successfully');
    } catch (err) {
      Alert.alert("Error", "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const handleClearBoardCache = () => {
    Alert.alert(
      'Clear Board Cache',
      'This will clear cached boards, layouts, and nearby device data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearBoardCache();
            Alert.alert('Done', 'Board cache cleared');
          },
        },
      ],
    );
  };

  const handleClearSensorCache = () => {
    Alert.alert(
      'Clear Sensor Cache',
      'This will clear cached/ignored sensor data on this device. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearSensorCache();
            Alert.alert('Done', 'Sensor cache cleared');
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        {!editing ? (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Edit2 size={20} color="#3b82f6" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setEditing(false)}>
            <X size={20} color="#ef4444" />
          </TouchableOpacity>
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
                {profile?.full_name || 'Not set'}
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <View style={styles.fieldLabel}>
              <Phone size={18} color="#94a3b8" />
              <Text style={styles.label}>Phone Number</Text>
            </View>
            <Text style={styles.value}>{profile?.phone || 'Not set'}</Text>
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
                autoCapitalize="none"
              />
            ) : (
              <Text style={styles.value}>{profile?.email || 'Not set'}</Text>
            )}
          </View>
        </View>

        {editing && (
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Save size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
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
                <TouchableOpacity
                  key={a.icon}
                  style={[
                    styles.avatarOption,
                    avatar === a.icon && styles.avatarOptionActive,
                  ]}
                  onPress={() => setAvatar(a.icon)}
                >
                  <Text style={styles.avatarEmojiSmall}>{a.icon}</Text>
                  <Text style={styles.avatarLabel}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>

          <TouchableOpacity style={styles.actionButtonNeutral} onPress={handleClearBoardCache}>
            <Text style={styles.actionButtonText}>Clear Board Cache</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButtonNeutral} onPress={handleClearSensorCache}>
            <Text style={styles.actionButtonText}>Clear Sensor Cache</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleSignOut}>
            <Text style={styles.actionButtonTextDanger}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>App Version {Constants.expoConfig?.version}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    color: '#3b82f6',
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  placeholder: {
    width: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarEmoji: {
    fontSize: 44,
  },
  profileName: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  section: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  field: {
    marginBottom: 24,
  },
  fieldLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  value: {
    fontSize: 16,
    color: '#e2e8f0',
    paddingLeft: 26,
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
    marginLeft: 26,
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
    marginTop: 12,
  },
  actionButtonNeutral: {
    backgroundColor: '#0b1220',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  actionButtonText: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
  },
  actionButtonTextDanger: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 4,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  avatarOption: {
    width: 70,
    height: 70,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOptionActive: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  avatarEmojiSmall: {
    fontSize: 24,
  },
  avatarLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  footerText: {
    fontSize: 12,
    color: '#64748b',
  },
});
