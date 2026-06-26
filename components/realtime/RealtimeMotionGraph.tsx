import React from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Rect,
  Stop,
} from "react-native-svg";

export type RealtimeMotionDot = {
  distanceCm: number;
  score: number;
};

type Props = {
  coverageRangeCm: number;
  dots: RealtimeMotionDot[];
  loading?: boolean;
};

const MAX_GRAPH_RANGE_CM = 700;
const GRID_STEP_CM = 100;
const DOT_MIN_RADIUS = 8;
const DOT_MAX_RADIUS = 24;
const GRAPH_HEIGHT = Math.round(Dimensions.get("window").height * 0.75);
const GRAPH_WIDTH = Math.min(Dimensions.get("window").width - 40, 360);

const getDotRadius = (score: number) => {
  const normalized = Math.max(0, Math.min(1, score / 100));
  return DOT_MIN_RADIUS + normalized * (DOT_MAX_RADIUS - DOT_MIN_RADIUS);
};

const getDotColor = (score: number) => {
  const normalized = Math.max(0, Math.min(1, score / 100));
  const hue = 120 - normalized * 120;
  return `hsl(${hue}, 90%, 50%)`;
};

export default function RealtimeMotionGraph({
  coverageRangeCm,
  dots,
  loading,
}: Props) {
  const laneXPositions = React.useMemo(
    () => [GRAPH_WIDTH * 0.3, GRAPH_WIDTH * 0.5, GRAPH_WIDTH * 0.7],
    [],
  );

  const graphDots = React.useMemo(() => {
    return dots.slice(0, 3).map((dot, index) => ({
      ...dot,
      x: laneXPositions[index] ?? laneXPositions[laneXPositions.length - 1],
      y:
        56 +
        (Math.max(0, Math.min(MAX_GRAPH_RANGE_CM, dot.distanceCm)) /
          MAX_GRAPH_RANGE_CM) *
          (GRAPH_HEIGHT - 92),
    }));
  }, [dots, laneXPositions]);

  const coverageHeight =
    56 +
    (Math.max(30, Math.min(MAX_GRAPH_RANGE_CM, coverageRangeCm)) /
      MAX_GRAPH_RANGE_CM) *
      (GRAPH_HEIGHT - 92);

  return (
    <View style={styles.graphCard}>
      <Svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT}>
        <Defs>
          <LinearGradient id="graphBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#102a43" stopOpacity="1" />
            <Stop offset="100%" stopColor="#08131f" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="coverage" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#38bdf8" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
          </LinearGradient>
        </Defs>
        <Rect
          x={0}
          y={0}
          width={GRAPH_WIDTH}
          height={GRAPH_HEIGHT}
          rx={28}
          fill="url(#graphBg)"
        />
        <Rect
          x={20}
          y={56}
          width={GRAPH_WIDTH - 40}
          height={coverageHeight - 56}
          rx={20}
          fill="url(#coverage)"
        />
        {Array.from(
          { length: Math.floor(MAX_GRAPH_RANGE_CM / GRID_STEP_CM) + 1 },
          (_, index) => {
            const cm = index * GRID_STEP_CM;
            const y =
              56 + (cm / MAX_GRAPH_RANGE_CM) * (GRAPH_HEIGHT - 92);
            return (
              <Line
                key={cm}
                x1={24}
                y1={y}
                x2={GRAPH_WIDTH - 24}
                y2={y}
                stroke="rgba(148, 163, 184, 0.2)"
                strokeWidth={1}
                strokeDasharray="5 7"
              />
            );
          },
        )}
        <Circle
          cx={GRAPH_WIDTH / 2}
          cy={30}
          r={16}
          fill="#e2e8f0"
          stroke="#38bdf8"
          strokeWidth={3}
        />
        <Line
          x1={GRAPH_WIDTH / 2}
          y1={46}
          x2={GRAPH_WIDTH / 2}
          y2={GRAPH_HEIGHT - 28}
          stroke="rgba(148, 163, 184, 0.24)"
          strokeWidth={2}
        />
        {graphDots.map((dot, index) => (
          <Circle
            key={`${dot.distanceCm}-${dot.score}-${index}`}
            cx={dot.x}
            cy={dot.y}
            r={getDotRadius(dot.score)}
            fill={getDotColor(dot.score)}
            fillOpacity={0.78}
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={1.5}
          />
        ))}
      </Svg>

      <View pointerEvents="none" style={styles.labelsLayer}>
        {Array.from(
          { length: Math.floor(MAX_GRAPH_RANGE_CM / GRID_STEP_CM) + 1 },
          (_, index) => {
            const cm = index * GRID_STEP_CM;
            const y =
              56 + (cm / MAX_GRAPH_RANGE_CM) * (GRAPH_HEIGHT - 92);
            return (
              <Text
                key={`label-${cm}`}
                style={[
                  styles.gridLabel,
                  {
                    top: y - 10,
                  },
                ]}
              >
                {cm} cm
              </Text>
            );
          },
        )}
      </View>

      {loading ? (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Preparing local stream...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  graphCard: {
    borderRadius: 30,
    padding: 12,
    backgroundColor: "#020817",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  labelsLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLabel: {
    position: "absolute",
    right: 22,
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "600",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.58)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
  },
});
