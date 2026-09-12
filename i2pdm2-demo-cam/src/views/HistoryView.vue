<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import { API_BASE_URL } from '@/config';
import SpeciesSummaryCard from "../components/SpeciesSummaryCard.vue";
import SpeciesTrendCard from "../components/SpeciesTrendCard.vue";
import SpeciesBarChart from "../components/SpeciesBarChart.vue";
import SpeciesBarChartHorizontal from "../components/SpeciesBarChartHorizontal.vue";
import SpeciesTrendOverlayCard from "../components/SpeciesTrendOverlayCard.vue";
import SpeciesBarOverlayCard from "../components/SpeciesBarOverlayCard.vue";
import SpeciesBarSmallMultiplesCard from "../components/SpeciesBarSmallMultiplesCard.vue";

const userId = ref<string | null>(null);
const profile = ref<{ name?: string; location?: string; farm_name?: string }>({});
const isProfileLoading = ref(false);

type GrowthPoint = { date: string; count: number }; // ← 對齊後端
const selectedDays = ref<7 | 30>(7);
const isGrowthLoading = ref(false);
const growth = ref<GrowthPoint[]>([]);

async function fetchProfile(id: string) {
  isProfileLoading.value = true;
  try {
    const res = await axios.get(`${API_BASE_URL}/history/profile`, { params: { userid: id } });
    profile.value.name = res.data.name;
    profile.value.location = res.data.location;
    profile.value.farm_name = res.data.farm_name;
  } catch (e: any) {
    console.error("Failed to fetch profile:", e);
  } finally {
    isProfileLoading.value = false;
  }
}

const historyItems = ref<Array<{
  id: number;
  timestamp: string;
  type: string;
  summary: string;
}>>([]);

async function fetchHistoryItems(id: string, limit = 3) {
  try {
    const res = await axios.get(`${API_BASE_URL}/history/items`, {
      params: { userid: id, limit }
    });
    historyItems.value = res.data;
  } catch (e: any) {
    console.error("Failed to fetch history items:", e);
    historyItems.value = [];
  }
}

async function fetchGrowth(id: string, days: 7 | 30) {
  isGrowthLoading.value = true;
  try {
    const res = await axios.get(
      `${API_BASE_URL}/history/trend`,
      { params: { userid: id, days } }
    );
    // 後端已是 [{ date: "2025/07/30", count: 12 }, ...]
    growth.value = Array.isArray(res.data) ? res.data : [];
  } catch (e: any) {
    console.error("Failed to fetch growth:", e);
    growth.value = [];
  } finally {
    isGrowthLoading.value = false;
  }
}

// === 成長趨勢：SVG 繪圖用的計算 ===
const svgW = 300;
const svgH = 120;
const paddingBottom = 20;
const paddingTop = 10; 
const paddingLeft = 6;
const paddingRight = 6;
// const padH = svgH - paddingBottom;

const innerW = svgW - paddingLeft - paddingRight;
const innerH = svgH - paddingTop - paddingBottom;
const baselineY = svgH - paddingBottom;
const strokeW = 3; 
const yHeadroom = 1.08; 

const svgPoints = computed(() => {
  const n = growth.value.length;
  if (n === 0) return "";

  const maxData = Math.max(...growth.value.map(d => d.count), 1);
  const yMax = maxData * yHeadroom; // 給最高值留點空間

  return growth.value
    .map((d, i) => {
      const x = paddingLeft + (i / Math.max(n - 1, 1)) * innerW;
      const yRaw = paddingTop + (1 - d.count / yMax) * innerH;
      const y = Math.max(paddingTop + strokeW / 2, yRaw); // 至少留半個線寬
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
});

const svgAreaPath = computed(() => {
  const n = growth.value.length;
  if (n === 0) return "";
  const coords = svgPoints.value.split(" ");
  if (!coords.length) return "";
  const first = coords[0];
  const last = coords[coords.length - 1];
  // 折線 + 收到底邊 + 回到起點底邊
  return `M ${first} L ${coords.slice(1).join(" L ")} L ${last.split(",")[0]},${baselineY} L ${first.split(",")[0]},${baselineY} Z`;
});


function setDays(days: 7 | 30) {
  if (!userId.value) return;
  selectedDays.value = days;
  fetchGrowth(userId.value, days);
}

onMounted(() => {
  userId.value = new URLSearchParams(window.location.search).get("userid");
  if (userId.value) {
    fetchProfile(userId.value);
    fetchHistoryItems(userId.value, 3);
    fetchGrowth(userId.value, selectedDays.value);
  }
});

</script>

<!-- HistoryView.vue -->
<template>
  <div class="history-page">
    <div class="header">
      <h1 class="title">歷史紀錄</h1>
      <p class="subtitle">查看你的過去辨識結果與成長趨勢</p>
    </div>

    <!-- User summary / quick info -->
    <div class="card summary-card">
      <div class="row">
        <div class="metric">
          <div class="label">用戶</div>
          <div class="value">
            <span v-if="isProfileLoading">載入中…</span>
            <span v-else>{{ profile.name || "未知" }}</span>
          </div>
        </div>
        <div class="metric">
          <div class="label">地點</div>
          <div class="value">{{ profile.location || "未知" }}</div>
        </div>
        <div class="metric">
          <div class="label">農場名稱</div>
          <div class="value">{{ profile.farm_name || "未知" }}</div>
        </div>
      </div>
    </div>

    <div class="card chart-card">
      <div class="card-header">
        <div class="chart-title">
          害蟲總數量成長趨勢
        </div>
        <div class="time-filter">
          <button class="time-btn" :class="{ active: selectedDays === 7 }" @click="setDays(7)">7 天</button>
          <button class="time-btn" :class="{ active: selectedDays === 30 }" @click="setDays(30)">30 天</button>
        </div>
      </div>

      <!-- 載入中 -->
      <div class="chart-content" v-if="isGrowthLoading">
        <div class="chart-loading">載入中…</div>
      </div>

      <!-- 沒有資料 -->
      <div class="chart-content" v-else-if="growth.length === 0">
        <div class="chart-empty">暫無資料</div>
      </div>

      <!-- 折線圖 -->
      <div class="chart-content" v-else>
        <svg :viewBox="`0 0 ${svgW} ${svgH}`" class="growth-chart" aria-label="growth chart">
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f2cd5e" stop-opacity="0.7" />
              <stop offset="100%" stop-color="#1a1a1a" stop-opacity="0" />
            </linearGradient>
          </defs>

          <!-- 陰影區域 -->
          <path :d="svgAreaPath" fill="url(#grad)" stroke="none" />

          <!-- 折線 -->
          <polyline
            :points="svgPoints"
            fill="none"
            stroke="#f2cd5e"
            stroke-width="3"
            stroke-linecap="round"
          />

          <!-- 端點 -->
          <!-- <template v-if="growth.length">
            <circle
              :cx="0"
              :cy="svgH - 20 - (growth[0].count / Math.max(...growth.map(d=>d.count),1)) * (svgH - 20)"
              r="3"
              fill="#f2cd5e"
            />
            <circle
              :cx="svgW"
              :cy="svgH - 20 - (growth[growth.length-1].count / Math.max(...growth.map(d=>d.count),1)) * (svgH - 20)"
              r="4"
              fill="#f2cd5e"
            />
          </template> -->
        </svg>
      </div>
    </div>

    <SpeciesSummaryCard
      v-if="userId"
      :userid="userId as string"
      :days="selectedDays"       
    />

    
    <SpeciesTrendOverlayCard
        v-if="userId"
        :userid="userId as string"
        :days="selectedDays"
      />

    <SpeciesTrendCard
      v-if="userId"
      :userid="userId as string"
      :days="selectedDays"
    />

    <SpeciesBarOverlayCard
      v-if="userId"
      :userid="userId as string"
      :days="selectedDays"
      :aspect="1.0"
      :font-size="20"
      :stacked="true"
    />

    <SpeciesBarSmallMultiplesCard
      v-if="userId"
      :userid="userId as string"
      :days="selectedDays"
      :aspect="1.0"
      :font-size="20"
    />
    
    <!-- History list -->
    <div class="card history-list-card">
      <div class="section-title">辨識紀錄</div>
      <div v-for="item in historyItems" :key="item.id" class="history-item">
        <div class="left">
          <div class="time">{{ item.timestamp }}</div>
          <div class="type-badge">{{ item.type }}</div>
        </div>
        <div class="right">
          <div class="summary">{{ item.summary }}</div>
        </div>
      </div>

      <div v-if="historyItems.length === 0" class="empty-state">
        尚無辨識紀錄
      </div>
    </div>
  </div>
</template>



<style scoped>
/* 你的主題延伸 */
.history-page {
  padding: 1rem;
  background: linear-gradient(45deg, #000, #1a1a1a);
  min-height: 100vh;
  color: #fff;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
}

/* Header */
.header {
  margin-bottom: 0.75rem;
}
.title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
  color: #f2cd5e;
}
.subtitle {
  font-size: 0.85rem;
  margin: 4px 0 8px;
  opacity: 0.85;
}

/* Card base */
.card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 12px;
  backdrop-filter: blur(6px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
  position: relative;
}

/* Summary metrics */
.summary-card .row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.metric {
  flex: 1 1 30%;
  min-width: 100px;
}
.metric .label {
  font-size: 0.55rem;
  text-transform: uppercase;
  opacity: 0.7;
  color: #ffffff;
}
.metric .value {
  font-size: 1rem;
  font-weight: 600;
  margin-top: 2px;
  color: #f2cd5e;
}

/* Chart card */
.chart-card .card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.chart-title {
  font-weight: 600;
  font-size: 1rem;
  color: #f2cd5e;
}
.time-filter {
  display: flex;
  gap: 6px;
}
.time-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.55rem;
  cursor: pointer;
  color: #fff;
  transition: background .2s;
}
.time-btn.active {
  background: #f2cd5e;
  color: #000;
}
.growth-chart {
  width: 100%;
  height: 120px;
  display: block;
}

/* History list */
.history-list-card .section-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #f2cd5e;
}
.history-item {
  display: flex;
  gap: 10px;
  padding: 10px 6px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.left {
  flex: 0 0 75px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.time {
  font-size: 0.6rem;
  opacity: 0.9;
  color: #ffffff;
}
.type-badge {
  background: rgba(242, 205, 94, 0.15);
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.55rem;
  color: #f2cd5e;
  display: inline-block;
  margin-top: 4px;
}
.right {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.summary {
  font-size: 0.75rem;
  margin-bottom: 6px;
  color: #ffffff;
}
/* .actions {
  display: flex;
  gap: 6px;
} */
/* .small-btn {
  flex: 1;
  background: #1f1f1f;
  border: 1px solid #333;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.55rem;
  cursor: pointer;
  color: #f2cd5e;
  transition: background .2s;
} */
/* .small-btn.secondary {
  background: transparent;
  border: 1px solid rgba(242, 205, 94, 0.6);
} */
.small-btn:hover {
  background: rgba(242, 205, 94, 0.1);
}

/* Empty */
.empty-state {
  padding: 12px;
  text-align: center;
  opacity: 0.7;
  font-size: 0.9rem;
  color: #ffffff;
}
</style>
