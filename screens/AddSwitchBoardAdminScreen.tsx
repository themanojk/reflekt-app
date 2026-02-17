import { getLayout } from '@/api/devics';
import { fetchServiceIds } from '@/api/service';
import Toast from '@/components/Toast';
import { DATA_CHAR_UUID } from '@/constants';
import { getCanonicalId } from '@/services/bleCanonicalId';
import BLEManagerService from '@/services/bleManager';
import { setESPServiceIds } from '@/utils/storage';
import { loadWifi, saveWifi } from '@/utils/wifiCreds';
import { Buffer } from 'buffer';
import { Bluetooth, User } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Device as BleDevice, Device } from 'react-native-ble-plx';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

type Step = 'scan' | 'form';

type Row = {
  id: string;           // transport id (device.id)
  name: string | null;
  rssi: number | null;
  device: Device;
  canonicalId?: string; // <-- added directly on the row
};

export default function AddSwitchboardAdminScreen({ navigation, route }: any) {
  const bleManager = new BLEManagerService();
  const [_connectingId, setConnectingId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('scan');
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Row[]>([]);
  const [device, setDevice] = useState<BleDevice>();
  const [_selectedDevice, setSelectedDevice] = useState<BleDevice | null>(null);
  const [name, setName] = useState('');
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  useEffect(() => {
    const refreshServiceIds = async () => {
      try {
        const ids = await fetchServiceIds();
        if (ids.length) {
          await setESPServiceIds(ids);
          await bleManager.mapServiceIds();
        }
      } catch {
        // offline fallback: scanner uses cached IDs
      }
    };
    refreshServiceIds();
  }, []);

  const showToast = (msg: string) => {
    setToast({ visible: true, message: msg });
  };

  const onDeviceFound = React.useCallback(async (device: Device) => {
    console.log('Discovered device:', device.id, device.name);
    // Canonical id from DIS serial (WiFi MAC). Use for all platforms.
    let canonicalId = device.id;
    try {
      canonicalId = await getCanonicalId(device);
    } catch (e) {
      console.warn('canonicalId lookup failed; fallback to device.id', e);
      canonicalId = device.id;
    }

    setDevices(prev => {
      const idx = prev.findIndex(r => r.canonicalId === canonicalId);
      if (idx >= 0) {
        const cur = prev[idx];
        const next = [...prev];
        next[idx] = {
          ...cur,
          device,
          id: device.id,
          name: device.name ?? cur.name,
          rssi: device.rssi ?? cur.rssi,
        };
        return next;
      }
      return [...prev, { id: device.id, name: device.name ?? null, rssi: device.rssi ?? null, device, canonicalId }];
    });
  }, []);

  // useEffect(() => {
  //   console.log("Starting scan for devices");
  //   const safeStop = () => {
  //     try { bleManager.stopScan(); } catch {}
  //   };
  //   bleManager.startScan(onDeviceFound, { stopAfterMs: 30000 });
  //   return () => {
  //     safeStop();
  //   };
  // }, [bleManager, onDeviceFound]);


  const fetchAlreadyConnected = useCallback(async () => {
    try {
      const already = await bleManager.connectedDevices();
      return already;
    } catch (e: any) {
      console.warn('Error fetching connected devices', e);
      return [];
    }
  }, []);

  const runScan = React.useCallback(async () => {
    if (scanning) return;            // prevent double taps
    setScanning(true);
    try {
      const { done } = bleManager.startScan_new(onDeviceFound, { stopAfterMs: 30000 });
      await done;                    // await completion (auto-stop or manual)
    } finally {
      setScanning(false);
    }
  }, [bleManager, onDeviceFound, scanning]);

  // const startScan = useCallback(async () => {
  //   console.log("Starting scan for devices");
  //   const mounted = { current: true };
  //   let stopTimer: ReturnType<typeof setTimeout> | null = null;

  //   const seenCanonical = new Set<string>();          // de-dupe by canonical id
  //   const canonicalCache = new Map<string, string>(); // cache per device.id

  //   const safeStop = () => {
  //     try { bleManager.stopScan(); } catch {}
  //     if (stopTimer) clearTimeout(stopTimer);
  //   };

  //   try {
  //     const already = await fetchAlreadyConnected();
  //     if (already?.length) {
  //       setDevices(prev => {
  //         const next = [...prev];
  //         for (const d of already) {
  //           if (!next.find(x => x.id === d.id)) {
  //             next.push({
  //               id: d.id,
  //               name: d.name ?? null,
  //               rssi: d.rssi ?? null,
  //               device: d,
  //               canonicalId: Platform.OS === 'ios' ? d.id /* temporary */ : d.id,
  //             });
  //           }
  //         }
  //         return next;
  //       });
  //     }

  //     bleManager.startScan(
  //       onDeviceFound,
  //       { stopAfterMs: 30000 }
  //     );

  //     stopTimer = setTimeout(() => {
  //       safeStop();
  //       setScanning(false);
  //     }, 30000);
  //   } catch (err) {
  //     console.log('scan error', err);
  //     safeStop();
  //   }

  //   return () => {
  //     mounted.current = false;
  //     safeStop();
  //   };
  // }, [bleManager]);

  const loadWifiCreds = async () => {
    const creds = await loadWifi();
    if(!creds || !creds.ssid) return

    setWifiSSID(creds.ssid);
    setWifiPassword(creds.pass);
  }

  React.useEffect(() => {
    console.log("Effect runScan called");
    let cancelled = false;
    (async () => {
      await runScan();
    })();
    return () => {
      cancelled = true;
      bleManager.stopScan();
    };
  }, [runScan]);

  // useEffect(() => {
  //   if (step === 'scan') {
  //     startScan();
  //   }
  //   return () => {
  //     setScanning(false)
  //     bleManager.stopScan();
  //   };
  // }, [startScan]);

  useEffect(() => {
    loadWifiCreds();
  }, []);

  const getDeviceLayout = async (deviceId: string | undefined) => {
    try {
      if(!deviceId) return;
      console.info("Fetching layout for", deviceId)
      const deviceLayout = await getLayout(deviceId);
      return deviceLayout;
    } catch (err) {
      console.log("Error while fetching layout", err)
      return null
    }
  };

  const sendWifiConfigToESP = async (device: BleDevice) => {
    if (!wifiSSID.trim() || !wifiPassword.trim()) {
      Alert.alert('Error', 'Please enter a WiFi network name');
      return;
    }

    await saveWifi(wifiSSID, wifiPassword);
    const serviceIds = await bleManager.getCustomServiceId(device);
    if(!serviceIds.length) return;

    const text = `WIFI:${wifiSSID};${wifiPassword}`;
    console.log('Send to ESP:', text);
    //await bleManager.sendData(device, text, serviceIds[0]);
    await bleManager.safeWrite({device, serviceUUID: serviceIds[0], charUUID: DATA_CHAR_UUID, base64Payload: Buffer.from(text).toString("base64")})

  };

  const handleDeviceSelect = async (bleDevice: Row) => {
    const { device, canonicalId } = bleDevice;
    console.log("Starting connection")
    setConnectingId(device.id);
    bleManager.stopScan();

    try {
      await bleManager.connect(device);
      const layout = await getDeviceLayout(canonicalId);

      if (!layout) {
        showToast('Unrecognized device');
      } else {
        setSelectedDevice(device);
        setName(device.id);
        setStep('form');
        setDevice(device);
      }
      setConnectingId(null);
    } catch (err) {
      console.error('Connection failed', err);
      setConnectingId(null);
    }
  };

  const handleAddSwitchboard = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a switchboard name');
      return;
    }
    if (!device) {
      Alert.alert('Error', 'Bluetooth connection failed');
      return;
    }
    setLoading(true);

    try {
      await sendWifiConfigToESP(device);
      Alert.alert('Success', `Switchboard "${name.trim()}" added successfully!`);
    } catch (err) {
      console.log(err);
      Alert.alert('Error', `Failed to add "${name.trim()}" switchboard!`);
    } finally {
      setLoading(false);
      navigation.navigate("Switchboard", {
        switchboardId: device.id,
        switchboardName: "Test",
        deviceId: device.id
      })
    }
  };

  if (step === 'scan') {
    return (
      <View style={styles.container}>
        <Toast
          visible={toast.visible}
          message={toast.message}
          duration={2000}
          onHide={() => setToast({ ...toast, visible: false })}
        />
        <View style={styles.header}>
          <Text style={styles.title}>Scan Switchboard</Text>
          <View style={styles.placeholder} />
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate("Profile")}
          >
            <User size={20} color="#94a3b8" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={styles.scanContent}>
          <View style={styles.scanIcon}>
            <Bluetooth size={64} color="#3b82f6" />
          </View>

          <Text style={styles.scanTitle}>
            {scanning ? 'Scanning for devices...' : 'Nearby Devices'}
          </Text>
          <Text style={styles.scanSubtitle}>
            {scanning
              ? 'Please wait while we search for switchboards'
              : 'Select a switchboard to connect'}
          </Text>

          {scanning && (
            <ActivityIndicator size="large" color="#3b82f6" style={styles.loader} />
          )}

          {!scanning && devices.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No devices found</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setScanning(true);
                  setStep('scan');
                  setDevices([]);
                  runScan();
                }}
              >
                <Text style={styles.retryButtonText}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {devices.length > 0 && (
            <ScrollView style={styles.deviceList}>
              {devices.map((device) => (
                <TouchableOpacity
                  key={device.id}
                  style={styles.deviceCard}
                  onPress={() => handleDeviceSelect(device)}
                >
                  <View style={styles.deviceInfo}>
                    <Bluetooth size={24} color="#3b82f6" />
                    <View style={styles.deviceDetails}>
                      <Text style={styles.deviceName}>{device.id.slice(0, 20)}</Text>
                      <Text style={styles.deviceName}>{device.canonicalId}</Text>
                      <Text style={styles.deviceSignal}>
                        Signal: {device.rssi ? Math.abs(device.rssi): ''} dBm
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.connectText}>Connect</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.manualButton}
            onPress={() => {
              setStep('scan');
              runScan();
            }}
          >
            <Text style={styles.manualButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.container}
      enableOnAndroid
      extraScrollHeight={16}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('scan')}>
          <Text style={styles.cancelButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Configure Switchboard</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.label}>Switchboard Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Main Panel"
          placeholderTextColor="#64748b"
          value={name}
          onChangeText={setName}
          autoFocus
          editable={!loading}
        />

        <Text style={styles.sectionTitle}>WiFi Configuration (Optional)</Text>
        <Text style={styles.sectionSubtitle}>
          Configure WiFi settings for smart switchboard
        </Text>

        <Text style={styles.label}>WiFi Network Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Network SSID"
          placeholderTextColor="#64748b"
          value={wifiSSID}
          onChangeText={setWifiSSID}
          editable={!loading}
        />

        <Text style={styles.label}>WiFi Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#64748b"
          value={wifiPassword}
          onChangeText={setWifiPassword}
          secureTextEntry
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAddSwitchboard}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Add Switchboard</Text>
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
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 24,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 8,
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
    marginTop: 32,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scanContent: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
  },
  scanIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 48,
    marginBottom: 24,
  },
  scanTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  scanSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
  },
  loader: {
    marginVertical: 24,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#334155',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deviceList: {
    width: '100%',
    marginTop: 16,
  },
  deviceCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceDetails: {
    gap: 4,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  deviceSignal: {
    fontSize: 12,
    color: '#94a3b8',
  },
  connectText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  manualButton: {
    marginTop: 'auto',
    paddingVertical: 16,
  },
  manualButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
});
