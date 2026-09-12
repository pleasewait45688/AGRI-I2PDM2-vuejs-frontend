<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router'
import axios from 'axios'
import { API_BASE_URL } from '@/config'

const route  = useRoute()
const userId = ref<string | null>(null)

onMounted(() => {
  userId.value = new URLSearchParams(window.location.search)
                    .get('userid') as string
})


const labels = ['姓名:', '電話:', '地點:', '農場名稱:', '服務單位:'];

const placeholders = [
  '請輸入姓名',
  '請輸入電話 ( ex: 0912345678 )',
  '請輸入地點 ( ex: 台中 )',
  '請輸入農場名稱 ( ex: 蘭花園 )',
  '請輸入服務單位 ( ex: 台中農改場 )',
];

const inputs = ref<string[]>(Array(labels.length).fill(''));
const errors = ref<string[]>(Array(labels.length).fill(''));
const phoneRegex = /^09\d{8}$/;

const handleSubmit = async () => {
  let isValid = true;
  inputs.value.forEach((val, idx) => {
    const trimmed = val.trim();

    if (!trimmed) {
      errors.value[idx] = '※此欄位為必填';
      isValid = false;
    } else if (idx === 1 && !phoneRegex.test(trimmed)) {
      errors.value[idx] = '※電話格式錯誤，需為 09 開頭共 10 碼數字';
      isValid = false;
    } else {
      errors.value[idx] = '';
    }
  });

  // if (isValid) {
  //   alert('表單送出成功！');
  //   // 可以在這裡處理送出資料，例如 API 呼叫
  // }
  if (!isValid) {
    return   
  }

  if (!userId.value) {
    return alert('找不到 userId，無法送出')
  }

  const payload = {
    name:          inputs.value[0],
    phone:         inputs.value[1],
    location:      inputs.value[2],
    farm_name:     inputs.value[3],
    service_unit:  inputs.value[4]
  }

  try {
    const res = await axios.post(
      `${API_BASE_URL}/profile/`,
      payload,
      { params: { userid: userId.value } }
    )
    alert('✅ 儲存成功！\n' + JSON.stringify(res.data, null, 2))
  } catch (e: any) {
    console.error('儲存失敗', e)
    alert('❌ 儲存失敗：' + (e.response?.data?.detail || e.message))
  }

};


const onPhoneInput = (event: Event, index: number) => {
  const input = event.target as HTMLInputElement;
  const original = input.value;
  const cleaned = original.replace(/\D/g, '');

  if (original !== cleaned) {
    errors.value[index] = '※請勿輸入符號或英文字母，只能輸入數字';
  } else {
    errors.value[index] = '';
  }

  inputs.value[index] = cleaned;
};
</script>

<template>
  <div class="form-page">
    <div class="form-wrapper">
      <h2 class="form-title">註冊基本資料</h2>
      <div v-for="(label, index) in labels" :key="index" class="form-block">
        <div class="form-group">
          <label class="form-label">{{ label }}</label>

          <!-- 電話欄位：限制輸入數字 -->
          <input
            v-if="index === 1"
            type="text"
            v-model="inputs[index]"
            class="form-input"
            :placeholder="placeholders[index]"
            :class="{ invalid: errors[index] }"
            inputmode="numeric"
            pattern="\d*"
            @input="onPhoneInput($event, index)"
          />

          <!-- 其他欄位 -->
          <input
            v-else
            type="text"
            v-model="inputs[index]"
            class="form-input"
            :placeholder="placeholders[index]"
            :class="{ invalid: errors[index] }"
          />
        </div>
        <p class="error-text" :class="{ visible: errors[index] }">{{ errors[index] }}</p>
      </div>
      <button class="submit-button" @click="handleSubmit">提交送出</button>
    </div>
  </div>
</template>

<style scoped>
.form-page {
  background: linear-gradient(45deg, #000, #1a1a1a);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  position: relative;
}

.form-wrapper {
  width: 100%;
  max-width: 400px;
  background: rgba(255, 255, 255, 0.05);
  padding: 2rem;
  border-radius: 16px;
  backdrop-filter: blur(6px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.form-title {
  color: #f2cd5e;
  font-size: 1.5rem;
  text-align: center;
  margin-bottom: 1rem;
}


.form-input-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center; /* <-- 垂直置中 */
}

.form-input {
  padding: 0.8rem 1rem;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1rem;
}

.form-input.invalid {
  border: 2px solid #ff5252;
}

.form-input::placeholder {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.7rem;             /*  縮小字體 */
}

.error-text {
  margin-left: 110px; /* 對齊輸入框開始的位置 */
  color: #ff5252;
  font-size: 0.75rem;
  min-height: 1em;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease;
}

.error-text.visible {
  opacity: 1;
  visibility: visible;
}

.submit-button {
  background: #f2cd5e;
  color: #000;
  font-weight: bold;
  padding: 0.8rem;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-top: 1rem;
}

.submit-button:hover {
  background: #d9b95b;
}

.form-label {
  color: #f2cd5e;
  font-size: 1rem;
  width: 90px; /* 固定寬度讓輸入框對齊 */
  flex-shrink: 0; /* 防止縮小 */
  font-weight: 700;
}

.form-group {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.form-block {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

</style>