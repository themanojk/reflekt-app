import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  sessionActive: boolean;
  coverageRangeCm: number;
  lastUpdatedAt: string;
};

export default function RealtimeMotionLegend({
  sessionActive,
  coverageRangeCm,
  lastUpdatedAt,
}: Props) {
  return (
    <>
      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>
          {sessionActive ? "Live local debug mode" : "Connecting local debug mode"}
        </Text>
        <Text style={styles.statusMeta}>Coverage range {coverageRangeCm} cm</Text>
        <Text style={styles.statusMeta}>Last update {lastUpdatedAt}</Text>
      </View>

      <View style={styles.legendCard}>
        <Text style={styles.legendTitle}>How to read this view</Text>
        <Text style={styles.legendCopy}>
          The sensor sits at the top, and the graph covers 0 to 700 cm down the room.
          Bigger dots mean stronger micro-motion score. Color flows continuously from
          green for low movement to red for heavy movement.
        </Text>
        <Text style={styles.legendCopy}>
          If multiple motion peaks are present at the same time, up to three dots are
          shown together in the current frame.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.18)",
  },
  statusLabel: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
  statusMeta: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 6,
  },
  legendCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.14)",
  },
  legendTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  legendCopy: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
});
