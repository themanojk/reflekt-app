import { getLayout, sendCommandOverWifi } from '@/api/devics';
import { DATA_CHAR_UUID, ROOM_ICONS } from '@/constants';
import bleManager from '@/services/bleManager';
import { loadWifi, saveWifi } from '@/utils/wifiCreds';
import {
  ChevronLeft,
  Lightbulb,
  Power,
  Settings,
  Wifi,
  X
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Device as BleDevice } from 'react-native-ble-plx';
import CustomSlider from '../components/CustomSlider';

interface Device {
  id: number;
  name: string;
  device_type: string;
  position: number;
  is_on: boolean;
  brightness?: number;
  color?: string;
  speed?: number;
  command: string;
}

const COLOR_PALETTE = [
  'rgb(91, 141, 239)',
  'rgb(124, 111, 216)',
  'rgb(74, 222, 128)',
  'rgb(251, 191, 36)',
  'rgb(239, 68, 68)',
  'rgb(236, 72, 153)',
  'rgb(94, 234, 212)',
  'rgb(251, 146, 60)',
];

export default function SwitchboardScreen({ route, navigation }: any) {
  const { switchboardName, deviceId, roomIcon } = route.params;
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDevice, setActiveDevice] = useState<BleDevice>();
  const [services, setServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [tempColor, setTempColor] = useState('rgb(91, 141, 239)');
  const [tempIntensity, setTempIntensity] = useState(80);
  const [showWifiModal, setShowWifiModal] = useState(false);
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [pins, setPins] = useState<any>({})

  useEffect(() => {
    loadSwitchboardData();
  }, [deviceId]);

  useEffect(() => {
    if (!activeDevice || !services.length) return;
    const onReceived = (data: any) => {
      console.log('data', data);
      const pinDataArray = data.split(',');
      const pinObj:any = {};
      pinDataArray.forEach((pinData: string) => {
        const statusData: string[] = pinData.split(':');
        const pin = Number(statusData[0])
        pinObj[pin] = statusData[1] === "1" ? true : false;
      })
      setPins(pinObj);
    };

    const onError = (error: any) => {
      console.error(error);
    };

    bleManager.subscribeToData(activeDevice, services[0], onReceived, onError);
  }, [activeDevice, services]);

  useEffect(() => {
    if (!pins || Object.keys(pins).length === 0) return;

    setDevices(prev => {
      let changed = false;
      const next = prev.map(d => {
        const p = pins[d.id];
        if (p === undefined) return d;
        const is_on = p;
        
        if (d.is_on === is_on) return d;
        changed = true;
        return { ...d, is_on };
      });

      console.log(next);

      return changed ? next : prev;
    });
  }, [pins]);

  const loadSwitchboardData = async () => {
    setLoading(true);
    const layout = await getLayout(deviceId);
    const buttons: Device[] = [];
    layout.buttons.forEach((button, idx) => {
      const obj: Device = {
        id: button.pin,
        name: button.label,
        device_type: button.type,
        is_on: false,
        position: idx,
        command: button.command
      }
      buttons.push(obj);
    })
    setDevices(buttons);
    setLoading(false);
    getBleConnection(deviceId);
  };

  const getCurrentState = async (device: BleDevice, serviceId: string)  => {
    if(!device) {
      console.log("Device not connected");
      return;
    }
     try {
      const text = `REST:`;
      await bleManager.sendData(device, text, serviceId);
    } catch (e) {
      console.error('Write failed', e);
    }
  }

  const subscribeToDevice = async (device: BleDevice, serviceId: string) => {
    if (!device || !serviceId) return;
    const onReceived = (data: any) => {
      console.log('data', data);
      const text = String(data).trim().replace(/\u0000/g, "");
      try {
        const msg = JSON.parse(text);
        setPins(msg.pins);

      } catch (e) {
        console.warn("JSON parse failed", {
          textPreview: text.slice(0, 80),
          error: String(e),
          codes: [...text].map(c => c.charCodeAt(0)).slice(0, 40), // debug hidden chars
        });
      }
    };

    const onError = (error: any) => {
      console.error(error);
    };

    await bleManager.subscribeToData(device, serviceId, onReceived, onError);

    getCurrentState(device, serviceId);
  }

  const getBleConnection = async (macAddress: string) => {
    try {
      const already = await bleManager.getAlreadyConnected();
      let connected: BleDevice | undefined =
        already.find(d => d.id === macAddress) || undefined;
      console.log('is connected', connected);

      if (!connected) {
        connected = await bleManager.connectAndDiscover(macAddress);
        console.debug(connected);
      }

      if(connected) {
        setActiveDevice(connected);
        const serviceIds = await bleManager.getCustomServiceId(connected);
        subscribeToDevice(connected, serviceIds[0]);
        setServices(serviceIds);
      }
    } catch(err) {
      console.log("err", err)
    }
  }

  const sendDataToESP = async (pin: number, command: string) => {
    if (!services.length || !activeDevice) {
      const payload = {}
      await sendCommandOverWifi(payload);
      return;
    };
    console.log('Send to ESP:', pin, command);

    try {
      const text = `PIN:${pin}:STATUS:${command}`;
      await bleManager.sendData(activeDevice, text, services[0]);
    } catch (e) {
      console.error('Write failed', e);
    }
  };

  const toggleDevice = async (deviceId: number) => {
    // const device = devices.find((d) => d.id === deviceId);
    // if (!device) return;

    // console.log(device)
    // await sendDataToESP(device.id, device.command);

    // const newState = !device.is_on;
    // console.log(newState)
    // setDevices(
    //   devices.map((d) => (d.id === deviceId ? { ...d, is_on: newState } : d))
    // );

    setDevices(prev =>
      prev.map(d => d.id === deviceId ? { ...d, is_on: !d.is_on } : d)
    );

    // send command; if it fails, revert
    try {
      const dev = devices.find(d => d.id === deviceId);
      if (!dev) return;
      await sendDataToESP(dev.id, dev.command);
    } catch (e) {
      // revert on failure
      setDevices(prev =>
        prev.map(d => d.id === deviceId ? { ...d, is_on: !d.is_on } : d)
      );
    }
  };

  const openSettings = () => {
    if (showSettings) {
      setShowSettings(false);
      return;
    }
    setShowSettings(true);
  };

  const applySettings = async () => {
    if(!tempColor) return;

    // @ts-ignore
    const selectedColor = tempColor?.match(/\d+/g).join(',')
    console.log(tempColor, tempIntensity, selectedColor)

    if (!services.length || !activeDevice) return;
    const text = `COLOR:${selectedColor};BRIGHTNESS:${tempIntensity}`;
    await bleManager.sendData(activeDevice, text, services[0]);


    setShowSettings(false);
  };

  const openWifiModal = async () => {
    const wifiCreds = await  loadWifi();
    console.log("creds", wifiCreds);
    if(wifiCreds && wifiCreds.ssid) {
      setWifiSSID(wifiCreds.ssid);
      setWifiPassword(wifiCreds.pass);
    }
    setShowWifiModal(true);
  };

  const saveWifiConfig = async () => {
    if (!wifiSSID.trim()) {
      Alert.alert('Error', 'Please enter a WiFi network name');
      return;
    }

    if (!wifiPassword.trim() || wifiPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    await saveWifi(wifiSSID, wifiPassword);

    try {
      if (!services.length || !activeDevice) return;
      const text = `WIFI:${wifiSSID};${wifiPassword}`;
      await bleManager.safeWrite({device: activeDevice, serviceUUID: services[0], charUUID: DATA_CHAR_UUID, base64Payload: Buffer.from(text).toString("base64")})
      //await bleManager.sendData(activeDevice, text, services[0]);
    } catch(err) {
      console.log("Error sending wifi creds", err);
    } finally {
      setShowWifiModal(false);
      Alert.alert('Success', 'WiFi credentials sent to device');
    }
  };

  const renderDeviceCard = (device: Device) => {
    const IconComponent = ROOM_ICONS[device.device_type] || Lightbulb;
    const isActive = device.is_on;

    return (
      <TouchableOpacity
        key={device.id}
        style={[
          styles.deviceCard,
          isActive && styles.deviceCardActive,
        ]}
        onPress={() => toggleDevice(device.id)}
      >
        <View style={isActive ? styles.glassOverlay : null} />
        <View style={[styles.deviceIcon, isActive && styles.deviceIconActive]}>
          <IconComponent
            size={26}
            color={isActive ? '#fff' : '#64748b'}
            strokeWidth={1.5}
          />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={[styles.deviceButton, isActive && styles.deviceButtonActive]}>
            Button {device.position}
          </Text>
          <Text style={[styles.deviceName, isActive && styles.deviceNameActive]}>
            {device.name}
          </Text>
        </View>
        <View
          style={[
            styles.deviceStatus,
            { backgroundColor: isActive ? '#fff' : '#64748b' },
          ]}
        />
      </TouchableOpacity>
    );
  };

  const boardColor = '#5b8def';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <ChevronLeft size={20} color="#fff" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton}>
            <Power size={20} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, showSettings && styles.iconButtonActive]}
            onPress={openSettings}
          >
            <Settings size={20} color={showSettings ? '#5b8def' : '#cbd5e1'} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.boardHeader}>
          <View style={styles.boardInfo}>
            <Text style={styles.boardName}>{switchboardName || 'Main Panel'}</Text>
            <View style={styles.boardStatus}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online</Text>
              <Text style={styles.separator}>|</Text>
              <View style={styles.wifiContainer}>
                <Wifi size={14} color="#5b8def" strokeWidth={2} />
                <TouchableOpacity style={styles.configureButton} onPress={openWifiModal}>
                  <Text style={styles.configureText}>Configure WiFi</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <View style={[styles.boardIcon, { backgroundColor: boardColor }]} />
        </View>

        {showSettings && (
          <View style={styles.settingsPanel}>
            <Text style={styles.settingsTitle}>LED Settings</Text>

            <View style={styles.colorSection}>
              <Text style={styles.sectionLabel}>Color</Text>
              <View style={styles.colorGrid}>
                {COLOR_PALETTE.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorButton,
                      { backgroundColor: color },
                      tempColor === color && styles.colorButtonSelected,
                    ]}
                    onPress={() => setTempColor(color)}
                  />
                ))}
              </View>

              <View
                style={[
                  styles.selectedColorPreview,
                  {
                    backgroundColor: tempColor,
                    opacity: tempIntensity / 100,
                  },
                ]}
              />
            </View>

            <View style={styles.intensitySection}>
              <Text style={styles.sectionLabel}>Intensity: {tempIntensity}%</Text>
              <CustomSlider
                value={tempIntensity}
                minimumValue={0}
                maximumValue={100}
                step={1}
                onValueChange={setTempIntensity}
                minimumTrackTintColor="#5b8def"
                maximumTrackTintColor="#334155"
                thumbTintColor="#5b8def"
              />
              <View style={styles.intensityLabels}>
                <Text style={styles.intensityLabel}>Off</Text>
                <Text style={styles.intensityLabel}>Dim</Text>
                <Text style={styles.intensityLabel}>Bright</Text>
              </View>

              <TouchableOpacity style={styles.applyButton} onPress={applySettings}>
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.devicesGrid}>
          {devices.map((device) => renderDeviceCard(device))}
        </View>
      </ScrollView>

      <Modal
        visible={showWifiModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWifiModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configure WiFi</Text>
              <TouchableOpacity onPress={() => setShowWifiModal(false)}>
                <X size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Network Name (SSID)</Text>
              <TextInput
                style={styles.input}
                value={wifiSSID}
                onChangeText={setWifiSSID}
                placeholder="Enter WiFi network name"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={wifiPassword}
                onChangeText={setWifiPassword}
                placeholder="Enter WiFi password"
                placeholderTextColor="#64748b"
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={saveWifiConfig}>
              <Text style={styles.saveButtonText}>Save Configuration</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  iconButtonActive: {
    borderColor: '#5b8def',
    borderWidth: 2,
  },
  content: {
    flex: 1,
  },
  boardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#1e293b',
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  boardInfo: {
    flex: 1,
  },
  boardName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  boardStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  onlineText: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
  },
  separator: {
    fontSize: 14,
    color: '#64748b',
    marginHorizontal: 4,
  },
  wifiContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(91, 141, 239, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.4)',
    gap: 6,
  },
  configureButton: {
    paddingHorizontal: 4,
  },
  configureText: {
    fontSize: 13,
    color: '#5b8def',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
  },
  saveButton: {
    backgroundColor: '#5b8def',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  boardIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
  },
  settingsPanel: {
    backgroundColor: '#1e293b',
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  colorSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  colorButton: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorButtonSelected: {
    borderColor: '#fff',
  },
  selectedColorPreview: {
    width: '100%',
    height: 120,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  intensitySection: {
    marginBottom: 0,
  },
  intensityLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 20,
  },
  intensityLabel: {
    fontSize: 13,
    color: '#94a3b8',
  },
  applyButton: {
    backgroundColor: '#5b8def',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#5b8def',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  devicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
    marginBottom: 32,
  },
  deviceCard: {
    width: '47%',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    minHeight: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    overflow: 'hidden',
  },
  deviceCardActive: {
    backgroundColor: 'rgb(70, 110, 190)',
    borderColor: 'rgba(70, 110, 190, 0.6)',
    borderWidth: 1.5,
    shadowColor: 'rgb(70, 110, 190)',
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  glassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(100, 116, 139, 0.3)',
  },
  deviceIconActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  deviceInfo: {
    marginBottom: 10,
  },
  deviceButton: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 4,
  },
  deviceButtonActive: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  deviceNameActive: {
    color: '#fff',
  },
  deviceStatus: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: 'absolute',
    top: 16,
    right: 16,
  },
});
