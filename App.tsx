import { LinkingOptions, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import AppUpdateGate from "./components/AppUpdateGate";
import PushNotificationManager from "./components/PushNotificationManager";
import type { RootStackParamList } from "./constants/types";
import { ROLES } from "./constants/types";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { initDB } from "./db";
import AddRoomScreen from "./screens/AddRoomScreen";
import AddSwitchboardAdminScreen from "./screens/AddSwitchBoardAdminScreen";
import AddSwitchboardScreen from "./screens/AddSwitchboardScreen";
import ConfirmNewBoardScreen from "./screens/ConfirmNewBoardScreen";
import ContactUsScreen from "./screens/ContactUsScreen";
import HomeScreen from "./screens/HomeScreen";
import LoginScreen from "./screens/LoginScreen";
import ProfileScreen from "./screens/ProfileScreen";
import RealtimeMotionViewScreen from "./screens/RealtimeMotionViewScreen";
import RoomScreen from "./screens/RoomScreen";
import SwitchboardScreen from "./screens/SwitchboardScreen";
import WifiConfigScreen from "./screens/WifiConfigScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();
// dropTables();
initDB();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["reflekt://"],
  config: {
    screens: {
      Login: "login",
      Home: "home",
      Profile: "settings",
      ContactUs: "contact-us",
    },
  },
};

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function AdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="AddSwitchboardAdmin"
        component={AddSwitchboardAdminScreen}
      />
      <Stack.Screen name="Switchboard" component={SwitchboardScreen} />
      <Stack.Screen
        name="RealtimeMotionView"
        component={RealtimeMotionViewScreen}
      />
      <Stack.Screen name="WifiConfig" component={WifiConfigScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="ContactUs" component={ContactUsScreen} />
    </Stack.Navigator>
  );
}

function UserStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="AddRoom" component={AddRoomScreen} />
      <Stack.Screen name="Room" component={RoomScreen} />
      <Stack.Screen name="Switchboard" component={SwitchboardScreen} />
      <Stack.Screen
        name="RealtimeMotionView"
        component={RealtimeMotionViewScreen}
      />
      <Stack.Screen name="WifiConfig" component={WifiConfigScreen} />
      <Stack.Screen name="ConfirmNewBoard" component={ConfirmNewBoardScreen} />
      <Stack.Screen name="AddSwitchboard" component={AddSwitchboardScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="ContactUs" component={ContactUsScreen} />
    </Stack.Navigator>
  );
}

function Navigation() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!user)
    return (
      <NavigationContainer linking={linking}>
        <AuthStack />
      </NavigationContainer>
    );

  switch (user?.role) {
    case ROLES.ADMIN:
      return (
        <NavigationContainer linking={linking}>
          <AdminStack />
        </NavigationContainer>
      );
    case ROLES.USER:
    default:
      return (
        <NavigationContainer linking={linking}>
          <UserStack />
        </NavigationContainer>
      );
  }
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppUpdateGate>
          <PushNotificationManager />
          <StatusBar style="light" />
          <Navigation />
        </AppUpdateGate>
      </ToastProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
});
