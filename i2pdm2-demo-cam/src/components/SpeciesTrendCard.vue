<!-- src/components/SpeciesTrendCard.vue -->
<script setup lang="ts">
import { ref, watch, computed } from "vue";
import axios from "axios";
import { API_BASE_URL } from "@/config";

type Row = { date: string; values: Record<string, number> };

const props = defineProps<{
  userid: string;
  days: number; // 7 或 30
}>();

const loading = ref(false);
const rows = ref<Row[]>([]);

// 這三個物種（鍵名需跟後端 individual_trend 的 values key 相同）
const CLASSES = [
  { key: "薊馬", label: "薊馬" },
  { key: "蕈蠅", label: "蕈蠅" },
  { key: "粉蝨", label: "粉蝨" },
];

async function load() {
  if (!props.userid) return;
  loading.value = true;
  try {
    const { data } = await axios.get(
      `${API_BASE_URL}/history/individual_trend`,
      {
        params: {
          userid: props.userid,
          days: props.days,
          metric: "density", // 固定：密度
          agg: "mean",       // 固定：同一天多張先平均
          classes: CLASSES.map(s => s.key).join(","),
        },
      }
    );
    rows.value = Array.isArray(data) ? (data as Row[]) : [];
  } catch (e) {
    console.error("SpeciesTrend load error:", e);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => [props.userid, props.days], load, { immediate: true });

/** ====== 迷你圖共用繪圖計算 ====== */
const svgW = 300;
const svgH = 90;
const paddingTop = 10;
const paddingBottom = 18;
const paddingLeft = 6;
const paddingRight = 6;
const innerW = svgW - paddingLeft - paddingRight;
const innerH = svgH - paddingTop - paddingBottom;
const strokeW = 2.5;
const yHeadroom = 1.08; // 給上緣留 8% 空間，避免看起來被切

// 取出每個物種的「每日值序列」
function seriesFor(key: string): number[] {
  return rows.value.map(r => r.values?.[key] ?? 0);
}

// 依單一物種序列產生 polyline points 與 area path（各自獨立 y 尺度）
function buildPaths(vals: number[]) {
  const n = vals.length;
  if (n === 0) return { points: "", area: "" };

  const maxData = Math.max(...vals, 0);
  const yMax = Math.max(maxData * yHeadroom, 1e-6); // 避免除以 0
  const baselineY = svgH - paddingBottom;

  const coords: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = paddingLeft + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yRaw = paddingTop + (1 - vals[i] / yMax) * innerH;
    const y = Math.max(paddingTop + strokeW / 2, yRaw);
    coords.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }

  const first = coords[0];
  const last = coords[coords.length - 1];
  const area = n >= 2
    ? `M ${first} L ${coords.slice(1).join(" L ")} L ${last.split(",")[0]},${baselineY} L ${first.split(",")[0]},${baselineY} Z`
    : ""; // n=1 不畫陰影

  return { points: coords.join(" "), area };
}

// 提供給 template 使用：每個物種各自的 points / area
const lastMeta = computed(() => {
  const row = rows.value.length ? rows.value[rows.value.length - 1] : undefined;
  return {
    date: row?.date ?? "",
    values: (row?.values ?? {}) as Record<string, number>,
  };
});

const chartData = computed(() =>
  CLASSES.map(s => {
    const vals = seriesFor(s.key);
    return { key: s.key, label: s.label, vals, ...buildPaths(vals) };
  })
);
</script>

<template>
  <div class="card trend-card">
    <div class="card-header">
      <div class="chart-title">個別害蟲密度趨勢（隻/㎡，近 {{ props.days }} 天）</div>
    </div>

    <div v-if="loading" class="trend-loading">載入中…</div>

    <div v-else class="mini-grid">
      <div v-for="s in chartData" :key="s.key" class="mini">
        <div class="mini-head">
          <span class="mini-label">{{ s.label }}</span>
          <!-- 右上角顯示最後一天的值（四捨五入） -->
          <!-- <span class="mini-value">{{ Math.round(s.vals.length ? s.vals[s.vals.length - 1] : 0) }}</span> -->
           <span class="mini-value" v-if="lastMeta.date">
            <!-- {{ lastMeta.date }} · {{ Math.round(lastMeta.values[s.key] ?? 0) }} -->
              今日即時密度 : {{ Math.round(lastMeta.values[s.key] ?? 0) }}
           </span>
        </div>

        <svg :viewBox="`0 0 ${svgW} ${svgH}`" class="mini-svg" aria-label="species trend">
          <defs>
            <linearGradient :id="`grad-${s.key}`" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f2cd5e" stop-opacity="0.7" />
              <stop offset="100%" stop-color="#1a1a1a" stop-opacity="0" />
            </linearGradient>
          </defs>

          <!-- 陰影 -->
          <path v-if="s.area" :d="s.area" :fill="`url(#grad-${s.key})`" stroke="none" />

          <!-- 折線 -->
          <polyline
            :points="s.points"
            fill="none"
            stroke="#f2cd5e"
            :stroke-width="strokeW"
            stroke-linecap="round"
          />
        </svg>

        <div v-if="s.vals.every(v => v === 0)" class="mini-empty">暫無資料</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 12px;
  backdrop-filter: blur(6px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
  position: relative;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.chart-title { font-weight: 600; font-size: 1rem; color: #f2cd5e; }

.trend-loading { padding: 12px; opacity: 0.85; color: #fff; }

/* 3 個子圖：手機直向會自動換行 */
.mini-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
@media (max-width: 820px) {
  .mini-grid { grid-template-columns: 1fr; }
}

.mini {
  background: rgba(255,255,255,0.04);
  border-radius: 12px;
  padding: 8px 10px 4px;
  position: relative;
}

.mini-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
}
.mini-label { font-size: 0.85rem; color: #f2cd5e; font-weight: 600; }
.mini-value { font-size: 0.6rem; color: #fff; opacity: 0.85; }

.mini-svg {
  width: 100%;
  height: 90px;
  display: block;
  overflow: visible; /* 避免圓角被裁切 */
}

.mini-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 0.8rem;
  color: #fff;
  opacity: 0.6;
  pointer-events: none;
}
</style>
