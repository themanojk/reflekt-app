import { getProfile } from '@/api/auth';
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

export default function ProfileScreen({ navigation }: any) {

  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    const userDetails = await getProfile();

    const userObj = {
      id: userDetails.id,
      phone: userDetails.phone,
      full_name: userDetails?.firstName ? (userDetails?.firstName ?? '') + " " + (userDetails?.lastName ?? '') : "Not Set",
      email: userDetails?.email,
    };
    setProfile(userObj);
    setFullName(userObj.full_name);
    setPhone(userObj.phone);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    setSaving(true);
    // Simulate API call
    setTimeout(() => {
      setSaving(false);
      setEditing(false);
      setProfile({ ...profile, full_name: fullName.trim() });
      Alert.alert('Success', 'Profile updated successfully');
    }, 1000);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();

          navigation.navigate("Login");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Profile</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </View>
    );
  }

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
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <User size={48} color="#94a3b8" />
          </View>
          <Text style={styles.userId}>ID: {user?.id?.slice(0, 8)}...</Text>
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
            <Text style={styles.value}>{user?.email || 'Not set'}</Text>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>

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
  userId: {
    fontSize: 12,
    color: '#64748b',
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
  footerText: {
    fontSize: 12,
    color: '#64748b',
  },
});
