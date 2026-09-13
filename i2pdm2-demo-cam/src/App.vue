<script lang="ts">
import logo from '@/assets/images/bblab_little_logo.png';
import pestInfo from '@/assets/images/pest-v1.1-info.png';
import { defineComponent, ref, onMounted, onBeforeUnmount, computed } from "vue";
import axios from "axios";
import { API_BASE_URL } from './config';

export default defineComponent({
  setup() {
    //temp global imageID for pie chart TODO : is there better way to store imageID? Not by global variable?
    const imageIdForPieChart = ref<string | null>(null);
        // Reactive state
    const constraints = ref({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 3200 }, // magic number (sticky paper size)
        height: { ideal: 2400 },
      },
    });
    const videoStream = ref<MediaStream | null>(null);
    const intervalId = ref<ReturnType<typeof requestAnimationFrame> | null>(null);
    const showDialog = ref(false);
    const capturedImage = ref<string | undefined>(undefined);
    const detectedImage = ref<string | undefined>(undefined);
    const metadata = ref<{ result?: string }>({});
    const processing = ref(false);
    const isFrontCamera = ref(true);
    const player = ref<HTMLVideoElement | null>(null);
    const photoCanvas = ref<HTMLCanvasElement | null>(null);
    const settingsVisible = ref(false); // Controls visibility of settings
    const pieChartVisible = ref(false);
    const pieChartImage = ref<string | null>(null);
    const selectedFile = ref<File | null>(null);

    const cameraInitialized = ref(false);
    const overlayRef = ref<HTMLElement | null>(null);
    const headerRef = ref<HTMLElement | null>(null);
    const footerRef = ref<HTMLElement | null>(null);

    const serverUrl = API_BASE_URL;
    // Progress Status
    const progressStatus = ref<string>("Initializing...");
    const progressPhase = ref<number>(0);
    const maxPhase = 3;
    const isSuccess = ref(false);
    // const { overlayRef, headerRef, footerRef } = useOverlayPosition();

    const adjustOverlay = () => {
      if (!headerRef.value || !footerRef.value || !overlayRef.value) return;

      // Use getBoundingClientRect to get accurate positions
      const headerRect = headerRef.value.getBoundingClientRect();
      const footerRect = footerRef.value.getBoundingClientRect();

      const topMargin = 20; // 10px margin below header
      const bottomMargin = 20; // 10px margin above footer
      const sideMargin = 20; // 10px margin from sides

      // Calculate top and bottom positions
      const topPosition = headerRect.bottom + topMargin;
      // const bottomPosition = window.innerHeight - footerRect.top + bottomMargin;
      // 怪方法
      const bottomPosition = footerRect.top - bottomMargin;
      // 這個計算其實是對的????
      console.log("Header.bottom", headerRect.bottom)
      console.log("Footer top", footerRect.top)
      console.log("Footer.bottom", footerRect.bottom)
      console.log("bottomPosition", bottomPosition)
      // call adjustOverlay during resize and also scrolling?? 
      // 目前沒有scrolling
      // Set overlay styles
      const availableHeight = footerRect.top - bottomMargin - topPosition;

      // Set overlay styles
      const overlay = overlayRef.value;
      overlay.style.position = 'absolute';
      overlay.style.top = `${topPosition}px`;
      overlay.style.left = `${sideMargin}px`;
      overlay.style.width = `calc(100% - ${2 * sideMargin}px)`;
      overlay.style.height = `${availableHeight}px`;
      overlay.style.border = '4px solid red';
      overlay.style.backgroundColor = 'transparent';
      overlay.style.pointerEvents = 'none'; // Allows clicks to pass through
    };

    const onResize = () => {
      adjustOverlay();
    };

    // Lifecycle Hooks
    onMounted(() => {
      window.addEventListener('resize', onResize);
      adjustOverlay();
      setTimeout(() => {
        getVideo();
      }, 100); // Small delay to ensure DOM is fully rendered
      console.log("Website mounted. Attempting to start video.");
      getVideo(); // first time get camera will be block, second time works
    });

    onBeforeUnmount(() => {
      stopCameraStream();
      window.removeEventListener('resize', onResize);
    });


    // Methods
    const getVideo = async (): Promise<void> => {
      try {
        if (!player.value) throw new Error("Video element not found");
        videoStream.value = await navigator.mediaDevices.getUserMedia(constraints.value);
        player.value.srcObject = videoStream.value;

        // Add a user gesture fallback for autoplay instead of await player.value.play();
        await player.value.play().catch((err) => { console.warn("Autoplay blocked. Waiting for user interaction:", err); });
        console.log("Camera started successfully.");

        player.value.onloadedmetadata = () => {
          const canvas = photoCanvas.value;

          cameraInitialized.value = true;
          adjustOverlay(); // Adjust overlay after camera initialization
          window.addEventListener('resize', onResize);

          if (canvas && player.value) {
            canvas.width = player.value.videoWidth;
            canvas.height = player.value.videoHeight;
          }
          paintToCanvas();

        };
      } catch (error) {
        console.error("Error accessing camera:", error);
      }
    };

    const toggleCamera = (): void => {
      isFrontCamera.value = !isFrontCamera.value;
      constraints.value.video.facingMode = isFrontCamera.value ? "user" : "environment";
      stopCameraStream();
      getVideo();
    };

    // const paintToCanvas = (): void => {
    //   const video = player.value;
    //   const canvas = photoCanvas.value;
    //   if (video && canvas) {
    //     const ctx = canvas.getContext("2d");
    //     if (ctx) {
    //       const drawFrame = () => {
    //         ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    //         intervalId.value = requestAnimationFrame(drawFrame);
    //       };
    //       drawFrame();
    //     }
    //   }
    // };

    const paintToCanvas = (): void => {
      const video = player.value;
      const canvas = photoCanvas.value;
      if (video && canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const drawFrame = () => {
            // Ensure the canvas dimensions match the desired output size
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;

            // Calculate the aspect ratios
            const videoAspectRatio = video.videoWidth / video.videoHeight;
            const canvasAspectRatio = canvas.width / canvas.height;

            let drawWidth, drawHeight, offsetX, offsetY;

            if (videoAspectRatio > canvasAspectRatio) {
              // Video is wider than canvas: fill height, crop sides
              drawHeight = canvas.height;
              drawWidth = videoAspectRatio * drawHeight;
              offsetX = (canvas.width - drawWidth) / 2;
              offsetY = 0;
            } else {
              // Video is taller than canvas: fill width, crop top/bottom
              drawWidth = canvas.width;
              drawHeight = drawWidth / videoAspectRatio;
              offsetX = 0;
              offsetY = (canvas.height - drawHeight) / 2;
            }

            // Clear the canvas before drawing
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw the video frame onto the canvas
            ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

            // Request the next animation frame
            intervalId.value = requestAnimationFrame(drawFrame);
          };
          drawFrame();
        }
      }
    };

    const useNativeCamera = ref(true); // New state to toggle between native and custom camera

    // Add method for native camera capture
    const openNativeCamera = async () => {
      // Clean up any existing input elements first
      const oldInput = document.querySelector('input[type="file"]');
      if (oldInput) {
        oldInput.remove();
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      
      // Append to document body to ensure it's properly initialized
      document.body.appendChild(input);

      input.onchange = (e: Event) => {
        try {
          const el = e.target as HTMLInputElement | null;
          if (!el?.files?.[0]) return;
          const file = el.files[0];
          const reader = new FileReader();
          
          reader.onload = () => {
            capturedImage.value = reader.result as string;
            showDialog.value = true;
            processing.value = true;
            progressStatus.value = "Uploading image...";
            progressPhase.value = 0;
            isSuccess.value = false;
            uploadAndProcessImage(capturedImage.value);
            
            // Clean up after successful upload
            input.remove();
          };
          
          reader.onerror = () => {
            console.error("FileReader error");
            alert("Failed to read image file");
            input.remove();
          };
          
          reader.readAsDataURL(file);
        } catch (error) {
          console.error("Error in file handling:", error);
          alert("Failed to process image");
          input.remove();
        }
      };

      // Add timeout to remove input if not used
      setTimeout(() => {
        if (document.body.contains(input)) {
          input.remove();
        }
      }, 60000); // 1 minute timeout

      input.click();
    };

    // Modify takePhoto method to handle both modes
    const takePhoto = async (): Promise<void> => {
      if (useNativeCamera.value) {
        await openNativeCamera();
      } else {
        // Existing canvas capture logic
        if (!player.value || !photoCanvas.value) {
          alert("Camera not initialized properly.");
          return;
        }
        const canvas = photoCanvas.value;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          alert("Failed to get canvas context.");
          return;
        }
        // Capture the image
        capturedImage.value = canvas.toDataURL("image/jpeg", 1.0);
        // Rotate the image if necessary
        const rotatedImage = await ensureLandscapeOrientation(canvas);
        capturedImage.value = rotatedImage;

        // Download the captured image
        // downloadImage(capturedImage.value, "captured_image.jpg");
      
        showDialog.value = true;
        processing.value = true;
        progressStatus.value = "Uploading image...";
        progressPhase.value = 0;
        isSuccess.value = false;

        uploadAndProcessImage(capturedImage.value);
      }
    };

    const resizeCanvas = () => {
      const canvas = photoCanvas.value;
      if (!canvas) return;

      const header = document.querySelector('header');
      const footer = document.querySelector('footer');

      if (!header || !footer) return;

      const headerHeight = (header as HTMLElement).offsetHeight;
      const footerHeight = (footer as HTMLElement).offsetHeight;  
      const availableHeight = window.innerHeight - headerHeight - footerHeight;

      canvas.width = window.innerWidth;
      canvas.height = availableHeight;
    };

    //--this part should process at backend in future --
    const ensureLandscapeOrientation = async (canvas: HTMLCanvasElement): Promise<string> => {
      if (canvas.height > canvas.width) {
        const tempCanvas = document.createElement("canvas");
        const ctx = tempCanvas.getContext("2d");

        if (!ctx) {
          throw new Error("Failed to get context for rotation.");
        }

        // Swap width and height for the new canvas
        tempCanvas.width = canvas.height;
        tempCanvas.height = canvas.width;

        // Rotate the image 90 degrees clockwise
        ctx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

        // Return the rotated image as a base64 string
        return tempCanvas.toDataURL("image/jpeg", 1.0);
      }

      // If already in landscape, return the original image
      return canvas.toDataURL("image/jpeg", 1.0);
    };

    const selectImage = async (event: Event): Promise<void> => {
      const input = event.target as HTMLInputElement;
      if (input.files && input.files[0]) {
        selectedFile.value = input.files[0];
        const reader = new FileReader();
        reader.onload = () => {
          capturedImage.value = reader.result as string;
          showDialog.value = true;
          processing.value = true;
          progressStatus.value = "Uploading image...";
          progressPhase.value = 0;
          isSuccess.value = false;
          uploadAndProcessImage(capturedImage.value);
        };
        reader.readAsDataURL(input.files[0]);
      }
    };

    const formatResult = (data: { [key: string]: any }): string => {
      const entries = Object.entries(data);

      // Separate "總數" key if it exists
      const prioritized = entries.filter(([key]) => key === "總數");
      const others = entries.filter(([key]) => key !== "總數");

      // Format and combine prioritized keys with others
      return [...prioritized, ...others]
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
    };

    const uploadAndProcessImage = async (imageData: string | undefined) => {
      try {
        // Add debug logging
        console.log("Starting image upload process...");

        // Add resource check with better error handling
        try {
          const statusResponse = await axios.get(`${serverUrl}/pest-detect/status`);
          console.log("Server status response:", statusResponse.data);
          
          if (statusResponse.data.result !== "ready") {
            progressStatus.value = "伺服器忙碌中，請稍候再試";
            throw new Error("Server not ready");
          }
        } catch (statusError) {
          console.error("Status check failed:", statusError);
          progressStatus.value = "無法連接伺服器，請稍候再試";
          processing.value = false;
          return;
        }

        if (!imageData) {
          alert("No image data to process.");
          processing.value = false;
          return;
        }

        const blob = base64ToBlob(imageData);
        const formData = new FormData();
        formData.append("file", blob, "capturedImage.jpg");

        console.log("Uploading image...");
        try {
          const uploadResponse = await axios.post(`${serverUrl}/pest-detect/upload/`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
            // timeout: 5000, // 5 second timeout
            // timeout: 10000, // 10 second timeout
            timeout: 30000, // 30 second timeout (extended for slow network / large images)
          });
          
          progressPhase.value = 1;
          progressStatus.value = "Processing image...";

          const imageId = uploadResponse.data.id;
          // add this line for global imageID
          imageIdForPieChart.value = uploadResponse.data.id;

          const preprocessResponse = await axios.get(`${serverUrl}/pest-detect/preprocess/${imageId}`);

          if (preprocessResponse.data.result !== "success") {
            throw new Error("Image preprocessing failed.");
          }

          progressPhase.value = 2;
          progressStatus.value = "Detecting pests...";
          console.log("🚀 準備呼叫 detect API:", `${serverUrl}/pest-detect/detect/${imageId}`);
          const detectionResponse = await axios.get(`${serverUrl}/pest-detect/detect/${imageId}`);

          console.log("✅ API 回應:", detectionResponse.data);
          console.log("✅ 圖片資料存在:", !!detectionResponse.data.image);
          console.log("✅ 圖片資料長度:", detectionResponse.data.image?.length);

          metadata.value = { result: formatResult(detectionResponse.data.result) };
          detectedImage.value = `data:image/jpeg;base64,${detectionResponse.data.image}`;

          console.log("✅ detectedImage 已設定");
          console.log("✅ detectedImage 長度:", detectedImage.value?.length);
          console.log("✅ detectedImage 前 100 字:", detectedImage.value?.substring(0, 100));

          isSuccess.value = true;
          progressStatus.value = "Detection completed successfully.";

        } catch (axiosError: any) {
          if (axiosError.code === 'ECONNABORTED') {
            // Handle timeout error
            progressStatus.value = "上傳超時，請檢查網路連線後重試";
            console.error("Upload timeout:", axiosError);
          } else if (axiosError.response) {
            // Handle server error responses
            progressStatus.value = `上傳失敗: ${axiosError.response.data.message || '請稍後重試'}`;
            console.error("Server error:", axiosError.response.data);
          } else if (axiosError.request) {
            // Handle network errors
            progressStatus.value = "網路連線錯誤，請檢查網路後重試";
            console.error("Network error:", axiosError);
          } else {
            // Handle other errors
            progressStatus.value = "上傳過程發生錯誤，請重試";
            console.error("Upload error:", axiosError);
          }
          throw axiosError; // Re-throw to be caught by outer catch block
        }

      } catch (error: any) {
        handleError(error);
      } finally {
        processing.value = false;
      }
    };

    const downloadImage = (imageData: string, filename: string): void => {
      if (!imageData) {
        alert("No image available for download.");
        return;
      }

      // Convert Base64 to Blob
      const byteString = atob(imageData.split(",")[1]);
      const mimeString = imageData.split(",")[0].split(":")[1].split(";")[0];
      const arrayBuffer = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        arrayBuffer[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([arrayBuffer], { type: mimeString });

      // Create a temporary link element
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const downloadButton = (): void => {
      if (capturedImage.value) {
        downloadImage(capturedImage.value, 'captured_image.jpg');
      }
      if (detectedImage.value) {
        downloadImage(detectedImage.value, 'processed_result.jpg');
      }
    };

    const base64ToBlob = (base64: string): Blob => {
      const byteString = atob(base64.split(",")[1]);
      const mimeString = base64.split(",")[0].split(":")[1].split(";")[0];
      const arrayBuffer = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        arrayBuffer[i] = byteString.charCodeAt(i);
      }
      return new Blob([arrayBuffer], { type: mimeString });
    };

    const handleError = (error: any): void => {
      console.error("Error during detection process:", error);
      if (error.response && error.response.data) {
        progressStatus.value = error.response.data.detail || "An error occurred.";
      } else {
        progressStatus.value = error.message || "An unexpected error occurred.";
      }
      isSuccess.value = false;
    };

    const stopCameraStream = (): void => {
      if (videoStream.value) {
        videoStream.value.getTracks().forEach((track) => track.stop());
        videoStream.value = null;
      }
      if (intervalId.value) {
        cancelAnimationFrame(intervalId.value);
        intervalId.value = null;
      }
    };

    const closeDialog = (): void => {
      if (processing.value) {
        const confirmClose = confirm("Detection is in progress. Do you really want to cancel?");
        if (!confirmClose) return;
      }
      resetState();
    };

    const resetState = (): void => {
      showDialog.value = false;
      processing.value = false;
      progressStatus.value = "";
      progressPhase.value = 0;
      metadata.value = {};
      detectedImage.value = undefined;
      capturedImage.value = undefined;
      selectedFile.value = null;
      isSuccess.value = false;
    };

    // const togglePieChart = (): void => {
    //   pieChartVisible.value = !pieChartVisible.value;
    // }

    const togglePieChart = async (): Promise<void> => {
      if (!imageIdForPieChart.value) {
        console.error("No imageId found. Pie chart cannot be fetched.");
        return;
      }

      pieChartVisible.value = !pieChartVisible.value;

      if (pieChartVisible.value) {
        try {
          const response = await axios.get(`${serverUrl}/pest-detect/chart/${imageIdForPieChart.value}`, {
            responseType: "blob",
          });

          pieChartImage.value = URL.createObjectURL(response.data);
        } catch (error) {
          console.error("Failed to fetch Pie Chart:", error);
          pieChartImage.value = null;
        }
      }
    };

    const openSettings = (): void => {
      settingsVisible.value = true;
    };

    const closeSettings = (): void => {
      settingsVisible.value = false;
    };

    const retryDetection = (): void => {
      if (capturedImage.value) {
        processing.value = true;
        progressStatus.value = "Retrying image upload...";
        progressPhase.value = 0;
        isSuccess.value = false;
        uploadAndProcessImage(capturedImage.value);
      }
    };

    // Add toggle for camera mode in settings
    const toggleCameraMode = () => {
      useNativeCamera.value = !useNativeCamera.value;
      if (!useNativeCamera.value) {
        // Initialize custom camera preview when switching to it
        getVideo();
      } else {
        // Stop custom camera preview
        stopCameraStream();
      }
    };
    const parsedMetadata = computed(() => {
      const resultString = metadata.value.result || "";
      const obj: Record<string, number> = {};

      resultString.split(",").forEach(pair => {
        const [key, value] = pair.trim().split(":");
        if (key && value && !isNaN(+value)) {
          obj[key] = Number(value);
        }
      });

      return obj;
    });

    return {
      constraints,
      player,
      photoCanvas,
      showDialog,
      capturedImage,
      detectedImage,
      metadata,
      processing,
      isFrontCamera,
      getVideo,
      toggleCamera,
      paintToCanvas,
      takePhoto,
      selectImage,
      stopCameraStream,
      closeDialog,
      openSettings,
      closeSettings,
      retryDetection,
      settingsVisible,
      progressStatus,
      progressPhase,
      maxPhase,
      isSuccess,
      logo,
      cameraInitialized,
      overlayRef,
      headerRef,
      footerRef,
      downloadImage,
      downloadButton,
      togglePieChart,
      pieChartVisible,
      useNativeCamera,
      toggleCameraMode,
      pestInfo,
      pieChartImage,
      parsedMetadata,
    };
  },
});
</script>


<template>
  <!-- <div id="app"> -->
  <div>
    <!-- HEADER -->
    <header class="fixed-top" ref="headerRef">
      <!-- Navbar -->
      <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <div class="container-fluid">
          <!-- Logo and Title -->
          <a class="navbar-brand d-flex align-items-center mx-auto" href="#">
            <img :src="logo" alt="App Logo" class="logo" />
            <span>害蟲辨識</span>
          </a>
        </div>
      </nav>
    </header>
    <!-- END HEADER -->

    <!-- MAIN -->
    <!-- <div id="i2pdm2-main" class=""> -->
    <!-- Canvas for Preview -->
    <div class="layout main">
      <!-- Add background image container -->
      <div class="background-container" v-if="!cameraInitialized">
        <div class="info-wrapper">
          <img :src="pestInfo" alt="Pest Detection Information" class="info-image" />
          <p class="background-text">請點擊下方相機按鈕開始拍攝</p>
        </div>
      </div>

      <!-- Existing camera container -->
      <div class="canvas-container" v-if="!useNativeCamera">
        <canvas ref="photoCanvas" class="photo"></canvas>
        <video ref="player" class="player" autoplay muted playsinline></video>
        <div class="overlay-rectangle" ref="overlayRef"></div>
      </div>
    </div>


    <!-- </main> -->

    <!-- </div> -->
    <!-- END MAIN -->


    <!-- Hidden Video Element for Camera Feed -->




    <!-- Canvas for Overlay -->

    <!-- Action Buttons -->
    <!-- <div class="buttons"> -->
    <!-- <label class="select-image-button">
            Upload Image
            <input type="file" accept="image/*" @change="selectImage" hidden />
          </label> -->
    <!-- <button @click="takePhoto" :disabled="processing">Capture Image</button> -->
    <!-- <button @click="openSettings">Settings</button> -->
    <!-- </div> -->

    <div v-if="settingsVisible" class="settings-overlay">
      <div class="settings-dialog">
        <h2>設置</h2>
        <div class="settings-buttons">
          <button @click="toggleCameraMode">
            {{ useNativeCamera ? '使用預覽模式' : '使用原生相機' }}
          </button>
          <button @click="toggleCamera" v-if="!useNativeCamera">切換鏡頭</button>
          <button @click="closeSettings">返回</button>
        </div>
      </div>
    </div>

    <div v-if="showDialog" class="dialog-overlay">
      <div class="dialog">
        <h2>害蟲分析進度</h2>
        <div v-if="processing">
          <div class="progress-indicator">
            <div class="spinner"></div>
            <p>{{ progressStatus }}</p>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: ((progressPhase / maxPhase) * 100) + '%' }"></div>
            </div>
          </div>
          <div class="button-container">
            <button @click="closeDialog">取消</button>
          </div>
        </div>
        <div v-else>

          <div v-if="isSuccess">
            <h3>辨識結果</h3>
            <img :src="detectedImage" alt="Detected Image" />
            <div class="metadata">
              <p><strong>結果:</strong> {{ metadata.result }}</p>
              <p>
                <strong>顏色: </strong>
                <template v-for="(count, label) in parsedMetadata" :key="label">
                  <template v-if="label !== '總數'">
                    <span :class="['insect-circle', label]"></span>
                    <span style="margin-right: 12px;">{{ label }}</span>
                  </template>
                </template>
              </p>
            </div>
            <div class="button-container">
              <button @click="togglePieChart">害蟲比例圖</button>
              <button @click="downloadButton" :disabled="!capturedImage || !detectedImage">
                下載結果
              </button>
              <button @click="closeDialog">返回</button>
            </div>
          </div>
          <div v-else>
            <h3>辨識錯誤，請重新拍攝</h3>
            <p>{{ progressStatus }}</p>
            <div class="button-container">
              <button @click="retryDetection">重新上傳</button>
              <button @click="closeDialog">返回</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- pevious function of pest pie chart -->

    <!-- <div v-if="pieChartVisible" class="settings-overlay">
      <div class="settings-dialog">
        <h3>功能開發當中...</h3>
        <button @click="togglePieChart">返回</button>
      </div>
    </div>  -->
  
    <!-- add the function of pest pie chart -->

    <div v-if="pieChartVisible" class="settings-overlay">
      <div class="settings-dialog">
        <h3>害蟲比例圖</h3>
        <div v-if="pieChartImage">
          <img :src="pieChartImage" alt="Pie Chart" style="max-width: 100%; height: auto;">
        </div>
        <div v-else>
          <p>載入中...</p>
        </div>
        <button @click="togglePieChart">關閉</button>
      </div>
    </div>
  
    

    <!-- FOOTER -->
    <footer class="bg-dark fixed-bottom" ref="footerRef">
      <div class="container-fluid bg-dark">
        <div class="row justify-content-between g-2"> <!-- Changed to justify-content-between and added g-2 for gap -->
          <div class="col">
            <label class="select-image-button w-100">
              <i class="bi bi-upload text-dark icon-large"></i>
              <input type="file" accept="image/*" @change="selectImage" hidden />
            </label>
          </div>
          <div class="col">
            <button @click="takePhoto" :disabled="processing" type="button" class="btn btn-primary w-100">
              <i class="bi bi-camera text-dark icon-large"></i>
            </button>
          </div>
          <div class="col">
            <button @click="openSettings" type="button" class="btn btn-success w-100">
              <i class="bi bi-gear text-dark icon-large"></i>
            </button>
          </div>
        </div>
      </div>
    </footer>
    <!-- END FOOTER -->
    <!-- </div> -->
   </div>
</template>

<style scoped>
/* ====== LAYOUT & STRUCTURE ====== */
.main {
  flex: 1;
  background: linear-gradient(45deg, #000000, #1a1a1a);
  min-height: 100vh;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Modern gradient overlay */
.main::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    45deg,
    rgba(255, 216, 74, 0.1),
    rgba(219, 186, 149, 0.1),
    rgba(208, 188, 225, 0.1)
  );
  background-size: 200% 200%;
  animation: gradientBG 15s ease infinite;
  pointer-events: none; /* Allows clicks to pass through */
}

/* ====== HEADER STYLES ====== */
.logo {
  height: 2em;
  width: auto;
  margin-right: 0.8em;
  filter: drop-shadow(0 0 5px rgba(255,255,255,0.3));
}

.icon-large {
  font-size: 1.8rem;
  color: #F2CD5E; /* Fallback color */
  /* Remove the gradient text effect */
  /* background: linear-gradient(45deg, #F2CD5E, #91E9F2);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent; */
  transition: transform 0.3s ease;
}

.icon-large:hover {
  transform: scale(1.1);
  color: #91E9F2; /* Color change on hover */
}

/* ====== CAMERA CONTAINER ====== */
.canvas-container {
  position: relative;
  flex-grow: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(233, 236, 239, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.1);
  z-index: 2; /* Ensure it's above the background when visible */
}

.camera-component {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ====== PHOTO/VIDEO ELEMENTS ====== */
.photo {
  width: 100vw;
  height: calc(100vh - 120px); /* Subtract header/footer height */
  object-fit: cover;
  border-radius: 20px;
}

.player {
  display: none; /* Hidden video element */
}

/* ====== BUTTON STYLES ====== */
.buttons {
  display: flex;
  gap: 15px;
  margin-top: 15px;
}

/* Base button style */
button {
  padding: 12px 24px;
  border: none;
  background: rgba(242, 205, 94, 0.9);
  color: black;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(5px);
  font-weight: 500;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  background: rgba(217, 185, 91, 0.9);
}

/* Button container for centered groups */
.button-container {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
  margin-top: 25px;
}

.button-container button {
  background: rgba(115, 52, 38, 0.9);
  color: white;
}

.button-container button:hover {
  background: rgba(38, 1, 4, 0.9);
}

/* ====== FILE INPUT BUTTON ====== */
.select-image-button {
  position: relative;
  display: inline-block;
  padding: 12px 24px;
  background: rgba(242, 205, 94, 0.9);
  color: black;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.select-image-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
}

.select-image-button input {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

/* ====== OVERLAY & DIALOG STYLES ====== */
.settings-overlay,
.dialog-overlay {
  /*change from fixed to absolute ==> for this dialog can be scroll to bottom*/
  /*position: fixed;*/
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
  backdrop-filter: blur(5px);
  z-index: 1000; /* Increased to ensure it's above everything */
}

/* Modern glass-morphism dialog */
.dialog,
.settings-dialog {
  background: rgba(216, 230, 242, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.1);
  max-width: 500px;
  width: 90%;
  max-width: 400px; /* Reduced from 500px to better fit mobile */
  max-height: 85vh;
  overflow-y: auto; /* Enable scrolling if content is too long */
  text-align: center;
  z-index: 1001; /* One higher than the overlay */
}

.settings-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
  align-items: center;
  margin-top: 20px;
}

.settings-buttons button {
  width: 200px; /* Fixed width for all buttons */
  margin: 0; /* Remove default margins */
}
/* Dialog typography */
.dialog h2,
.settings-dialog h2 {
  margin-bottom: 25px;
  font-size: 1.8rem;
  font-weight: 600;
  background: linear-gradient(45deg, #733426, #260104);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.dialog h3 {
  margin-bottom: 15px;
  font-size: 1.4rem;
  font-weight: 500;
}

/* Dialog image styling */
.dialog img {
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;
  margin-bottom: 15px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

/* ====== PROGRESS INDICATORS ====== */
.progress-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

/* Modern spinner */
.spinner {
  border: 4px solid rgba(243, 243, 243, 0.3);
  border-top: 4px solid #733426;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes gradientBG {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* Modern progress bar */
.progress-bar {
  width: 100%;
  height: 8px;
  background: rgba(224, 224, 224, 0.2);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 15px;
}

.progress-fill {
  background: linear-gradient(90deg, #733426, #260104);
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

/* ====== METADATA SECTION ====== */
.metadata {
  text-align: left;
  font-size: 1rem;
  margin-top: 20px;
  padding: 15px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.metadata p {
  margin: 8px 0;
  line-height: 1.5;
}

.insect-circle {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  margin-right: 6px;
  border: 1px solid #333;
  vertical-align: middle;
}

.insect-circle.薊馬 {
  background-color: rgba(255, 0, 0, 1); 
}

.insect-circle.蕈蠅 {
  background-color: rgb(5, 155, 205);
}

.insect-circle.粉蝨 {
  background-color: rgb(255, 165, 0);
}

.insect-circle.其他 {
  background-color: rgb(14, 71, 203);
}

/* ====== FOOTER STYLES ====== */
footer .container-fluid {
  padding: 15px 0;
}

footer .row {
  margin: 0; /* Remove default margins */
}

/* Common styles for both buttons and label */
.select-image-button,
footer .btn {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 60px; /* Fixed height */
  width: 100%;
  padding: 10px;
  border-radius: 12px;
  background-color: #F2CD5E !important; /* Override Bootstrap colors */
  border: none;
}

/* Column styles */
footer .col {
  padding: 0 5px;
}

/* ====== RESPONSIVE DESIGN ====== */
@media (max-width: 600px) {
  .dialog,
  .settings-dialog {
    padding: 10px;
    margin: 10px;
    width: 95%;
    max-height: 70vh;
  }

  .settings-buttons {
    gap: 10px;
  }

  .settings-buttons button {
    width: 180px;
    padding: 8px 16px;
    font-size: 0.9rem;
  }
  .select-image-button,
  footer .btn {
    height: 50px;
  }
  .dialog h2,
  .settings-dialog h2 {
    font-size: 1.3rem;
    margin-bottom: 15px;
  }

  button {
    padding: 10px 10px;
    font-size: 0.9rem;
  }
  .button-container {
    gap: 8px;
  }
  .button-container button {
    padding: 8px;
    font-size: 0.85rem;
  }
  .icon-large {
    font-size: 1.5rem;
  }
}

/* Add these new styles */
.background-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 90%; /* Reduced from 100% to give some margin */
  max-width: 800px; /* Maximum width for larger screens */
  text-align: center;
  z-index: 1;
}

.info-wrapper {
  background: rgba(0, 0, 0, 0.7); /* Semi-transparent background */
  padding: 20px;
  border-radius: 15px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.info-image {
  width: 100%;
  height: auto;
  border-radius: 10px;
  margin-bottom: 20px;
  box-shadow: 0 2px 10px rgba(242, 205, 94, 0.2);
}

.background-text {
  color: #F2CD5E;
  font-size: 1.2rem;
  margin-top: 20px;
  text-align: center;
  animation: fadeIn 1s ease-in;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

/* Update responsive design */
@media (max-width: 600px) {
  .background-container {
    width: 95%;
    padding: 10px;
  }

  .info-wrapper {
    padding: 15px;
  }

  .background-text {
    font-size: 1rem;
  }
}

/* Keep other styles unchanged... */
</style>