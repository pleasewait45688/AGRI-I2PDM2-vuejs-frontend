<!-- usage -->
<!-- <SpeciesBarChart
      v-if="userId"
      :userid="userId as string"
      :days="selectedDays"
    /> -->

<!-- src/components/SpeciesBarChart.vue -->
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

// 類別定義（鍵名要和 API 對齊）
const CLASSES = [
  { key: "薊馬", label: "薊馬"  },
  { key: "蕈蠅", label: "蕈蠅"  },
  { key: "粉蝨", label: "粉蝨"  },
];

// 顏色：維持你的金色系為主，三種深淺
const COLORS: Record<string, string> = {
  薊馬: "#f2cd5e",
  蕈蠅: "#d8b84f",
  粉蝨: "#bfa142",
};

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
          metric: "density",               // 固定密度
          agg: "mean",                     // 同日多張先平均
          classes: CLASSES.map(s => s.key).join(","),
          _t: Date.now(),                  // 防快取
        },
      }
    );
    rows.value = Array.isArray(data) ? data as Row[] : [];
  } catch (e) {
    console.error("SpeciesBarChart load error:", e);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => [props.userid, props.days], load, { immediate: true });

/** ====== 繪圖參數 ====== */
const svgW = 900;              // viewBox 寬（會等比縮放）
const svgH = 280;              // viewBox 高
const pad = { top: 20, right: 16, bottom: 40, left: 40 };
const innerW = svgW - pad.left - pad.right;
const innerH = svgH - pad.top - pad.bottom;
const groupGap = 8;            // 組與組之間的間距
const barGap = 4;              // 組內柱子間距

// y 軸最大值（留 10% 空隙）
const yMax = computed(() => {
  const vals: number[] = [];
  for (const r of rows.value) {
    for (const s of CLASSES) vals.push(r.values?.[s.key] ?? 0);
  }
  const m = Math.max(1, ...vals);
  return m * 1.1;
});

// x 對應
const n = computed(() => rows.value.length);
const groupWidth = computed(() =>
  n.value ? (innerW - groupGap * (n.value - 1)) / n.value : 0
);

// 單根柱子的寬
const barWidth = computed(() => {
  const k = CLASSES.length;
  if (!k) return 0;
  return Math.max(2, (groupWidth.value - barGap * (k - 1)) / k);
});

// y 對應：數值 → 像素高度
function valueToHeight(v: number) {
  const h = (v / yMax.value) * innerH;
  return Math.max(0, Math.min(innerH, h));
}

// x 座標：第 i 組（0-based）左上角 x
function groupX(i: number) {
  return pad.left + i * (groupWidth.value + groupGap);
}

// 柱子 x：第 i 組、組內第 j 根（0-based）
function barX(i: number, j: number) {
  return groupX(i) + j * (barWidth.value + barGap);
}

// y 座標（柱子頂部）：將高度轉為自上往下的 y
function barY(v: number) {
  const h = valueToHeight(v);
  return pad.top + (innerH - h);
}

// 軸線與刻度（簡易）
const yTicks = computed(() => {
  const steps = 4; // 刻度數（含 0）
  const out: { y: number; label: string }[] = [];
  for (let i = 0; i <= steps; i++) {
    const val = (yMax.value / steps) * i;
    const y = pad.top + (innerH - (val / yMax.value) * innerH);
    out.push({ y, label: Math.round(val).toString() });
  }
  return out;
});

// Tooltip
const tip = ref<{ show: boolean; x: number; y: number; text: string }>({
  show: false, x: 0, y: 0, text: ""
});
function onEnter(e: MouseEvent, date: string, cls: string, v: number) {
  const target = e.currentTarget as SVGRectElement;
  const bb = target.getBoundingClientRect();
  tip.value = {
    show: true,
    x: bb.left + bb.width / 2,
    y: bb.top,
    text: `${date}｜${cls}：${Math.round(v)}`
  };
}
function onLeave() {
  tip.value.show = false;
}

// 是否改為堆疊（目前預設 false；要改堆疊把這個切 true，並調整 height/ y 計算）
const STACKED = false;
</script>

<template>
  <div class="card bar-card">
    <div class="card-header">
      <div class="chart-title">個別害蟲密度（隻/㎡）柱狀圖（近 {{ days }} 天）</div>
      <div class="legend">
        <span v-for="s in CLASSES" :key="s.key" class="legend-item">
          <i :style="{background: COLORS[s.key]}"></i>{{ s.label }}
        </span>
      </div>
    </div>

    <div v-if="loading" class="loading">載入中…</div>

    <div v-else class="svg-wrap">
      <svg :viewBox="`0 0 ${svgW} ${svgH}`" class="chart-svg" aria-label="bar chart">
        <!-- 背景 -->
        <rect :x="pad.left" :y="pad.top" :width="innerW" :height="innerH"
              fill="rgba(255,255,255,0.03)" rx="8" />

        <!-- y 軸刻度線與標籤 -->
        <g>
          <line
            v-for="t in yTicks" :key="t.y"
            :x1="pad.left" :x2="pad.left + innerW"
            :y1="t.y" :y2="t.y"
            stroke="rgba(255,255,255,0.06)" stroke-width="1" />
          <text
            v-for="t in yTicks" :key="t.label"
            :x="pad.left - 6" :y="t.y" text-anchor="end" dominant-baseline="middle"
            fill="#ffffff" opacity="0.7" font-size="10">{{ t.label }}</text>
        </g>

        <!-- x 軸日期 -->
        <g>
          <text
            v-for="(r,i) in rows" :key="r.date"
            :x="groupX(i) + groupWidth/2"
            :y="pad.top + innerH + 16"
            text-anchor="middle"
            fill="#ffffff" opacity="0.7" font-size="10">{{ r.date.slice(5) }}</text>
        </g>

        <!-- 分組柱 -->
        <g v-for="(r,i) in rows" :key="r.date">
          <template v-if="!STACKED">
            <rect
              v-for="(s, j) in CLASSES" :key="s.key"
              :x="barX(i, j)" :y="barY(r.values?.[s.key] ?? 0)"
              :width="barWidth" :height="valueToHeight(r.values?.[s.key] ?? 0)"
              :fill="COLORS[s.key]" opacity="0.9" rx="2"
              @mouseenter="onEnter($event, r.date, s.label, r.values?.[s.key] ?? 0)"
              @mouseleave="onLeave" />
          </template>

          <!-- 若改堆疊，這裡改為把三個類別依序往上疊；略 -->
        </g>

        <!-- 外框 -->
        <rect :x="pad.left" :y="pad.top" :width="innerW" :height="innerH"
              fill="none" stroke="rgba(255,255,255,0.12)" rx="8" />
      </svg>

      <!-- Tooltip -->
      <div v-if="tip.show" class="tooltip" :style="{ left: tip.x + 'px', top: (tip.y - 8) + 'px' }">
        {{ tip.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.card.bar-card{
  background: rgba(255,255,255,0.05);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 12px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.35);
  color: #fff;
}
.card-header{
  display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;
}
.chart-title{ font-weight:600;font-size:1rem;color:#f2cd5e; }
.legend{ display:flex; gap:10px; flex-wrap:wrap; }
.legend-item{ display:flex; align-items:center; gap:6px; font-size:.8rem; opacity:.9; }
.legend-item i{ display:inline-block; width:12px; height:12px; border-radius:3px; }

.svg-wrap{ position:relative; }
.chart-svg{ width:100%; height:280px; display:block; }
.loading{ padding:12px; opacity:.85; }

.tooltip{
  position:fixed; transform:translate(-50%,-100%);
  background:#111; border:1px solid rgba(255,255,255,.2);
  color:#fff; padding:6px 8px; border-radius:8px; font-size:.75rem;
  pointer-events:none; white-space:nowrap;
}
</style>
