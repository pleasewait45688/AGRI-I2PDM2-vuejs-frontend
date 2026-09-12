<!-- usage -->
<!-- <SpeciesBarChartHorizontal
      v-if="userId"
      :userid="userId as string"
      :days="selectedDays"
      :maxHeight="420"  
    /> -->
<!-- src/components/SpeciesBarChartHorizontal.vue -->
<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from "vue";
import axios from "axios";
import { API_BASE_URL } from "@/config";

type Row = { date: string; values: Record<string, number> };

const props = defineProps<{
  userid: string;
  days: number;           // 7 或 30
  stacked?: boolean;      // 是否堆疊顯示（預設 false：同列分組）
  maxHeight?: number;     // 卡片中圖表最大高度（px），預設 360
}>();

const loading = ref(false);
const rows = ref<Row[]>([]);
const errorMsg = ref<string | null>(null);

// 類別定義（鍵名要和 API 對齊）
const CLASSES = [
  { key: "薊馬", label: "薊馬"  },
  { key: "蕈蠅", label: "蕈蠅"  },
  { key: "粉蝨", label: "粉蝨"  },
];

// 顏色：維持金色系
const COLORS: Record<string, string> = {
  薊馬: "#f2cd5e",
  蕈蠅: "#d8b84f",
  粉蝨: "#bfa142",
};

async function load() {
  if (!props.userid) return;
  loading.value = true;
  errorMsg.value = null;
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
    rows.value = Array.isArray(data) ? (data as Row[]) : [];
  } catch (e) {
    console.error("SpeciesBarChartHorizontal load error:", e);
    errorMsg.value = "資料載入失敗";
    rows.value = [];
  } finally {
    loading.value = false;
  }
}
watch(() => [props.userid, props.days], load, { immediate: true });

/** ====== 自適應寬度 ====== */
const container = ref<HTMLDivElement | null>(null);
const width = ref(900);
let ro: ResizeObserver | null = null;

onMounted(() => {
  if (container.value) {
    ro = new ResizeObserver(entries => {
      for (const e of entries) width.value = Math.floor(e.contentRect.width);
    });
    ro.observe(container.value);
    width.value = container.value.clientWidth || 900;
  }
});
onBeforeUnmount(() => { ro?.disconnect(); });

const isNarrow = computed(() => width.value < 520);
const font10 = computed(() => (isNarrow.value ? 12 : 10));
const titleSize = computed(() => (isNarrow.value ? "0.95rem" : "1rem"));

/** ====== 橫向柱繪圖參數 ====== */
const svgW = 900; // viewBox 寬
const pad = { top: 20, right: 16, bottom: 20, left: 64 }; // 左邊多留字較不會截
const innerW = svgW - pad.left - pad.right;

const rowGap = 6;            // 列與列間距
const barGapH = 4;           // 同列類別間距
const barThick = 12;         // 單一小條厚度

const perRowHeight = computed(() =>
  CLASSES.length * barThick + (CLASSES.length - 1) * barGapH
);
const svgH = computed(() => {
  const n = rows.value.length;
  const total = n ? (n * perRowHeight.value + (n - 1) * rowGap) : 0;
  // 底下加上 padding
  return Math.max(180, pad.top + total + pad.bottom);
});
const innerH = computed(() => svgH.value - pad.top - pad.bottom);

// x 軸上限（用 1/2/5 取整）
const xMax = computed(() => {
  const vals: number[] = [];
  for (const r of rows.value) for (const s of CLASSES) vals.push(r.values?.[s.key] ?? 0);
  const m = Math.max(1, ...vals);
  const pow10 = Math.pow(10, Math.floor(Math.log10(m)));
  const candidates = [1, 2, 5, 10].map(c => c * pow10);
  return candidates.find(c => c >= m * 1.02) ?? candidates[candidates.length - 1];
});

// 數值→寬度
function valueToWidth(v: number) {
  const w = (v / xMax.value) * innerW;
  return Math.max(0, Math.min(innerW, w));
}

// 第 i 天這一列的頂端 y
function rowY(i: number) {
  return pad.top + i * (perRowHeight.value + rowGap);
}

// 同列第 j 類別的 y
function barYInRow(i: number, j: number) {
  return rowY(i) + j * (barThick + barGapH);
}

/** ====== 軸線與標籤 ====== */
const xTicks = computed(() => {
  const t = [0, 0.25, 0.5, 0.75, 1];
  return t.map(frac => ({
    x: pad.left + frac * innerW,
    label: Math.round(xMax.value * frac).toString(),
  }));
});

/** ====== Tooltip ====== */
const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const tip = ref<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: "" });
function onEnter(e: MouseEvent, date: string, cls: string, v: number) {
  const target = e.currentTarget as SVGRectElement;
  const bb = target.getBoundingClientRect();
  tip.value = {
    show: true,
    x: bb.left + bb.width,
    y: bb.top,
    text: `${date}｜${cls}：${nf0.format(v)} 隻/㎡`,
  };
}
function onLeave() { tip.value.show = false; }

/** ====== 堆疊模式的寬度與 x 起點 ====== */
const stacked = computed(() => !!props.stacked);
function stackedSegments(r: Row) {
  const segs: { key: string; v: number; w: number; x: number }[] = [];
  let accW = 0;
  for (const s of CLASSES) {
    const v = r.values?.[s.key] ?? 0;
    const w = valueToWidth(v);
    segs.push({ key: s.key, v, w, x: pad.left + accW });
    accW += w;
  }
  return segs;
}
</script>

<template>
  <div class="card bar-card horizontal" ref="container">
    <div class="card-header">
      <div class="chart-title" :style="{ fontSize: titleSize }">
        個別害蟲密度（隻/㎡）橫向柱（近 {{ days }} 天）
      </div>
      <div class="legend">
        <span v-for="s in CLASSES" :key="s.key" class="legend-item">
          <i :style="{ background: COLORS[s.key] }"></i>{{ s.label }}
        </span>
      </div>
    </div>

    <div v-if="loading" class="loading">載入中…</div>
    <div v-else-if="errorMsg" class="loading">{{ errorMsg }}</div>
    <div v-else-if="!rows.length" class="loading">目前沒有資料</div>

    <div v-else class="svg-wrap" :style="{ maxHeight: (props.maxHeight ?? 360) + 'px' }">
      <svg :viewBox="`0 0 ${svgW} ${svgH}`" class="chart-svg" aria-label="horizontal bar chart">
        <!-- 背景 -->
        <rect :x="pad.left" :y="pad.top" :width="innerW" :height="innerH"
              fill="rgba(255,255,255,0.03)" rx="8" />

        <!-- x 軸刻度與網格 -->
        <g>
          <line
            v-for="t in xTicks" :key="'xgrid-'+t.x"
            :x1="t.x" :x2="t.x"
            :y1="pad.top" :y2="pad.top + innerH"
            stroke="rgba(255,255,255,0.06)" stroke-width="1" />
          <text
            v-for="t in xTicks" :key="'xlabel-'+t.label"
            :x="t.x" :y="pad.top - 6"
            text-anchor="middle" fill="#ffffff" opacity="0.7" :font-size="font10">{{ t.label }}</text>
        </g>

        <!-- y 軸日期 -->
        <g>
          <text
            v-for="(r,i) in rows" :key="'date-'+r.date"
            :x="pad.left - 8"
            :y="rowY(i) + perRowHeight/2"
            text-anchor="end" dominant-baseline="middle"
            fill="#ffffff" opacity="0.8" :font-size="font10">{{ r.date.slice(5) }}</text>
        </g>

        <!-- 橫向分組或堆疊 -->
        <g v-for="(r,i) in rows" :key="r.date">
          <template v-if="!stacked">
            <rect
              v-for="(s, j) in CLASSES" :key="s.key"
              :x="pad.left"
              :y="barYInRow(i, j)"
              :width="valueToWidth(r.values?.[s.key] ?? 0)"
              :height="barThick"
              :fill="COLORS[s.key]" opacity="0.9" rx="2"
              @mouseenter="onEnter($event, r.date, s.label, r.values?.[s.key] ?? 0)"
              @mouseleave="onLeave" />
          </template>
          <template v-else>
            <rect
              v-for="seg in stackedSegments(r)" :key="seg.key"
              :x="seg.x" :y="rowY(i)"
              :width="seg.w" :height="perRowHeight"
              :fill="COLORS[seg.key]" opacity="0.92" rx="2"
              @mouseenter="onEnter($event, r.date, seg.key, seg.v)"
              @mouseleave="onLeave" />
          </template>
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
.card.bar-card.horizontal{
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
.chart-title{ font-weight:600; color:#f2cd5e; }
.legend{ display:flex; gap:10px; flex-wrap:wrap; }
.legend-item{ display:flex; align-items:center; gap:6px; font-size:.85rem; opacity:.92; }
.legend-item i{ display:inline-block; width:12px; height:12px; border-radius:3px; }

.svg-wrap{ position:relative; overflow:auto; } /* 讓高度多時可以捲動 */
.chart-svg{ width:100%; height:auto; display:block; }
.loading{ padding:12px; opacity:.9; }

.tooltip{
  position:fixed; transform:translate(-4px,-100%);
  background:#111; border:1px solid rgba(255,255,255,.2);
  color:#fff; padding:6px 8px; border-radius:8px; font-size:.8rem;
  pointer-events:none; white-space:nowrap;
}
</style>
