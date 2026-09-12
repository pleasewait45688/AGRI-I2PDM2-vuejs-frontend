<!-- src/components/SpeciesTrendOverlayCard.vue -->
<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from "vue";
import axios from "axios";
import { API_BASE_URL } from "@/config";

type Row = { date: string; values: Record<string, number> };

const props = defineProps<{
  userid: string;
  days: number;          // 7 或 30
  /** 可選：想微調字體 or 比例可以改這兩個 props */
  fontSize?: number;     // 軸字體大小（預設 20）
  aspect?: number;       // 實際像素高度 = 容器寬度 * aspect（預設 1.0 = 接近 1:1）
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

// 色系
const COLORS: Record<string, string> = {
  薊馬: "#D55E00",
  蕈蠅: "#0072B2",
  粉蝨: "#f2cd5e",
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
    console.error("SpeciesTrendOverlay load error:", e);
    errorMsg.value = "資料載入失敗";
    rows.value = [];
  } finally {
    loading.value = false;
  }
}
watch(() => [props.userid, props.days], load, { immediate: true });

/** ====== 容器量測 ====== */
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

/** ====== 視覺比例與字體大小 ====== */
const FONT = computed(() => props.fontSize ?? 20);
const ASPECT = computed(() => props.aspect ?? 1.0); // 高度 = 寬度 * 1.0（近 1:1）

// 實際像素高度（限制上下界避免過矮或過高）
const pixelH = computed(() => {
  const raw = Math.round(width.value * ASPECT.value);
  return Math.max(300, Math.min(700, raw));
});

/** ====== viewBox 幾何（固定，與字體無關） ====== */
const svgW = 900;
const svgH = 900; // 讓 viewBox 本身也接近方形
const pad = computed(() => ({
  top:  24,
  right: 20,
  bottom: 56,  // 給 x 軸 20px 字體 + 餘裕
  left:  70,   // 給 y 軸 20px 字體 + 餘裕
}));
const innerW = computed(() => svgW - pad.value.left - pad.value.right);
const innerH = computed(() => svgH - pad.value.top - pad.value.bottom);
const n = computed(() => rows.value.length);

/** ====== yMax 取整（1/2/5）＋頂部保留 ====== */
function niceMax(v: number) {
  const m = Math.max(1, v);
  const pow10 = Math.pow(10, Math.floor(Math.log10(m)));
  const cands = [1, 2, 5, 10].map(c => c * pow10);
  for (let i = 0; i < cands.length; i++) {
    if (cands[i] >= m * 1.08) return cands[i];
  }
  return cands[cands.length - 1];
}
const yMax = computed(() => {
  const all: number[] = [];
  for (const r of rows.value) for (const s of CLASSES) all.push(r.values?.[s.key] ?? 0);
  return niceMax(Math.max(...all, 1));
});

/** ====== 映射 ====== */
function xi(i: number) {
  if (n.value <= 1) return pad.value.left + innerW.value / 2;
  return pad.value.left + (i / (n.value - 1)) * innerW.value;
}
function yv(v: number) {
  const h = (v / yMax.value) * innerH.value;
  return pad.value.top + (innerH.value - h);
}

/** ====== 折線 path ====== */
function buildPath(key: string) {
  if (!n.value) return "";
  const vals = rows.value.map(r => r.values?.[key] ?? 0);
  const pts = vals.map((v, i) => `${xi(i).toFixed(2)},${yv(v).toFixed(2)}`);
  return `M ${pts[0]} L ${pts.slice(1).join(" L ")}`;
}

/** ====== 刻度與標籤 ====== */
// 手機/桌機都用較少刻度，放大字型
const ySteps = 3;
const yTicks = computed(() => {
  const out: { y: number; label: string }[] = [];
  for (let i = 0; i <= ySteps; i++) {
    const val = (yMax.value / ySteps) * i;
    const y = yv(val);
    out.push({ y, label: Math.round(val).toString() });
  }
  return out;
});

// x 日期抽樣（避免太擠）
const xLabels = computed(() => {
  const items = rows.value.map((r, i) => ({ i, label: r.date.slice(5) }));
  if (n.value <= 12) return items;
  const step = n.value > 24 ? 3 : 2;
  return items.filter(d => d.i % step === 0);
});

/** ====== Tooltip / 數值標籤 ====== */
const tip = ref<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: "" });
const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function onPointEnter(e: MouseEvent, date: string, cls: string, v: number) {
  const el = e.currentTarget as SVGCircleElement;
  const bb = el.getBoundingClientRect();
  tip.value = { show: true, x: bb.left + bb.width / 2, y: bb.top, text: `${date}｜${cls}：${nf0.format(v)} 隻/㎡` };
}
function onPointLeave() { tip.value = { show: false, x: 0, y: 0, text: "" }; }

const dotR = 4;
// 永遠不顯示數值標籤
const showValueLabels = computed(() => false);
</script>

<template>
  <div class="card overlay-card" ref="container">
    <div class="card-header">
      <div class="chart-title">害蟲密度趨勢（隻/㎡，近 {{ days }} 天）</div>
      <div class="legend">
        <span v-for="s in CLASSES" :key="s.key" class="legend-item">
          <i :style="{ background: COLORS[s.key] }"></i>{{ s.label }}
        </span>
      </div>
    </div>

    <div v-if="loading" class="loading">載入中…</div>
    <div v-else-if="errorMsg" class="loading">{{ errorMsg }}</div>
    <div v-else-if="!rows.length" class="loading">目前沒有資料</div>

    <div v-else class="svg-wrap">
      <svg
        :viewBox="`0 0 ${svgW} ${svgH}`"
        class="chart-svg"
        :style="{ height: pixelH + 'px' }"
        aria-label="overlay trend chart 1:1 large font"
      >
        <!-- 背景 -->
        <rect :x="pad.left" :y="pad.top" :width="innerW" :height="innerH"
              fill="rgba(255,255,255,0.03)" rx="12" />

        <!-- y 軸刻度 -->
        <g>
          <line
            v-for="t in yTicks" :key="'yline-'+t.y"
            :x1="pad.left" :x2="pad.left + innerW"
            :y1="t.y" :y2="t.y"
            stroke="rgba(255,255,255,0.10)" stroke-width="1" />
          <text
            v-for="t in yTicks" :key="'ylabel-'+t.label"
            :x="pad.left - 10" :y="t.y"
            text-anchor="end" dominant-baseline="middle"
            fill="#ffffff" opacity="0.95" :font-size="FONT"
          >{{ t.label }}</text>
        </g>

        <!-- x 軸日期 -->
        <g>
          <text
            v-for="d in xLabels" :key="'xlab-'+d.i"
            :x="xi(d.i)" :y="pad.top + innerH + 26"
            text-anchor="middle"
            fill="#ffffff" opacity="0.95" :font-size="FONT"
          >{{ d.label }}</text>
        </g>

        <!-- 三條折線 + 節點 -->
        <g v-for="s in CLASSES" :key="'path-'+s.key">
          <path
            :d="buildPath(s.key)"
            fill="none"
            :stroke="COLORS[s.key]"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="0.98"
          />
          <circle
            v-for="(r,i) in rows" :key="'pt-'+s.key+'-'+i"
            :cx="xi(i)" :cy="yv(r.values?.[s.key] ?? 0)"
            :r="dotR"
            :fill="COLORS[s.key]"
            opacity="0.98"
            @mouseenter="onPointEnter($event, r.date, s.label, r.values?.[s.key] ?? 0)"
            @mouseleave="onPointLeave"
          />
        </g>

        <!-- 外框 -->
        <rect :x="pad.left" :y="pad.top" :width="innerW" :height="innerH"
              fill="none" stroke="rgba(255,255,255,0.16)" rx="12" />
      </svg>

      <!-- Tooltip -->
      <div v-if="tip.show" class="tooltip" :style="{ left: tip.x + 'px', top: (tip.y - 8) + 'px' }">
        {{ tip.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.card.overlay-card{
  background: rgba(255,255,255,0.05);
  border-radius: 14px;
  padding: 10px 12px;
  margin-bottom: 12px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.35);
  color: #fff;
}

/* 允許 legend 在小螢幕換行 —— 只改這裡 */
.card-header{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:10px;
  margin-bottom:6px;
  flex-wrap: wrap;                /* 允許換行 */
}
.chart-title{
  font-weight:600;
  font-size: 1rem;
  /* line-height:1.2; */
  color:#f2cd5e;
}

.legend{
  display:flex;
  flex-wrap: wrap;                /* legend 自己也能換行 */
  gap:14px 16px;
}
.legend-item{ display:flex; align-items:center; gap:8px; font-size: 0.95rem; opacity:.95; }
.legend-item i{ display:inline-block; width:14px; height:14px; border-radius:3px; }

/* 手機：標題在上、legend 另起一行鋪滿寬度 */
@media (max-width: 560px){
  .card-header{ flex-direction: column; align-items:flex-start; }
  .legend{ width:100%; margin-top:6px; }
}

.svg-wrap{ position:relative; }
.chart-svg{ width:100%; display:block; } /* 高度由 pixelH 控制 */
.loading{ padding:12px; opacity:.9; }

.tooltip{
  position:fixed; transform:translate(-50%,-100%);
  background:#111; border:1px solid rgba(255,255,255,.25);
  color:#fff; padding:6px 10px; border-radius:10px; font-size:0.95rem;
  pointer-events:none; white-space:nowrap;
}
</style>
