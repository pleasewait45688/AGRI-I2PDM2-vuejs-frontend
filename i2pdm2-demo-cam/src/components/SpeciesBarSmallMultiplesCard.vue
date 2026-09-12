<!-- src/components/SpeciesBarSmallMultiplesCard.vue -->
<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from "vue";
import axios from "axios";
import { API_BASE_URL } from "@/config";

type Row = { date: string; values: Record<string, number> };

const props = defineProps<{
  userid: string;
  days: number;          // 7 或 30
  fontSize?: number;     // 軸字體大小（預設 20）
  aspect?: number;       // 高度 = 單格寬度 * aspect（預設 1.0，近 1:1）
}>();

const loading = ref(false);
const rows = ref<Row[]>([]);
const errorMsg = ref<string | null>(null);

// 三個物種（鍵名需和 API 對齊）
const CLASSES = [
  { key: "薊馬", label: "薊馬" },
  { key: "蕈蠅", label: "蕈蠅" },
  { key: "粉蝨", label: "粉蝨" },
];

// 色系（沿用你目前的設定）
const COLORS: Record<string, string> = {
  薊馬: "#D55E00", // vermilion
  蕈蠅: "#0072B2", // blue
  粉蝨: "#f2cd5e", // gold
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
          metric: "density",
          agg: "mean",
          classes: CLASSES.map(s => s.key).join(","),
          _t: Date.now(),
        },
      }
    );
    rows.value = Array.isArray(data) ? (data as Row[]) : [];
  } catch (e) {
    console.error("SpeciesBarSmallMultiples load error:", e);
    errorMsg.value = "資料載入失敗";
    rows.value = [];
  } finally {
    loading.value = false;
  }
}
watch(() => [props.userid, props.days], load, { immediate: true });

/** ====== 容器量測（用欄數估算每格寬度） ====== */
const container = ref<HTMLDivElement | null>(null);
const width = ref(900);
let ro: ResizeObserver | null = null;

onMounted(() => {
  if (!container.value) return;
  ro = new ResizeObserver(es => {
    for (const e of es) width.value = Math.floor(e.contentRect.width);
  });
  ro.observe(container.value);
  width.value = container.value.clientWidth || 900;
});
onBeforeUnmount(() => ro?.disconnect());

const FONT = computed(() => props.fontSize ?? 20);
const ASPECT = computed(() => props.aspect ?? 1.0);

// 跟 CSS 欄數對齊：≥1024 三欄、≥680 兩欄、其餘一欄
const gridGap = 12;
const cols = computed(() => (width.value >= 1024 ? 3 : width.value >= 680 ? 2 : 1));
const miniWidth = computed(() => {
  const totalGap = gridGap * (cols.value - 1);
  const w = (width.value - totalGap) / cols.value;
  return Math.max(240, w);
});
const miniPixelH = computed(() => {
  const raw = Math.round(miniWidth.value * ASPECT.value);
  return Math.max(240, Math.min(600, raw));
});

/** ====== 每張小圖的 viewBox 幾何（與折線圖一致） ====== */
const svgW = 900;
const svgH = 900; // 方形 viewBox，字體用 px 控制
const pad = computed(() => ({
  top:  24,
  right: 20,
  bottom: 56, // 給 x 軸 20px 字體
  left:  70,  // 給 y 軸 20px 字體
}));
const innerW = computed(() => svgW - pad.value.left - pad.value.right);
const innerH = computed(() => svgH - pad.value.top - pad.value.bottom);
const n = computed(() => rows.value.length);

/** ====== 幾何與尺度 ====== */
function niceMax(v: number) {
  const m = Math.max(1, v);
  const pow10 = Math.pow(10, Math.floor(Math.log10(m)));
  const cands = [1, 2, 5, 10].map(c => c * pow10);
  for (let i = 0; i < cands.length; i++) {
    if (cands[i] >= m * 1.08) return cands[i];
  }
  return cands[cands.length - 1];
}

// 每個物種各自的 y 上限（看起來更清楚）
const yMaxMap = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {};
  for (const s of CLASSES) {
    const vals = rows.value.map(r => r.values?.[s.key] ?? 0);
    out[s.key] = niceMax(Math.max(...vals, 1));
  }
  return out;
});

// x 幾何
const groupGap = 8;
const groupWidth = computed(() => {
  if (!n.value) return 0;
  return (innerW.value - groupGap * Math.max(0, n.value - 1)) / n.value;
});
// 單一物種：柱寬取群組 60%，置中
const barWidth = computed(() => Math.max(6, groupWidth.value * 0.6));
function groupX(i: number) {
  return pad.value.left + i * (groupWidth.value + groupGap);
}
function barX(i: number) {
  return groupX(i) + (groupWidth.value - barWidth.value) / 2;
}

// y 對應
function valueToHeight(v: number, yMax: number) {
  const h = (v / yMax) * innerH.value;
  return Math.max(0, Math.min(innerH.value, h));
}
function barY(v: number, yMax: number) {
  const h = valueToHeight(v, yMax);
  return pad.value.top + (innerH.value - h);
}

/** ====== 刻度與標籤（每張小圖共用 x，y 依物種） ====== */
const ySteps = 3;
function yTicksFor(yMax: number) {
  const out: { y: number; label: string }[] = [];
  for (let i = 0; i <= ySteps; i++) {
    const val = (yMax / ySteps) * i;
    const y = pad.value.top + innerH.value - (val / yMax) * innerH.value;
    out.push({ y, label: Math.round(val).toString() });
  }
  return out;
}

// x 日期抽樣
const xLabels = computed(() => {
  const items = rows.value.map((r, i) => ({ i, label: r.date.slice(5) }));
  if (n.value <= 12) return items;
  const step = n.value > 24 ? 3 : 2;
  return items.filter(d => d.i % step === 0);
});
function xiCenter(i: number) {
  return groupX(i) + groupWidth.value / 2;
}

/** ====== Tooltip ====== */
const tip = ref<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: "" });
const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
function onEnter(e: MouseEvent, date: string, cls: string, v: number) {
  const target = e.currentTarget as SVGRectElement;
  const bb = target.getBoundingClientRect();
  tip.value = {
    show: true,
    x: bb.left + bb.width / 2,
    y: bb.top,
    text: `${date}｜${cls}：${nf0.format(v)} 隻/㎡`,
  };
}
function onLeave() { tip.value.show = false; }
</script>

<template>
  <div class="card multiples-card" ref="container">
    <div class="card-header">
      <div class="chart-title">各物種單獨柱狀（隻/㎡，近 {{ days }} 天）</div>
    </div>

    <div v-if="loading" class="loading">載入中…</div>
    <div v-else-if="errorMsg" class="loading">{{ errorMsg }}</div>
    <div v-else-if="!rows.length" class="loading">目前沒有資料</div>

    <div v-else class="mini-grid">
      <div v-for="s in CLASSES" :key="s.key" class="mini">
        <div class="mini-head">
          <span class="dot" :style="{ background: COLORS[s.key] }"></span>
          <span class="mini-title">{{ s.label }}</span>
        </div>

        <svg
          :viewBox="`0 0 ${svgW} ${svgH}`"
          class="mini-svg"
          :style="{ height: miniPixelH + 'px' }"
          aria-label="single species bar chart"
        >
          <!-- 背景 -->
          <rect :x="pad.left" :y="pad.top" :width="innerW" :height="innerH"
                fill="rgba(255,255,255,0.03)" rx="12" />

          <!-- y 軸刻度 -->
          <g>
            <line
              v-for="t in yTicksFor(yMaxMap[s.key])" :key="'yline-'+s.key+'-'+t.y"
              :x1="pad.left" :x2="pad.left + innerW"
              :y1="t.y" :y2="t.y"
              stroke="rgba(255,255,255,0.10)" stroke-width="1" />
            <text
              v-for="t in yTicksFor(yMaxMap[s.key])" :key="'ylabel-'+s.key+'-'+t.label"
              :x="pad.left - 10" :y="t.y"
              text-anchor="end" dominant-baseline="middle"
              fill="#ffffff" opacity="0.95" :font-size="FONT"
            >{{ t.label }}</text>
          </g>

          <!-- x 軸日期 -->
          <g>
            <text
              v-for="d in xLabels" :key="'xlab-'+s.key+'-'+d.i"
              :x="xiCenter(d.i)" :y="pad.top + innerH + 26"
              text-anchor="middle"
              fill="#ffffff" opacity="0.95" :font-size="FONT"
            >{{ d.label }}</text>
          </g>

          <!-- 單物種柱 -->
          <g v-for="(r,i) in rows" :key="r.date">
            <rect
              :x="barX(i)"
              :y="barY(r.values?.[s.key] ?? 0, yMaxMap[s.key])"
              :width="barWidth"
              :height="valueToHeight(r.values?.[s.key] ?? 0, yMaxMap[s.key])"
              :fill="COLORS[s.key]" opacity="0.95" rx="4"
              @mouseenter="onEnter($event, r.date, s.label, r.values?.[s.key] ?? 0)"
              @mouseleave="onLeave"
            />
          </g>

          <!-- 外框 -->
          <rect :x="pad.left" :y="pad.top" :width="innerW" :height="innerH"
                fill="none" stroke="rgba(255,255,255,0.16)" rx="12" />
        </svg>
      </div>
    </div>

    <!-- Tooltip（共用一個） -->
    <div v-if="tip.show" class="tooltip" :style="{ left: tip.x + 'px', top: (tip.y - 8) + 'px' }">
      {{ tip.text }}
    </div>
  </div>
</template>

<style scoped>
.card.multiples-card{
  background: rgba(255,255,255,0.05);
  border-radius: 14px;
  padding: 10px 12px;
  margin-bottom: 12px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.35);
  color: #fff;
}
.card-header{
  display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:6px;
}
.chart-title{ font-weight:600; font-size: 1rem; color:#f2cd5e; }

/* 三欄格：桌機三欄、平板兩欄、手機一欄 */
.mini-grid{
  display:grid; gap: 12px;
  grid-template-columns: repeat(3, minmax(0,1fr));
}
@media (max-width: 1024px){
  .mini-grid{ grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (max-width: 680px){
  .mini-grid{ grid-template-columns: 1fr; }
}

.mini{ background: rgba(255,255,255,0.04); border-radius: 12px; padding: 8px 10px 6px; }
.mini-head{ display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.mini-title{ font-size: 0.95rem; font-weight: 700; color:#fff; opacity: .95; }
.dot{ width:12px; height:12px; border-radius: 3px; display:inline-block; }

.mini-svg{ width:100%; display:block; }
.loading{ padding:12px; opacity:.9; }

/* Tooltip */
.tooltip{
  position:fixed; transform:translate(-50%,-100%);
  background:#111; border:1px solid rgba(255,255,255,.25);
  color:#fff; padding:6px 10px; border-radius:10px; font-size:0.95rem;
  pointer-events:none; white-space:nowrap;
}
</style>
