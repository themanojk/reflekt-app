import { addRoom } from '@/api/room';
import { Bath, Bed, Coffee, Hop as Home, Lamp, Sofa, Tv, Utensils } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useAuth } from '../contexts/AuthContext';

const ROOM_ICONS = [
  { name: 'home', icon: Home, label: 'Home' },
  { name: 'bed', icon: Bed, label: 'Bedroom' },
  { name: 'coffee', icon: Coffee, label: 'Kitchen' },
  { name: 'tv', icon: Tv, label: 'Living Room' },
  { name: 'bath', icon: Bath, label: 'Bathroom' },
  { name: 'utensils', icon: Utensils, label: 'Dining' },
  { name: 'sofa', icon: Sofa, label: 'Lounge' },
  { name: 'lamp', icon: Lamp, label: 'Study' },
];

export default function AddRoomScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('home');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleAddRoom = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a room name');
      return;
    }

    setLoading(true);

    await addRoom(name, selectedIcon);
    setLoading(false);
    Alert.alert('Success', `Room "${name.trim()}" added successfully!`);
    navigation.goBack();

  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.container}
      enableOnAndroid
      extraScrollHeight={16}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add Room</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.label}>Room Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Living Room"
          placeholderTextColor="#64748b"
          value={name}
          onChangeText={setName}
          autoFocus
          editable={!loading}
        />

        <Text style={styles.label}>Select Icon</Text>
        <View style={styles.iconGrid}>
          {ROOM_ICONS.map((item) => {
            const IconComponent = item.icon;
            const isSelected = selectedIcon === item.name;
            return (
              <TouchableOpacity
                key={item.name}
                style={[
                  styles.iconButton,
                  isSelected && styles.iconButtonSelected,
                ]}
                onPress={() => setSelectedIcon(item.name)}
                disabled={loading}
              >
                <IconComponent
                  size={28}
                  color={isSelected ? '#3b82f6' : '#94a3b8'}
                />
                <Text
                  style={[
                    styles.iconLabel,
                    isSelected && styles.iconLabelSelected,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAddRoom}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Add Room</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAwareScrollView>
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
  cancelButton: {
    color: '#3b82f6',
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  placeholder: {
    width: 60,
  },
  content: {
    padding: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
    marginTop: 16,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  iconButton: {
    width: '22%',
    aspectRatio: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#334155',
    padding: 8,
  },
  iconButtonSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#1e3a8a',
  },
  iconLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center',
  },
  iconLabelSelected: {
    color: '#3b82f6',
    fontWeight: '600',
  },
});
