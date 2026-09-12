<script setup lang="ts">
import { ref, watch } from "vue";
import axios from "axios";
import { API_BASE_URL } from "@/config";

const props = defineProps<{
  userid: string;
  days: number;                 // 7 或 30
  metric?: "count" | "density"; // 不再使用，為相容先保留
  agg?: "sum" | "mean" | "median" | "max" | "p95"; // 不再使用，為相容先保留
}>();

const loading = ref(false);
const totals = ref<Record<string, number>>({ 薊馬: 0, 蕈蠅: 0, 粉蝨: 0 });
const CLASSES = ["薊馬", "蕈蠅", "粉蝨"];

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
          classes: CLASSES.join(","),
        },
      }
    );

    // 分母＝「有上傳的天數」（任一類別 > 0 視為有上傳）
    const sums: Record<string, number> = { 薊馬: 0, 蕈蠅: 0, 粉蝨: 0 };
    let usedDays = 0;

    if (Array.isArray(data)) {
      for (const row of data) {
        const v: Record<string, number> = row?.values ?? {};
        const anyUsed = Object.values(v).some(val => (val ?? 0) > 0);
        if (anyUsed) usedDays += 1;

        for (const k of CLASSES) {
          sums[k] += v[k] ?? 0;
        }
      }
    }

    const avg: Record<string, number> = { 薊馬: 0, 蕈蠅: 0, 粉蝨: 0 };
    for (const k of CLASSES) {
      avg[k] = usedDays ? sums[k] / usedDays : 0;
    }
    totals.value = avg;
  } catch (e) {
    console.error("SpeciesSummary load error:", e);
    totals.value = { 薊馬: 0, 蕈蠅: 0, 粉蝨: 0 };
  } finally {
    loading.value = false;
  }
}

// 只依 userid/days 變動重新載入
watch(() => [props.userid, props.days], load, { immediate: true });
</script>

<template>
  <div class="card">
    <div class="card-header">
      <div class="chart-title">個別害蟲平均密度（隻/㎡，近 {{ days }} 天）</div>
    </div>

    <div v-if="loading" class="species-loading">載入中…</div>

    <div v-else class="species-row">
      <div class="metric" v-for="k in ['薊馬','蕈蠅','粉蝨']" :key="k">
        <div class="label">{{ k }}</div>
        <div class="value">{{ Math.round(totals[k]) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 複製 HistoryView 的卡片視覺，維持一致 */
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
.chart-title {
  font-weight: 600;
  font-size: 1rem;
  color: #f2cd5e;
}

/* 指標區 */
.species-row { display: flex; gap: 8px; flex-wrap: wrap; }
.metric { flex: 1 1 30%; min-width: 100px; }
.metric .label { font-size: 0.55rem; opacity: 0.7; color: #ffffff; }
.metric .value { font-size: 1.1rem; font-weight: 700; margin-top: 2px; color: #f2cd5e; }

.species-loading { padding: 12px; opacity: 0.85; color: #fff; }
</style>