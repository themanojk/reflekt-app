import { DatabaseDevice } from "@/api/devics";
import LiquidTouchable from "@/components/LiquidTouchable";
import { ROOM_ICONS } from "@/constants";
import type { RootStackParamList } from "@/constants/types";
import { getSwitchboardsByRoomId } from "@/db/switchboards.local";
import { syncAppData } from "@/db_sync/app_sync";
import { RouteProp } from "@react-navigation/native";
import { ChevronLeft, Plus } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  route: RouteProp<RootStackParamList, "Room">;
  navigation: any;
};

export default function RoomScreen({ route, navigation }: Props) {
  const { roomId, roomName, roomIcon, devices } = route.params;
  const [switchboards, setSwitchboards] = useState<DatabaseDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggleAnimations, setToggleAnimations] = useState<
    Map<string, Animated.Value>
  >(new Map());
  const IconComponent = ROOM_ICONS[roomIcon];

  useEffect(() => {
    console.log(roomId);
    loadSwitchboards();
  }, [roomId]);

  useEffect(() => {
    const newAnimations = new Map();
    switchboards.forEach((sb) => {
      if (!toggleAnimations.has(sb._id)) {
        newAnimations.set(sb._id, new Animated.Value(sb.is_powered ? 1 : 0));
      }
    });
    if (newAnimations.size > 0) {
      setToggleAnimations(new Map([...toggleAnimations, ...newAnimations]));
    }
  }, [switchboards]);

  const togglePower = async (switchboardId: string) => {
    const switchboard = switchboards.find((s) => s._id === switchboardId);
    if (!switchboard) return;

    const newPowerState = !switchboard.is_powered;
    const animation = toggleAnimations.get(switchboardId);

    if (animation) {
      Animated.spring(animation, {
        toValue: newPowerState ? 1 : 0,
        useNativeDriver: false,
        friction: 5,
        tension: 100,
      }).start();
    }

    setSwitchboards(
      switchboards.map((s) =>
        s._id === switchboardId ? { ...s, is_powered: newPowerState } : s
      )
    );
  };

  const loadSwitchboards = async () => {
    setLoading(true);
    try {
      let boardData = await getSwitchboardsByRoomId(roomId);
      if (!boardData.length) {
        await syncAppData();
        boardData = await getSwitchboardsByRoomId(roomId);
      }
      console.log(boardData);
      const deviceObj: any = {};
      devices.forEach((device) => {
        deviceObj[device.id] = true;
      });

      boardData.forEach((item) => {
        item.is_online = item.device_id && deviceObj[item.device_id] ? true : false;
      });
      setSwitchboards(boardData);
      setLoading(false);
    } catch (e: any) {
      console.log(e.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <LiquidTouchable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          borderRadius={16}
        >
          <ChevronLeft size={20} color="#fff" />
          <Text style={styles.backText}>Back</Text>
        </LiquidTouchable>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadSwitchboards}
            tintColor="#fff"
          />
        }
      >
        <View style={styles.titleSection}>
          <Text style={styles.roomTitle}>{roomName}</Text>
          <Text style={styles.roomSubtitle}>
            {switchboards.length} switchboard
            {switchboards.length !== 1 ? "s" : ""}
          </Text>
        </View>

        <View style={styles.switchboardsList}>
          {switchboards.map((switchboard) => {
            console.log(switchboard);
            return (
              <LiquidTouchable
                key={switchboard.id}
                style={styles.switchboardCard}
                borderRadius={26}
                intensity="medium"
                onPress={() =>
                  navigation.navigate("Switchboard", {
                    service_id: switchboard.service_id,
                    switchboardName: switchboard.name,
                    deviceId: switchboard.id,
                    roomIcon: roomIcon,
                    roomId: roomId,
                    status: switchboard.is_online,
                  })
                }
              >
                <View style={[styles.switchboardIcon]}>
                  <IconComponent size={24} color="#5b8def" strokeWidth={2} />
                </View>
                <View style={styles.switchboardInfo}>
                  <Text style={styles.switchboardName}>{switchboard.name}</Text>
                  {switchboard.is_online && (
                    <View style={styles.statusRow}>
                      <View style={styles.onlineDot} />
                      <Text style={styles.onlineText}>Online</Text>
                    </View>
                  )}
                  {!switchboard.is_online && (
                    <View style={styles.statusRow}>
                      <View style={styles.offlineDot} />
                      <Text style={styles.offlineText}>Offline</Text>
                    </View>
                  )}
                </View>
                <LiquidTouchable
                  style={styles.toggleContainer}
                  onPress={(e) => {
                    e.stopPropagation();
                    togglePower(switchboard._id);
                  }}
                  borderRadius={18}
                >
                  <Animated.View
                    style={[
                      styles.toggleButton,
                      {
                        backgroundColor: toggleAnimations
                          .get(switchboard._id)
                          ?.interpolate({
                            inputRange: [0, 1],
                            outputRange: [
                              "rgba(51, 65, 85, 0.4)",
                              "rgba(91, 141, 239, 0.35)",
                            ],
                          }),
                        borderColor: toggleAnimations
                          .get(switchboard._id)
                          ?.interpolate({
                            inputRange: [0, 1],
                            outputRange: [
                              "rgba(148, 163, 184, 0.2)",
                              "rgba(91, 141, 239, 0.5)",
                            ],
                          }),
                      },
                    ]}
                  >
                    <Animated.View
                      style={[
                        styles.toggleThumb,
                        {
                          transform: [
                            {
                              translateX:
                                toggleAnimations
                                  .get(switchboard._id)
                                  ?.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, 22],
                                  }) || 0,
                            },
                          ],
                          backgroundColor: toggleAnimations
                            .get(switchboard._id)
                            ?.interpolate({
                              inputRange: [0, 1],
                              outputRange: [
                                "rgba(148, 163, 184, 0.9)",
                                "#5b8def",
                              ],
                            }),
                        },
                      ]}
                    >
                      <Animated.View
                        style={[
                          styles.thumbGloss,
                          {
                            opacity: toggleAnimations
                              .get(switchboard._id)
                              ?.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.3, 0.6],
                              }),
                          },
                        ]}
                      />
                    </Animated.View>
                    <Animated.View
                      style={[
                        styles.toggleGlow,
                        {
                          opacity: toggleAnimations
                            .get(switchboard._id)
                            ?.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 0.6],
                            }),
                        },
                      ]}
                    />
                  </Animated.View>
                </LiquidTouchable>
              </LiquidTouchable>
            );
          })}

          <LiquidTouchable
            style={styles.addButton}
            onPress={() => navigation.navigate("AddSwitchboard", { roomId })}
            borderRadius={20}
          >
            <Plus size={20} color="#fff" strokeWidth={2.5} />
            <Text style={styles.addButtonText}>Add Switchboard</Text>
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
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
  },
  content: {
    flex: 1,
  },
  titleSection: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  roomTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 6,
  },
  roomSubtitle: {
    fontSize: 15,
    color: "#94a3b8",
  },
  switchboardsList: {
    paddingHorizontal: 24,
    gap: 16,
  },
  switchboardCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  switchboardIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    marginRight: 14,
    backgroundColor: "#2d3b52",
    alignItems: "center",
    justifyContent: "center",
  },
  switchboardInfo: {
    flex: 1,
  },
  switchboardName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 5,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  onlineText: {
    fontSize: 13,
    color: "#10b981",
    fontWeight: "500",
  },
  offlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#b91010ff",
  },
  offlineText: {
    fontSize: 13,
    color: "#b91010ff",
    fontWeight: "500",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5b8def",
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
    marginBottom: 32,
    shadowColor: "#5b8def",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  toggleContainer: {
    marginLeft: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  toggleButton: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: "center",
    borderWidth: 1.5,
    overflow: "hidden",
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    overflow: "hidden",
  },
  thumbGloss: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  toggleGlow: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 16,
    backgroundColor: "#5b8def",
    opacity: 0,
  },
});
