import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { X } from "lucide-react-native";
import type { IrCatalogProfile, IrDeviceType } from "@/types/ir";

type Props = {
  visible: boolean;
  title?: string;
  deviceTypes: IrDeviceType[];
  brands: string[];
  models: IrCatalogProfile[];
  selectedDeviceType?: IrDeviceType | null;
  selectedBrand?: string | null;
  selectedModelId?: string | null;
  confirmLabel?: string;
  busy?: boolean;
  onClose: () => void;
  onSelectDeviceType: (value: IrDeviceType) => void;
  onSelectBrand: (value: string) => void;
  onSelectModel: (catalogId: string) => void;
  onContinue?: () => void;
};

export default function IrWidgetSetupModal({
  visible,
  title = "Add IR Widget",
  deviceTypes,
  brands,
  models,
  selectedDeviceType,
  selectedBrand,
  selectedModelId,
  confirmLabel = "Save Config",
  busy = false,
  onClose,
  onSelectDeviceType,
  onSelectBrand,
  onSelectModel,
  onContinue,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={16} style={styles.closeButton}>
              <X size={20} color="#94a3b8" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.label}>Device Type</Text>
              <View style={styles.wrap}>
                {deviceTypes.map((item) => {
                  const active = item === selectedDeviceType;
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => onSelectDeviceType(item)}
                      disabled={busy}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.replace("_", " ")}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Brand</Text>
              {brands.length ? (
                <View style={styles.wrap}>
                  {brands.map((item) => {
                    const active = item === selectedBrand;
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => onSelectBrand(item)}
                        disabled={busy}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyText}>
                  Select device type to load brands.
                </Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Model</Text>
              {models.length ? (
                <View style={styles.column}>
                  {models.map((item) => {
                    const active = item.catalog_id === selectedModelId;
                    return (
                      <TouchableOpacity
                        key={item.catalog_id}
                        style={[styles.card, active && styles.cardActive]}
                        onPress={() => onSelectModel(item.catalog_id)}
                        disabled={busy}
                      >
                        <Text style={[styles.cardTitle, active && styles.cardTitleActive]}>
                          {item.display_name}
                        </Text>
                        <Text style={styles.cardMeta}>
                          {item.brand} • {item.model} • {item.command_mode}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyText}>
                  Select brand to load models.
                </Text>
              )}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
            onPress={onContinue}
            disabled={busy || !selectedModelId}
          >
            <Text style={styles.primaryButtonText}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  section: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 13,
    color: "#64748b",
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  column: {
    gap: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
  },
  chipActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  chipText: {
    fontSize: 14,
    color: "#0f172a",
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: "#ffffff",
  },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#ffffff",
  },
  cardActive: {
    borderColor: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  cardTitleActive: {
    color: "#020617",
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748b",
  },
  primaryButton: {
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: "#0f172a",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
