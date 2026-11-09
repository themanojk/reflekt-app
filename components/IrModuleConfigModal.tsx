import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Plus, X } from "lucide-react-native";
import type { Device } from "@/screens/SwitchboardScreen";
import type { IrWidgetBinding } from "@/types/ir";

type Props = {
  visible: boolean;
  attachedIrModules: string[];
  acDevices: Device[];
  irBindings: IrWidgetBinding[];
  pinConfigs: Record<number, any>;
  busy?: boolean;
  onClose: () => void;
  onDetectModule: () => void;
  onDetachModule: (mac: string) => void;
  onConfigureAc: (device: Device) => void;
  onAddWidget: () => void;
  onEditWidget: (binding: IrWidgetBinding) => void;
};

export default function IrModuleConfigModal({
  visible,
  attachedIrModules,
  acDevices,
  irBindings,
  pinConfigs,
  busy = false,
  onClose,
  onDetectModule,
  onDetachModule,
  onConfigureAc,
  onAddWidget,
  onEditWidget,
}: Props) {
  const widgetBindings = irBindings.filter((binding) => binding.device_type !== "AC");

  const acBindingByPin = new Map<number, IrWidgetBinding>(
    irBindings
      .filter((binding) => binding.device_type === "AC" && binding.hub_pin > 0)
      .map((binding) => [binding.hub_pin, binding]),
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.title}>IR Module Config</Text>
          <Pressable onPress={onClose} hitSlop={20} style={styles.closeButton}>
            <X size={22} color="#94a3b8" />
          </Pressable>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.sectionTitle}>IR Module</Text>
              <TouchableOpacity style={styles.actionBtn} onPress={onDetectModule}>
                <Text style={styles.actionBtnText}>Detect</Text>
              </TouchableOpacity>
            </View>
            {attachedIrModules.length === 0 ? (
              <Text style={styles.emptyText}>No IR module attached to this hub.</Text>
            ) : (
              attachedIrModules.map((mac) => (
                <View key={mac} style={styles.itemCard}>
                  <View style={styles.row}>
                    <Text style={styles.itemTitle}>{mac}</Text>
                    <TouchableOpacity onPress={() => onDetachModule(mac)}>
                      <Text style={styles.dangerText}>Detach</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.metaText}>
                    This module config syncs across phones through backend bindings.
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>AC Config</Text>
            <Text style={styles.hintText}>
              Select AC type, brand, and model for each AC pin.
            </Text>
            {acDevices.length === 0 ? (
              <Text style={styles.emptyText}>No AC pins available on this hub.</Text>
            ) : (
              acDevices.map((device) => {
                const binding = acBindingByPin.get(device.id);
                const displayName =
                  pinConfigs[device.id]?.name?.trim() ||
                  device.name?.trim() ||
                  `Pin ${device.id}`;
                return (
                  <View key={`ac-config-${device.id}`} style={styles.itemCard}>
                    <View style={styles.row}>
                      <View style={styles.textWrap}>
                        <Text style={styles.itemTitle}>
                          {displayName} · Pin {device.id}
                        </Text>
                        <Text style={styles.metaText}>
                          {binding
                            ? `${binding.display_name} • ${binding.device_type}`
                            : "No AC IR config selected"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.actionBtn, busy && styles.btnDisabled]}
                        onPress={() => onConfigureAc(device)}
                        disabled={busy}
                      >
                        <Text style={styles.actionBtnText}>
                          {binding ? "Edit" : "Configure"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.sectionTitle}>Widgets</Text>
              <TouchableOpacity
                style={[styles.primaryBtn, busy && styles.btnDisabled]}
                onPress={onAddWidget}
                disabled={busy}
              >
                <Plus size={16} color="#eff6ff" />
                <Text style={styles.primaryBtnText}>Add Widget</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hintText}>
              Add brand/model based widgets like RGB light. These sync to new phones.
            </Text>
            {widgetBindings.length === 0 ? (
              <Text style={styles.emptyText}>No extra IR widgets added yet.</Text>
            ) : (
              widgetBindings.map((binding) => (
                <View key={binding.binding_id} style={styles.itemCard}>
                  <View style={styles.row}>
                    <View style={styles.textWrap}>
                      <Text style={styles.itemTitle}>{binding.display_name}</Text>
                      <Text style={styles.metaText}>
                        {binding.device_type.replace("_", " ")} • {binding.catalog_id}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.actionBtn, busy && styles.btnDisabled]}
                      onPress={() => onEditWidget(binding)}
                      disabled={busy}
                    >
                      <Text style={styles.actionBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
    paddingTop: 56,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "700",
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  body: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  bodyContent: {
    paddingBottom: 160,
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  textWrap: {
    flex: 1,
  },
  sectionTitle: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "700",
  },
  hintText: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 8,
    marginBottom: 10,
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 13,
  },
  itemCard: {
    backgroundColor: "#0b1220",
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  itemTitle: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "700",
  },
  metaText: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 4,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0b1220",
  },
  actionBtnText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#2563eb",
  },
  primaryBtnText: {
    color: "#eff6ff",
    fontSize: 12,
    fontWeight: "700",
  },
  dangerText: {
    color: "#fca5a5",
    fontSize: 12,
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
