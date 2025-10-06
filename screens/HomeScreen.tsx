import { fetchDevicesByMac } from '@/api/devics';
import { getRooms } from '@/api/room';
import { useDebouncedCallback } from '@/callbacks/useDeboundcedCallback';
import { ROOM_ICONS } from '@/constants';
import bleManager from '@/services/bleManager';
import { getBleDevice } from '@/utils/storage';
import { Hop as Home, Plus, User } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Device as BleDevice } from 'react-native-ble-plx';

interface Room {
  _id: string;
  name: string;
  icon: string;
  switchboardCount: number;
}

interface Switchboard {
  id: string;
  name: string;
  room_name: string;
  color: string;
  is_online: boolean;
  icon: string;
}

const SWITCHBOARD_COLORS = [
  '#5b8def',
  '#7c6fd8',
  '#4ade80',
  '#5eead4',
  '#fbbf24',
  '#fb923c',
];

export default function HomeScreen({ navigation }: any) {
  const [scanning, setScanning] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [switchboards, setSwitchboards] = useState<Switchboard[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAlreadyConnected = useCallback(async () => {
    try {
      const already = await bleManager.connectedDevices();
      return already;
    } catch (e: any) {
      console.warn('Error fetching connected devices', e);
      return [];
    }
  }, []);
  
  
  const startScan = useCallback(async () => {
    try {
      const lastId = await getBleDevice();
      let didReconnect = false;

      if (lastId) {
        try {
          // try a direct connect (with autoConnect on Android)
          const d = await bleManager.connectToDevice(lastId);
          console.log('reconnected device', d);
          if(d) {
            await d.discoverAllServicesAndCharacteristics();
            didReconnect = true;
            setDevices([d]);
          }
        } catch (err) {
          console.warn('Auto‐reconnect failed, falling back to scan', err);
        }
      }
      const already = await fetchAlreadyConnected();
      let seed = [...already];

      if (lastId && !already.find(d => d.id === lastId)) {
        console.log('Previously connected device not found:', lastId);
      }
      console.log("seed", seed)
      setDevices(seed);
      bleManager.startScan(device => {
        setDevices(prev =>
          prev.find(d => d.id === device.id) ? prev : [...prev, device],
        );
      });
    } catch (err: any) {
      console.log(err);
      bleManager.stopScan();
      return;
    }

    setTimeout(() => {
      bleManager.stopScan();
      setScanning(false);
    }, 30000);
  }, []);

  const loadRooms = async () => {
    setLoading(true);
    const roomData = await getRooms();
    setRooms(roomData);
    setLoading(false);
  };

  const fetchDevicesDebounced = useDebouncedCallback(
    async (ids: string[]) => {
      console.log(ids);
      const foundDevices = await fetchDevicesByMac(ids);
      console.log(foundDevices);
      const nearByDevices: Switchboard[] = []
      foundDevices.forEach(device => {
        
        const obj: Switchboard = {
          id: device.device_id,
          name: device.title,
          room_name: device.room_name,
          color: SWITCHBOARD_COLORS[Math.floor(Math.random() * SWITCHBOARD_COLORS.length)],
          is_online: true,
          icon: device.room_icon
        }
        nearByDevices.push(obj);
      });

      setSwitchboards(nearByDevices);
    },
    500,
    { leading: false, trailing: true },
    [fetchDevicesByMac]
  );

  useEffect(() => {
    loadRooms();
  }, []);

  useEffect(() => {
    startScan();
    return () => {
      setScanning(false)
      bleManager.stopScan();
    };
  }, [startScan]);

  useEffect(() => {
    if (!devices.length) return;
    const deviceIds = devices.map(d => d.id);
    fetchDevicesDebounced(deviceIds);
    return () => fetchDevicesDebounced.cancel();
  }, [devices, fetchDevicesDebounced]);

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const onlineCount = switchboards.filter((sb) => sb.is_online).length;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadRooms}
            tintColor="#fff"
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>{getTimeGreeting()}</Text>
            <Text style={styles.subtitle}>Welcome back to your smart home</Text>
          </View>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate("Profile")}
          >
            <User size={20} color="#94a3b8" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>ROOMS</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => navigation.navigate("AddRoom")}
            >
              <Plus size={18} color="#5b8def" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.roomGrid}>
              {rooms.map((room) => {
                const IconComponent = ROOM_ICONS[room.icon] || Home;
                return (
                  <TouchableOpacity
                    key={room._id}
                    style={styles.roomCard}
                    onPress={() =>
                      navigation.navigate("Room", {
                        roomId: room._id,
                        roomName: room.name,
                        roomIcon: room.icon,
                      })
                    }
                  >
                    <View style={styles.roomIconContainer}>
                      <IconComponent
                        size={24}
                        color="#5b8def"
                        strokeWidth={2}
                      />
                    </View>
                    <Text style={styles.roomName}>{room.name}</Text>
                    <View style={styles.roomFooter}>
                      <View style={styles.onlineIndicator} />
                      <Text style={styles.roomCount}>
                        {room.switchboardCount}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View style={styles.nearbyContainer}>
          <View style={styles.nearbyHeader}>
            <Text style={styles.nearbyTitle}>Nearby Boards</Text>
            <Text style={styles.nearbyCount}>{onlineCount} online</Text>
          </View>

          <View style={styles.switchboardsList}>
            {switchboards.map((switchboard) => {
              // const IconComponent = ROOM_ICONS[switchboard.room_icon] || Lightbulb;
              return (
                  <TouchableOpacity
                    key={switchboard.id}
                    style={styles.switchboardCard}
                    onPress={() =>
                      navigation.navigate("Switchboard", {
                        switchboardId: switchboard.id,
                        switchboardName: switchboard.name,
                        deviceId: switchboard.id
                      })
                    }
                  >
                   {/* <View style={styles.switchboardIcon}>
                      <IconComponent
                        size={24}
                        color="#5b8def"
                        strokeWidth={2}
                      />
                    </View> */}
                    <View
                      style={[
                        styles.switchboardIcon,
                        { backgroundColor: switchboard.color },
                      ]}
                    />
                    <View style={styles.switchboardInfo}>
                      <Text style={styles.switchboardName}>{switchboard.name}</Text>
                      <Text style={styles.switchboardRoom}>
                        {switchboard.room_name}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor: switchboard.is_online
                            ? "#10b981"
                            : "#64748b",
                        },
                      ]}
                    />
                  </TouchableOpacity>
              )
            }
              
            )}
          </View>
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
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 20,
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
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
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1.5,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(91, 141, 239, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.3)',
  },
  roomGrid: {
    flexDirection: 'row',
    gap: 16,
    paddingRight: 24,
  },
  roomCard: {
    width: 110,
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  roomIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#2d3b52',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  roomName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  roomFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  roomCount: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  nearbyContainer: {
    backgroundColor: '#1e293b',
    marginHorizontal: 24,
    marginBottom: 32,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  nearbyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  nearbyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  nearbyCount: {
    fontSize: 14,
    color: '#64748b',
  },
  switchboardsList: {
    gap: 12,
  },
  switchboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d3b52',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#3d4b62',
  },
  switchboardIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#2d3b52',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(100, 116, 139, 0.3)',
  },
  switchboardInfo: {
    flex: 1,
  },
  switchboardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  switchboardRoom: {
    fontSize: 13,
    color: '#94a3b8',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  }
});
