/* ==========================================================================
   DeepShield AI v3 — Frontend Logic
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Configuration                                                       */
  /* ------------------------------------------------------------------ */

  // Default backend URL — can be overridden anytime from the Settings page.
  // No localhost is used. Replace this default with your actual Render URL
  // after deployment, or simply set it once in the Settings page (it is
  // saved to the browser's localStorage and used from then on).
  const DEFAULT_API_URL = "https://deepfakedetector-3epb.onrender.com";

  const STORAGE_KEYS = {
    apiUrl: "deepshield_api_url",
    history: "deepshield_scan_history",
    animToggle: "deepshield_anim_enabled",
  };

  function getApiUrl() {
    const saved = localStorage.getItem(STORAGE_KEYS.apiUrl);
    return (saved && saved.trim()) ? saved.trim().replace(/\/+$/, "") : DEFAULT_API_URL;
  }

  function setApiUrl(url) {
    localStorage.setItem(STORAGE_KEYS.apiUrl, url.trim().replace(/\/+$/, ""));
  }

  /* ------------------------------------------------------------------ */
  /* State                                                                */
  /* ------------------------------------------------------------------ */

  let selectedFile = null;
  let selectedFileDataUrl = null;
  let lastResult = null;
  let history = loadHistory();

  // Batch mode state: when more than one file is selected, we switch into
  // batch scanning instead of the single-image flow.
  let selectedBatchFiles = []; // [{ file, dataUrl }]
  let lastBatchResults = null; // array of results from the last /scan-batch call
  const MAX_BATCH_FILES = 15;

  // Video mode state: when a single video file is selected.
  let selectedVideoFile = null;
  let selectedVideoObjectUrl = null;
  let lastVideoResult = null;
  const ALLOWED_VIDEO_EXTENSIONS = ["mp4", "mov", "avi", "webm", "mkv", "m4v"];
  const MAX_VIDEO_FILE_BYTES = 50 * 1024 * 1024;

  // URL scan state
  let lastUrlResult = null;

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.history);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory() {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  }

  /* ------------------------------------------------------------------ */
  /* DOM References                                                       */
  /* ------------------------------------------------------------------ */

  const sidebar = document.getElementById("sidebar");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const navItems = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page");

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const dropzoneContent = document.getElementById("dropzoneContent");
  const previewWrap = document.getElementById("previewWrap");
  const previewImage = document.getElementById("previewImage");
  const removeBtn = document.getElementById("removeBtn");
  const chooseBtn = document.getElementById("chooseBtn");
  const scanBtn = document.getElementById("scanBtn");
  const scanBtnText = document.getElementById("scanBtnText");
  const filenameDisplay = document.getElementById("filenameDisplay");

  const resultEmpty = document.getElementById("resultEmpty");
  const resultLoading = document.getElementById("resultLoading");
  const resultContent = document.getElementById("resultContent");
  const resultError = document.getElementById("resultError");
  const errorText = document.getElementById("errorText");

  const verdictBadge = document.getElementById("verdictBadge");
  const verdictLabel = document.getElementById("verdictLabel");
  const confidenceValue = document.getElementById("confidenceValue");
  const confidenceFill = document.getElementById("confidenceFill");
  const detailFilename = document.getElementById("detailFilename");
  const detailTimestamp = document.getElementById("detailTimestamp");
  const explanationText = document.getElementById("explanationText");

  const downloadBtn = document.getElementById("downloadBtn");
  const scanAnotherBtn = document.getElementById("scanAnotherBtn");

  const batchPreviewWrap = document.getElementById("batchPreviewWrap");
  const batchThumbs = document.getElementById("batchThumbs");
  const batchCountLabel = document.getElementById("batchCountLabel");
  const batchRemoveBtn = document.getElementById("batchRemoveBtn");

  const batchResultLoading = document.getElementById("batchResultLoading");
  const batchLoadingText = document.getElementById("batchLoadingText");
  const batchResultContent = document.getElementById("batchResultContent");
  const batchStatTotal = document.getElementById("batchStatTotal");
  const batchStatReal = document.getElementById("batchStatReal");
  const batchStatFake = document.getElementById("batchStatFake");
  const batchStatErrors = document.getElementById("batchStatErrors");
  const batchResultsBody = document.getElementById("batchResultsBody");
  const batchDownloadBtn = document.getElementById("batchDownloadBtn");
  const batchScanAnotherBtn = document.getElementById("batchScanAnotherBtn");

  const videoPreviewWrap = document.getElementById("videoPreviewWrap");
  const previewVideo = document.getElementById("previewVideo");
  const videoRemoveBtn = document.getElementById("videoRemoveBtn");

  const videoResultLoading = document.getElementById("videoResultLoading");
  const videoLoadingText = document.getElementById("videoLoadingText");
  const videoResultContent = document.getElementById("videoResultContent");
  const videoVerdictBadge = document.getElementById("videoVerdictBadge");
  const videoVerdictLabel = document.getElementById("videoVerdictLabel");
  const videoConfidenceValue = document.getElementById("videoConfidenceValue");
  const videoConfidenceFill = document.getElementById("videoConfidenceFill");
  const videoStatFrames = document.getElementById("videoStatFrames");
  const videoStatFakeFrames = document.getElementById("videoStatFakeFrames");
  const videoStatFakeRatio = document.getElementById("videoStatFakeRatio");
  const videoExplanationText = document.getElementById("videoExplanationText");
  const videoFrameResultsBody = document.getElementById("videoFrameResultsBody");
  const videoDownloadBtn = document.getElementById("videoDownloadBtn");
  const videoScanAnotherBtn = document.getElementById("videoScanAnotherBtn");

  const urlInput = document.getElementById("urlInput");
  const urlScanBtn = document.getElementById("urlScanBtn");
  const urlResultEmpty = document.getElementById("urlResultEmpty");
  const urlResultLoading = document.getElementById("urlResultLoading");
  const urlLoadingText = document.getElementById("urlLoadingText");
  const urlResultError = document.getElementById("urlResultError");
  const urlErrorText = document.getElementById("urlErrorText");
  const urlResultContent = document.getElementById("urlResultContent");
  const urlRiskBadge = document.getElementById("urlRiskBadge");
  const urlDomain = document.getElementById("urlDomain");
  const urlPageTitle = document.getElementById("urlPageTitle");
  const urlHttpsBadge = document.getElementById("urlHttpsBadge");
  const urlFlagsWrap = document.getElementById("urlFlagsWrap");
  const urlStatImages = document.getElementById("urlStatImages");
  const urlStatScanned = document.getElementById("urlStatScanned");
  const urlStatFake = document.getElementById("urlStatFake");
  const urlImagesBody = document.getElementById("urlImagesBody");
  const urlDownloadBtn = document.getElementById("urlDownloadBtn");
  const urlScanAnotherBtn = document.getElementById("urlScanAnotherBtn");

  const statTotal = document.getElementById("statTotal");
  const statReal = document.getElementById("statReal");
  const statFake = document.getElementById("statFake");
  const statAvgConf = document.getElementById("statAvgConf");

  const historyTableBody = document.getElementById("historyTableBody");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  const donutReal = document.getElementById("donutReal");
  const donutFake = document.getElementById("donutFake");
  const donutTotal = document.getElementById("donutTotal");
  const barsWrap = document.getElementById("barsWrap");

  const apiUrlInput = document.getElementById("apiUrlInput");
  const saveApiUrlBtn = document.getElementById("saveApiUrlBtn");
  const apiUrlSaveStatus = document.getElementById("apiUrlSaveStatus");
  const testConnectionBtn = document.getElementById("testConnectionBtn");
  const testConnectionStatus = document.getElementById("testConnectionStatus");
  const animToggle = document.getElementById("animToggle");

  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  /* ------------------------------------------------------------------ */
  /* Navigation                                                           */
  /* ------------------------------------------------------------------ */

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const page = item.getAttribute("data-page");
      navItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      pages.forEach((p) => p.classList.remove("active"));
      document.getElementById("page-" + page).classList.add("active");

      if (page === "history") renderHistoryTable();
      if (page === "analytics") renderAnalytics();
      if (page === "settings") {
        apiUrlInput.value = getApiUrl();
      }

      if (window.innerWidth <= 880) {
        sidebar.classList.remove("open");
      }
    });
  });

  mobileMenuBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  /* ------------------------------------------------------------------ */
  /* File Upload / Drag & Drop                                            */
  /* ------------------------------------------------------------------ */

  chooseBtn.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", (e) => {
    if (e.target === removeBtn || e.target === batchRemoveBtn || e.target === videoRemoveBtn) return;
    if (e.target.closest && e.target.closest(".batch-thumb-remove")) return;
    if (!selectedFile && !selectedVideoFile && selectedBatchFiles.length === 0) fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length) {
      handleFiles(Array.from(e.target.files));
    }
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length) {
      handleFiles(Array.from(files));
    }
  });

  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    resetUpload();
  });

  batchRemoveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    resetUpload();
  });

  videoRemoveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    resetUpload();
  });

  function isVideoFile(file) {
    if (file.type && file.type.startsWith("video/")) return true;
    const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    return ALLOWED_VIDEO_EXTENSIONS.includes(ext);
  }

  /**
   * Entry point for both click-to-browse and drag & drop. A single video
   * routes into video mode; one image routes into the single-image flow;
   * multiple images route into batch mode. Mixed video+image selections
   * are not supported — videos are scanned one at a time.
   */
  function handleFiles(files) {
    const videoFiles = files.filter((f) => isVideoFile(f));
    const imageFiles = files.filter((f) => !isVideoFile(f) && f.type.startsWith("image/"));

    if (videoFiles.length > 0) {
      if (files.length > 1) {
        alert("Only one video can be scanned at a time. The first video was used and any other files were ignored.");
      }
      handleVideoFile(videoFiles[0]);
      return;
    }

    const validFiles = [];
    for (const file of imageFiles) {
      if (file.size > 10 * 1024 * 1024) {
        alert(file.name + " is too large (max 10MB per image) and was skipped.");
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      if (files.length === 1) {
        alert("Please upload a valid image (JPG, PNG, WEBP) or video (MP4, MOV, WEBM) file.");
      }
      return;
    }

    if (validFiles.length === 1) {
      handleSingleFile(validFiles[0]);
      return;
    }

    if (validFiles.length > MAX_BATCH_FILES) {
      alert(
        "You selected " + validFiles.length + " images, but batch scans are limited to " +
        MAX_BATCH_FILES + ". Only the first " + MAX_BATCH_FILES + " will be used."
      );
    }

    handleBatchFiles(validFiles.slice(0, MAX_BATCH_FILES));
  }

  function handleVideoFile(file) {
    if (file.size > MAX_VIDEO_FILE_BYTES) {
      alert("Video is too large. Please upload a video under " + formatBytes(MAX_VIDEO_FILE_BYTES) + ".");
      return;
    }

    selectedFile = null;
    selectedBatchFiles = [];
    selectedVideoFile = file;

    if (selectedVideoObjectUrl) URL.revokeObjectURL(selectedVideoObjectUrl);
    selectedVideoObjectUrl = URL.createObjectURL(file);
    previewVideo.src = selectedVideoObjectUrl;

    dropzoneContent.classList.add("hidden");
    previewWrap.classList.add("hidden");
    batchPreviewWrap.classList.add("hidden");
    videoPreviewWrap.classList.remove("hidden");

    scanBtn.disabled = false;
    scanBtnText.textContent = "Scan Video";
    filenameDisplay.textContent = file.name + "  •  " + formatBytes(file.size);

    resetResultPanel();
  }

  function handleSingleFile(file) {
    selectedBatchFiles = [];
    selectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      selectedFileDataUrl = e.target.result;
      previewImage.src = selectedFileDataUrl;
      dropzoneContent.classList.add("hidden");
      previewWrap.classList.remove("hidden");
      batchPreviewWrap.classList.add("hidden");
      scanBtn.disabled = false;
      scanBtnText.textContent = "Scan Image";
      filenameDisplay.textContent = file.name + "  •  " + formatBytes(file.size);
    };
    reader.readAsDataURL(file);

    resetResultPanel();
  }

  function handleBatchFiles(files) {
    selectedFile = null;
    selectedFileDataUrl = null;

    let loaded = 0;
    selectedBatchFiles = files.map((file) => ({ file, dataUrl: null }));

    files.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        selectedBatchFiles[idx].dataUrl = e.target.result;
        loaded += 1;
        if (loaded === files.length) {
          renderBatchThumbs();
        }
      };
      reader.readAsDataURL(file);
    });

    dropzoneContent.classList.add("hidden");
    previewWrap.classList.add("hidden");
    batchPreviewWrap.classList.remove("hidden");
    scanBtn.disabled = false;
    scanBtnText.textContent = "Scan All (" + files.length + ")";
    filenameDisplay.textContent = files.length + " images selected  •  " +
      formatBytes(files.reduce((sum, f) => sum + f.size, 0)) + " total";
    batchCountLabel.textContent = files.length + " images selected";

    renderBatchThumbs();
    resetResultPanel();
  }

  function renderBatchThumbs() {
    batchThumbs.innerHTML = selectedBatchFiles
      .map((item, idx) => {
        const imgSrc = item.dataUrl || "";
        return (
          '<div class="batch-thumb" data-idx="' + idx + '">' +
          (imgSrc ? '<img src="' + imgSrc + '" alt="" />' : "") +
          '<span class="batch-thumb-name">' + escapeHtml(item.file.name) + "</span>" +
          '<button class="batch-thumb-remove" data-idx="' + idx + '" aria-label="Remove">✕</button>' +
          "</div>"
        );
      })
      .join("");

    batchThumbs.querySelectorAll(".batch-thumb-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute("data-idx"));
        selectedBatchFiles.splice(idx, 1);
        if (selectedBatchFiles.length === 0) {
          resetUpload();
        } else {
          batchCountLabel.textContent = selectedBatchFiles.length + " images selected";
          scanBtnText.textContent = "Scan All (" + selectedBatchFiles.length + ")";
          renderBatchThumbs();
        }
      });
    });
  }

  function resetUpload() {
    selectedFile = null;
    selectedFileDataUrl = null;
    selectedBatchFiles = [];
    if (selectedVideoObjectUrl) {
      URL.revokeObjectURL(selectedVideoObjectUrl);
      selectedVideoObjectUrl = null;
    }
    selectedVideoFile = null;
    fileInput.value = "";
    previewImage.src = "";
    previewVideo.src = "";
    dropzoneContent.classList.remove("hidden");
    previewWrap.classList.add("hidden");
    videoPreviewWrap.classList.add("hidden");
    batchPreviewWrap.classList.add("hidden");
    batchThumbs.innerHTML = "";
    scanBtn.disabled = true;
    scanBtnText.textContent = "Scan Image";
    filenameDisplay.textContent = "";
    resetResultPanel();
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  /* ------------------------------------------------------------------ */
  /* Result Panel States                                                  */
  /* ------------------------------------------------------------------ */

  const ALL_RESULT_PANELS = [
    resultEmpty, resultLoading, resultContent, resultError,
    batchResultLoading, batchResultContent,
    videoResultLoading, videoResultContent,
  ];

  function hideAllResultPanels() {
    ALL_RESULT_PANELS.forEach((el) => el.classList.add("hidden"));
  }

  function resetResultPanel() {
    hideAllResultPanels();
    resultEmpty.classList.remove("hidden");
  }

  function showLoadingPanel() {
    hideAllResultPanels();
    resultLoading.classList.remove("hidden");
  }

  function showResultPanel() {
    hideAllResultPanels();
    resultContent.classList.remove("hidden");
  }

  function showErrorPanel(message) {
    hideAllResultPanels();
    resultError.classList.remove("hidden");
    errorText.textContent = message;
  }

  function showBatchLoadingPanel(text) {
    hideAllResultPanels();
    batchResultLoading.classList.remove("hidden");
    batchLoadingText.textContent = text || "Scanning batch…";
  }

  function showBatchResultPanel() {
    hideAllResultPanels();
    batchResultContent.classList.remove("hidden");
  }

  function showVideoLoadingPanel(text) {
    hideAllResultPanels();
    videoResultLoading.classList.remove("hidden");
    videoLoadingText.textContent = text || "Sampling and analyzing video frames…";
  }

  function showVideoResultPanel() {
    hideAllResultPanels();
    videoResultContent.classList.remove("hidden");
  }

  /* ------------------------------------------------------------------ */
  /* Scan                                                                 */
  /* ------------------------------------------------------------------ */

  scanBtn.addEventListener("click", async () => {
    if (selectedVideoFile) {
      await runVideoScan();
    } else if (selectedBatchFiles.length > 0) {
      await runBatchScan();
    } else if (selectedFile) {
      await runSingleScan();
    }
  });

  async function runSingleScan() {
    scanBtn.disabled = true;
    scanBtnText.textContent = "Scanning…";
    showLoadingPanel();

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const apiUrl = getApiUrl();
      const response = await fetch(apiUrl + "/scan", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let msg = "The server returned an error (status " + response.status + ").";
        try {
          const errJson = await response.json();
          if (errJson && errJson.error) msg = errJson.error;
        } catch (_) {}
        throw new Error(msg);
      }

      const data = await response.json();
      displayResult(data);
      addToHistory(data);
    } catch (err) {
      console.error(err);
      let msg = err.message || "Unable to reach the DeepShield backend.";
      if (err.name === "TypeError") {
        msg = "Unable to reach the DeepShield backend. Check that the API URL in Settings is correct and the server is running.";
      }
      showErrorPanel(msg);
    } finally {
      scanBtn.disabled = false;
      scanBtnText.textContent = "Scan Image";
    }
  }

  async function runBatchScan() {
    const count = selectedBatchFiles.length;
    scanBtn.disabled = true;
    scanBtnText.textContent = "Scanning…";
    showBatchLoadingPanel("Scanning " + count + " image" + (count === 1 ? "" : "s") + "…");

    try {
      const formData = new FormData();
      selectedBatchFiles.forEach((item) => formData.append("files", item.file));

      const apiUrl = getApiUrl();
      const response = await fetch(apiUrl + "/scan-batch", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let msg = "The server returned an error (status " + response.status + ").";
        try {
          const errJson = await response.json();
          if (errJson && errJson.error) msg = errJson.error;
        } catch (_) {}
        throw new Error(msg);
      }

      const data = await response.json();
      displayBatchResults(data.results || []);
    } catch (err) {
      console.error(err);
      let msg = err.message || "Unable to reach the DeepShield backend.";
      if (err.name === "TypeError") {
        msg = "Unable to reach the DeepShield backend. Check that the API URL in Settings is correct and the server is running.";
      }
      showErrorPanel(msg);
    } finally {
      scanBtn.disabled = false;
      scanBtnText.textContent = "Scan All (" + count + ")";
    }
  }

  function displayBatchResults(results) {
    lastBatchResults = results;

    // Attach thumbnails (from the local preview data URLs) by matching
    // filenames back to the originally selected files, best-effort.
    results.forEach((r) => {
      const match = selectedBatchFiles.find((item) => item.file.name === r.filename);
      r._thumb = match ? match.dataUrl : null;
    });

    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    const realCount = succeeded.filter((r) => String(r.result).toUpperCase() === "REAL").length;
    const fakeCount = succeeded.length - realCount;

    batchStatTotal.textContent = results.length;
    batchStatReal.textContent = realCount;
    batchStatFake.textContent = fakeCount;
    batchStatErrors.textContent = failed.length;

    batchResultsBody.innerHTML = results
      .map((r) => {
        const thumb = r._thumb
          ? '<img class="batch-row-thumb" src="' + r._thumb + '" alt="" />'
          : '<div class="batch-row-thumb"></div>';

        if (r.error) {
          return (
            "<tr>" +
            "<td>" + thumb + "</td>" +
            "<td>" + escapeHtml(r.filename || "unknown") + "</td>" +
            '<td><span class="result-pill error">⚠ Error</span></td>' +
            "<td>" + escapeHtml(r.error) + "</td>" +
            "</tr>"
          );
        }

        const isReal = String(r.result).toUpperCase() === "REAL";
        const pillClass = isReal ? "real" : "fake";
        const pillLabel = isReal ? "✅ REAL" : "🚫 FAKE";
        const confidence = Number(r.confidence) || 0;

        return (
          "<tr>" +
          "<td>" + thumb + "</td>" +
          "<td>" + escapeHtml(r.filename || "unknown") + "</td>" +
          '<td><span class="result-pill ' + pillClass + '">' + pillLabel + "</span></td>" +
          "<td>" + confidence.toFixed(2) + "%</td>" +
          "</tr>"
        );
      })
      .join("");

    // Record each successful result in scan history too.
    succeeded.forEach((r) => {
      addToHistory(r, r._thumb);
    });

    showBatchResultPanel();
  }

  batchScanAnotherBtn.addEventListener("click", () => {
    resetUpload();
  });

  async function runVideoScan() {
    scanBtn.disabled = true;
    scanBtnText.textContent = "Scanning…";
    showVideoLoadingPanel("Sampling frames and analyzing " + selectedVideoFile.name + "…");

    try {
      const formData = new FormData();
      formData.append("file", selectedVideoFile);

      const apiUrl = getApiUrl();
      const response = await fetch(apiUrl + "/scan-video", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let msg = "The server returned an error (status " + response.status + ").";
        try {
          const errJson = await response.json();
          if (errJson && errJson.error) msg = errJson.error;
        } catch (_) {}
        throw new Error(msg);
      }

      const data = await response.json();
      displayVideoResults(data);
      addToHistory(
        {
          filename: data.filename,
          result: data.result,
          confidence: data.confidence,
          explanation: data.explanation,
        },
        null
      );
    } catch (err) {
      console.error(err);
      let msg = err.message || "Unable to reach the DeepShield backend.";
      if (err.name === "TypeError") {
        msg = "Unable to reach the DeepShield backend. Check that the API URL in Settings is correct and the server is running.";
      }
      showErrorPanel(msg);
    } finally {
      scanBtn.disabled = false;
      scanBtnText.textContent = "Scan Video";
    }
  }

  function displayVideoResults(data) {
    lastVideoResult = data;

    const isReal = String(data.result).toUpperCase() === "REAL";
    const confidence = Number(data.confidence) || 0;
    const fakeRatio = Number(data.fake_frame_ratio) || 0;
    const frames = data.frame_results || [];

    videoVerdictBadge.className = "verdict-badge " + (isReal ? "real" : "fake");
    videoVerdictLabel.textContent = isReal ? "✅ REAL" : "🚫 FAKE";

    videoConfidenceValue.textContent = confidence.toFixed(2) + "%";
    videoConfidenceFill.className = "confidence-fill " + (isReal ? "real" : "fake");
    requestAnimationFrame(() => {
      videoConfidenceFill.style.width = Math.min(confidence, 100) + "%";
    });

    videoStatFrames.textContent = data.frames_analyzed || 0;
    videoStatFakeFrames.textContent = Math.round(fakeRatio * (data.frames_analyzed || 0));
    videoStatFakeRatio.textContent = (fakeRatio * 100).toFixed(0) + "%";

    videoExplanationText.textContent = data.explanation || "No further explanation was provided by the model.";

    videoFrameResultsBody.innerHTML = frames
      .map((f) => {
        const ts = f.timestamp_seconds != null ? f.timestamp_seconds.toFixed(2) + "s" : "—";
        if (f.error) {
          return (
            "<tr>" +
            "<td>#" + f.frame_index + "</td>" +
            "<td>" + ts + "</td>" +
            '<td><span class="result-pill error">⚠ Error</span></td>' +
            "<td>" + escapeHtml(f.error) + "</td>" +
            "</tr>"
          );
        }
        const isFrameReal = String(f.result).toUpperCase() === "REAL";
        const pillClass = isFrameReal ? "real" : "fake";
        const pillLabel = isFrameReal ? "✅ REAL" : "🚫 FAKE";
        return (
          "<tr>" +
          "<td>#" + f.frame_index + "</td>" +
          "<td>" + ts + "</td>" +
          '<td><span class="result-pill ' + pillClass + '">' + pillLabel + "</span></td>" +
          "<td>" + Number(f.confidence).toFixed(2) + "%</td>" +
          "</tr>"
        );
      })
      .join("");

    showVideoResultPanel();
  }

  videoScanAnotherBtn.addEventListener("click", () => {
    resetUpload();
  });

  /* ------------------------------------------------------------------ */
  /* URL Scan                                                            */
  /* ------------------------------------------------------------------ */

  function hideAllUrlPanels() {
    [urlResultEmpty, urlResultLoading, urlResultError, urlResultContent].forEach((el) =>
      el.classList.add("hidden")
    );
  }

  function showUrlEmptyPanel() {
    hideAllUrlPanels();
    urlResultEmpty.classList.remove("hidden");
  }

  function showUrlLoadingPanel(text) {
    hideAllUrlPanels();
    urlResultLoading.classList.remove("hidden");
    urlLoadingText.textContent = text || "Fetching and analyzing page…";
  }

  function showUrlErrorPanel(message) {
    hideAllUrlPanels();
    urlResultError.classList.remove("hidden");
    urlErrorText.textContent = message;
  }

  function showUrlResultPanel() {
    hideAllUrlPanels();
    urlResultContent.classList.remove("hidden");
  }

  async function runUrlScan() {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
      urlInput.focus();
      return;
    }

    urlScanBtn.disabled = true;
    urlScanBtn.textContent = "Scanning…";
    showUrlLoadingPanel("Fetching " + rawUrl + "…");

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(apiUrl + "/scan-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: rawUrl }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "The server returned an error (status " + response.status + ").");
      }

      displayUrlResult(data);
    } catch (err) {
      console.error(err);
      let msg = err.message || "Unable to reach the DeepShield backend.";
      if (err.name === "TypeError") {
        msg = "Unable to reach the DeepShield backend. Check that the API URL in Settings is correct and the server is running.";
      }
      showUrlErrorPanel(msg);
    } finally {
      urlScanBtn.disabled = false;
      urlScanBtn.textContent = "Scan URL";
    }
  }

  function displayUrlResult(data) {
    lastUrlResult = data;

    const risk = (data.risk_level || "low").toLowerCase();
    urlRiskBadge.className = "risk-badge " + risk;
    urlRiskBadge.textContent = risk + " risk";

    urlDomain.textContent = data.domain || data.url || "unknown";
    urlPageTitle.textContent = data.page_title || "";

    urlHttpsBadge.textContent = data.is_https ? "🔒 HTTPS" : "⚠ Not HTTPS";
    urlHttpsBadge.className = "https-badge" + (data.is_https ? "" : " insecure");

    const flags = data.heuristic_flags || [];
    if (flags.length === 0) {
      urlFlagsWrap.innerHTML = '<div class="url-flag-item none">✅ No suspicious URL patterns detected.</div>';
    } else {
      urlFlagsWrap.innerHTML = flags
        .map((f) => '<div class="url-flag-item">⚠ ' + escapeHtml(f) + "</div>")
        .join("");
    }

    const images = data.images_scanned || [];
    urlStatImages.textContent = data.images_found || 0;
    urlStatScanned.textContent = data.scanned_image_count || 0;
    urlStatFake.textContent = data.fake_image_count || 0;

    urlImagesBody.innerHTML = images
      .map((img) => {
        const thumb = '<img class="url-image-thumb" src="' + escapeAttr(img.image_url) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'" />';
        const shortUrl = img.image_url && img.image_url.length > 60
          ? img.image_url.slice(0, 57) + "…"
          : (img.image_url || "");
        const linkCell = '<a class="url-image-link" href="' + escapeAttr(img.image_url || "#") + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(shortUrl) + "</a>";

        if (img.error) {
          return (
            "<tr><td>" + thumb + "</td><td>" + linkCell + '</td><td><span class="result-pill error">⚠ Error</span></td><td>' +
            escapeHtml(img.error) + "</td></tr>"
          );
        }

        const isReal = String(img.result).toUpperCase() === "REAL";
        const pillClass = isReal ? "real" : "fake";
        const pillLabel = isReal ? "✅ REAL" : "🚫 FAKE";
        const confidence = Number(img.confidence) || 0;

        return (
          "<tr><td>" + thumb + "</td><td>" + linkCell + '</td><td><span class="result-pill ' + pillClass + '">' +
          pillLabel + "</span></td><td>" + confidence.toFixed(2) + "%</td></tr>"
        );
      })
      .join("");

    // Log each successfully-scanned page image to history too.
    images
      .filter((img) => !img.error)
      .forEach((img) => {
        addToHistory(
          {
            filename: img.image_url,
            result: img.result,
            confidence: img.confidence,
            explanation: img.explanation,
          },
          img.image_url
        );
      });

    showUrlResultPanel();
  }

  urlScanBtn.addEventListener("click", runUrlScan);
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runUrlScan();
  });

  urlScanAnotherBtn.addEventListener("click", () => {
    urlInput.value = "";
    lastUrlResult = null;
    showUrlEmptyPanel();
    urlInput.focus();
  });

  urlDownloadBtn.addEventListener("click", () => {
    if (!lastUrlResult) return;

    const ctx = newPdfDoc("URL Scan Report");
    pdfKeyValue(ctx, "URL", lastUrlResult.url || "unknown");
    pdfKeyValue(ctx, "Domain", lastUrlResult.domain || "unknown");
    pdfKeyValue(ctx, "HTTPS", lastUrlResult.is_https ? "Yes" : "No");
    pdfKeyValue(ctx, "Risk level", (lastUrlResult.risk_level || "low").toUpperCase());
    pdfKeyValue(ctx, "Images found", String(lastUrlResult.images_found || 0));
    pdfKeyValue(ctx, "Images scanned", String(lastUrlResult.scanned_image_count || 0));
    pdfKeyValue(ctx, "Flagged fake", String(lastUrlResult.fake_image_count || 0));
    pdfKeyValue(ctx, "Generated at", new Date().toLocaleString());

    pdfSectionTitle(ctx, "URL Pattern Flags");
    const flags = lastUrlResult.heuristic_flags || [];
    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setFontSize(10.5);
    ctx.doc.setTextColor(50, 50, 60);
    if (flags.length === 0) {
      ctx.doc.text("No suspicious URL patterns detected.", ctx.marginX, ctx.y);
      ctx.y += 16;
    } else {
      flags.forEach((f) => {
        if (ctx.y > 770) {
          ctx.doc.addPage();
          ctx.y = 56;
        }
        const lines = ctx.doc.splitTextToSize("- " + pdfSafeText(f), ctx.pageWidth - ctx.marginX * 2);
        ctx.doc.text(lines, ctx.marginX, ctx.y);
        ctx.y += lines.length * 13 + 4;
      });
    }

    pdfSectionTitle(ctx, "Images Scanned");
    (lastUrlResult.images_scanned || []).forEach((img, idx) => {
      if (ctx.y > 760) {
        ctx.doc.addPage();
        ctx.y = 56;
      }
      ctx.doc.setFont("helvetica", "bold");
      ctx.doc.setFontSize(10);
      ctx.doc.setTextColor(30, 30, 40);
      const urlLines = ctx.doc.splitTextToSize((idx + 1) + ". " + pdfSafeText(img.image_url || ""), ctx.pageWidth - ctx.marginX * 2);
      ctx.doc.text(urlLines, ctx.marginX, ctx.y);
      ctx.y += urlLines.length * 13;

      ctx.doc.setFont("helvetica", "normal");
      ctx.doc.setFontSize(9.5);
      ctx.doc.setTextColor(90, 90, 100);
      const line = img.error
        ? "Error: " + pdfSafeText(img.error)
        : "Result: " + img.result + "  -  Confidence: " + Number(img.confidence).toFixed(2) + "%";
      ctx.doc.text(line, ctx.marginX + 10, ctx.y);
      ctx.y += 16;
    });

    pdfFooter(ctx);
    ctx.doc.save("deepshield-url-report-" + Date.now() + ".pdf");
  });

  function escapeAttr(str) {
    return String(str || "").replace(/"/g, "&quot;");
  }

  function displayResult(data) {
    lastResult = data;

    const isReal = String(data.result).toUpperCase() === "REAL";
    const confidence = Number(data.confidence) || 0;

    verdictBadge.className = "verdict-badge " + (isReal ? "real" : "fake");
    verdictLabel.textContent = isReal ? "✅ REAL" : "🚫 FAKE";

    confidenceValue.textContent = confidence.toFixed(2) + "%";
    confidenceFill.className = "confidence-fill " + (isReal ? "real" : "fake");
    requestAnimationFrame(() => {
      confidenceFill.style.width = Math.min(confidence, 100) + "%";
    });

    detailFilename.textContent = data.filename || (selectedFile ? selectedFile.name : "—");
    detailTimestamp.textContent = new Date().toLocaleString();
    explanationText.textContent = data.explanation || "No further explanation was provided by the model.";

    showResultPanel();
  }

  scanAnotherBtn.addEventListener("click", () => {
    resetUpload();
  });

  /* ------------------------------------------------------------------ */
  /* PDF Report Export                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * jsPDF's built-in fonts (Helvetica etc.) only support the WinAnsi/cp1252
   * character set. Emoji and many symbol characters (🛡 ✅ 🚫 ⚠ 🔒 …) fall
   * outside that and render as garbled bytes instead of throwing an error.
   * Strip them before any text reaches doc.text()/splitTextToSize().
   */
  function pdfSafeText(str) {
    return String(str == null ? "" : str)
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, "") // emoji: faces, symbols, transport, etc. (astral plane)
      .replace(/[\u2600-\u27BF]/g, "")        // misc symbols & dingbats (✅ ⚠ ☀ ✕ …)
      .replace(/[\u2B00-\u2BFF]/g, "")        // misc symbols and arrows
      .replace(/\uFE0F/g, "")                  // variation selector-16
      .replace(/ {2,}/g, " ")
      .trim();
  }

  function newPdfDoc(title) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 48;
    let y = 56;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(20, 20, 30);
    doc.text("DeepShield AI v3", marginX, y);
    y += 20;

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 100);
    doc.text(pdfSafeText(title), marginX, y);
    y += 10;

    doc.setDrawColor(210, 210, 220);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 22;

    return { doc, pageWidth, marginX, y };
  }

  function pdfKeyValue(ctx, key, value) {
    const lineHeight = 18;
    if (ctx.y > 760) {
      ctx.doc.addPage();
      ctx.y = 56;
    }
    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setFontSize(10);
    ctx.doc.setTextColor(110, 110, 120);
    ctx.doc.text(pdfSafeText(String(key).toUpperCase()), ctx.marginX, ctx.y);
    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setFontSize(11);
    ctx.doc.setTextColor(30, 30, 40);
    const lines = ctx.doc.splitTextToSize(pdfSafeText(value), ctx.pageWidth - ctx.marginX * 2 - 130);
    ctx.doc.text(lines, ctx.marginX + 130, ctx.y);
    ctx.y += Math.max(lineHeight, lines.length * 14);
  }

  function pdfSectionTitle(ctx, text) {
    if (ctx.y > 740) {
      ctx.doc.addPage();
      ctx.y = 56;
    }
    ctx.y += 8;
    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setFontSize(13);
    ctx.doc.setTextColor(20, 20, 30);
    ctx.doc.text(pdfSafeText(text), ctx.marginX, ctx.y);
    ctx.y += 16;
  }

  function pdfFooter(ctx) {
    const pageCount = ctx.doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      ctx.doc.setPage(i);
      ctx.doc.setFont("helvetica", "normal");
      ctx.doc.setFontSize(8);
      ctx.doc.setTextColor(150, 150, 160);
      ctx.doc.text(
        "Generated by DeepShield AI v3  -  " + new Date().toLocaleString(),
        ctx.marginX,
        820
      );
      ctx.doc.text(String(i) + " / " + pageCount, ctx.pageWidth - ctx.marginX - 24, 820);
    }
  }

  downloadBtn.addEventListener("click", () => {
    if (!lastResult) return;

    const ctx = newPdfDoc("Single Image Scan Report");
    pdfKeyValue(ctx, "Filename", lastResult.filename || "unknown");
    pdfKeyValue(ctx, "Result", lastResult.result);
    pdfKeyValue(ctx, "Confidence", Number(lastResult.confidence).toFixed(2) + "%");
    pdfKeyValue(ctx, "Scanned at", new Date().toLocaleString());
    pdfKeyValue(ctx, "Model", "EfficientNet-B0 (DeepShield AI v3)");

    pdfSectionTitle(ctx, "Explanation");
    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setFontSize(11);
    ctx.doc.setTextColor(50, 50, 60);
    const explLines = ctx.doc.splitTextToSize(
      pdfSafeText(lastResult.explanation || "No further explanation was provided by the model."),
      ctx.pageWidth - ctx.marginX * 2
    );
    ctx.doc.text(explLines, ctx.marginX, ctx.y);
    ctx.y += explLines.length * 14;

    pdfFooter(ctx);
    ctx.doc.save("deepshield-report-" + Date.now() + ".pdf");
  });

  batchDownloadBtn.addEventListener("click", () => {
    if (!lastBatchResults || lastBatchResults.length === 0) return;

    const ctx = newPdfDoc("Batch Scan Report — " + lastBatchResults.length + " images");
    const succeeded = lastBatchResults.filter((r) => !r.error);
    const realCount = succeeded.filter((r) => String(r.result).toUpperCase() === "REAL").length;
    const fakeCount = succeeded.length - realCount;

    pdfKeyValue(ctx, "Total scanned", String(lastBatchResults.length));
    pdfKeyValue(ctx, "Real", String(realCount));
    pdfKeyValue(ctx, "Fake", String(fakeCount));
    pdfKeyValue(ctx, "Failed", String(lastBatchResults.length - succeeded.length));
    pdfKeyValue(ctx, "Generated at", new Date().toLocaleString());

    pdfSectionTitle(ctx, "Per-Image Results");

    lastBatchResults.forEach((r, idx) => {
      if (ctx.y > 760) {
        ctx.doc.addPage();
        ctx.y = 56;
      }
      ctx.doc.setFont("helvetica", "bold");
      ctx.doc.setFontSize(10.5);
      ctx.doc.setTextColor(30, 30, 40);
      ctx.doc.text(pdfSafeText((idx + 1) + ". " + (r.filename || "unknown")), ctx.marginX, ctx.y);
      ctx.y += 14;

      ctx.doc.setFont("helvetica", "normal");
      ctx.doc.setFontSize(10);
      ctx.doc.setTextColor(90, 90, 100);
      const line = r.error
        ? "Error: " + pdfSafeText(r.error)
        : "Result: " + r.result + "  -  Confidence: " + Number(r.confidence).toFixed(2) + "%";
      const lines = ctx.doc.splitTextToSize(line, ctx.pageWidth - ctx.marginX * 2 - 12);
      ctx.doc.text(lines, ctx.marginX + 12, ctx.y);
      ctx.y += lines.length * 13 + 8;
    });

    pdfFooter(ctx);
    ctx.doc.save("deepshield-batch-report-" + Date.now() + ".pdf");
  });

  videoDownloadBtn.addEventListener("click", () => {
    if (!lastVideoResult) return;

    const ctx = newPdfDoc("Video Scan Report");
    pdfKeyValue(ctx, "Filename", lastVideoResult.filename || "unknown");
    pdfKeyValue(ctx, "Overall result", lastVideoResult.result);
    pdfKeyValue(ctx, "Overall confidence", Number(lastVideoResult.confidence).toFixed(2) + "%");
    pdfKeyValue(ctx, "Frames analyzed", String(lastVideoResult.frames_analyzed || 0));
    pdfKeyValue(ctx, "Fake frame ratio", ((Number(lastVideoResult.fake_frame_ratio) || 0) * 100).toFixed(0) + "%");
    pdfKeyValue(ctx, "Scanned at", new Date().toLocaleString());
    pdfKeyValue(ctx, "Model", "EfficientNet-B0 per-frame sampling (DeepShield AI v3)");

    pdfSectionTitle(ctx, "Explanation");
    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setFontSize(11);
    ctx.doc.setTextColor(50, 50, 60);
    const explLines = ctx.doc.splitTextToSize(
      pdfSafeText(lastVideoResult.explanation || "No further explanation was provided by the model."),
      ctx.pageWidth - ctx.marginX * 2
    );
    ctx.doc.text(explLines, ctx.marginX, ctx.y);
    ctx.y += explLines.length * 14 + 8;

    pdfSectionTitle(ctx, "Per-Frame Results");
    (lastVideoResult.frame_results || []).forEach((f) => {
      if (ctx.y > 770) {
        ctx.doc.addPage();
        ctx.y = 56;
      }
      const ts = f.timestamp_seconds != null ? f.timestamp_seconds.toFixed(2) + "s" : "-";
      ctx.doc.setFont("helvetica", "normal");
      ctx.doc.setFontSize(10);
      ctx.doc.setTextColor(50, 50, 60);
      const line = f.error
        ? "Frame #" + f.frame_index + " (" + ts + "): Error - " + pdfSafeText(f.error)
        : "Frame #" + f.frame_index + " (" + ts + "): " + f.result + " - " + Number(f.confidence).toFixed(2) + "%";
      ctx.doc.text(line, ctx.marginX, ctx.y);
      ctx.y += 14;
    });

    pdfFooter(ctx);
    ctx.doc.save("deepshield-video-report-" + Date.now() + ".pdf");
  });

  /* ------------------------------------------------------------------ */
  /* History                                                              */
  /* ------------------------------------------------------------------ */

  function addToHistory(data, thumbOverride) {
    history.unshift({
      filename: data.filename || (selectedFile ? selectedFile.name : "unknown"),
      result: data.result,
      confidence: Number(data.confidence) || 0,
      explanation: data.explanation || "",
      timestamp: Date.now(),
      thumb: thumbOverride !== undefined ? thumbOverride : (selectedFileDataUrl || null),
    });

    if (history.length > 100) history = history.slice(0, 100);
    saveHistory();
    updateStats();
  }

  function renderHistoryTable() {
    if (history.length === 0) {
      historyTableBody.innerHTML =
        '<tr class="history-empty-row"><td colspan="5">No scans yet. Your history will appear here.</td></tr>';
      return;
    }

    historyTableBody.innerHTML = history
      .map((item, idx) => {
        const isReal = String(item.result).toUpperCase() === "REAL";
        const thumbHtml = item.thumb
          ? '<img class="history-thumb" src="' + item.thumb + '" alt="" />'
          : "";
        return (
          "<tr>" +
          '<td style="display:flex;align-items:center;">' +
          thumbHtml +
          escapeHtml(item.filename) +
          "</td>" +
          '<td><span class="result-pill ' +
          (isReal ? "real" : "fake") +
          '">' +
          item.result +
          "</span></td>" +
          "<td>" +
          item.confidence.toFixed(2) +
          "%</td>" +
          "<td>" +
          new Date(item.timestamp).toLocaleString() +
          "</td>" +
          '<td><button class="history-download-btn" data-idx="' +
          idx +
          '">⬇</button></td>' +
          "</tr>"
        );
      })
      .join("");

    historyTableBody.querySelectorAll(".history-download-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-idx"));
        const item = history[idx];
        const report = [
          "DeepShield AI v3 — Scan Report",
          "================================",
          "Filename: " + item.filename,
          "Result: " + item.result,
          "Confidence: " + item.confidence.toFixed(2) + "%",
          "Explanation: " + item.explanation,
          "Scanned at: " + new Date(item.timestamp).toLocaleString(),
        ].join("\n");
        const blob = new Blob([report], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "deepshield-report-" + item.timestamp + ".txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  clearHistoryBtn.addEventListener("click", () => {
    if (history.length === 0) return;
    if (confirm("Clear all scan history? This cannot be undone.")) {
      history = [];
      saveHistory();
      renderHistoryTable();
      updateStats();
      renderAnalytics();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Stats                                                                */
  /* ------------------------------------------------------------------ */

  function updateStats() {
    const total = history.length;
    const realCount = history.filter((h) => String(h.result).toUpperCase() === "REAL").length;
    const fakeCount = total - realCount;
    const avgConf = total > 0
      ? history.reduce((sum, h) => sum + h.confidence, 0) / total
      : 0;

    statTotal.textContent = total;
    statReal.textContent = realCount;
    statFake.textContent = fakeCount;
    statAvgConf.textContent = avgConf.toFixed(1) + "%";
  }

  /* ------------------------------------------------------------------ */
  /* Analytics                                                            */
  /* ------------------------------------------------------------------ */

  function renderAnalytics() {
    const total = history.length;
    const realCount = history.filter((h) => String(h.result).toUpperCase() === "REAL").length;
    const fakeCount = total - realCount;

    donutTotal.textContent = total;

    const circumference = 2 * Math.PI * 50;
    if (total === 0) {
      donutReal.setAttribute("stroke-dasharray", "0 " + circumference);
      donutFake.setAttribute("stroke-dasharray", "0 " + circumference);
    } else {
      const realLen = (realCount / total) * circumference;
      const fakeLen = (fakeCount / total) * circumference;
      donutReal.setAttribute("stroke-dasharray", realLen + " " + circumference);
      donutReal.setAttribute("stroke-dashoffset", "0");
      donutFake.setAttribute("stroke-dasharray", fakeLen + " " + circumference);
      donutFake.setAttribute("stroke-dashoffset", (-realLen).toString());
    }

    if (total === 0) {
      barsWrap.innerHTML = '<p class="chart-empty">Scan images to see confidence trends here.</p>';
      return;
    }

    const recent = history.slice(0, 12).reverse();
    barsWrap.innerHTML = recent
      .map((item) => {
        const isReal = String(item.result).toUpperCase() === "REAL";
        const height = Math.max(item.confidence, 4);
        return (
          '<div class="bar ' +
          (isReal ? "" : "fake-bar") +
          '" style="height:' +
          height +
          '%" title="' +
          escapeHtml(item.filename) +
          ": " +
          item.confidence.toFixed(1) +
          '%"></div>'
        );
      })
      .join("");
  }

  /* ------------------------------------------------------------------ */
  /* Settings                                                             */
  /* ------------------------------------------------------------------ */

  saveApiUrlBtn.addEventListener("click", () => {
    const url = apiUrlInput.value.trim();
    if (!url) {
      apiUrlSaveStatus.textContent = "Please enter a valid URL.";
      apiUrlSaveStatus.className = "settings-status error";
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      apiUrlSaveStatus.textContent = "URL must start with http:// or https://";
      apiUrlSaveStatus.className = "settings-status error";
      return;
    }
    setApiUrl(url);
    apiUrlSaveStatus.textContent = "Saved! DeepShield will now use this backend URL.";
    apiUrlSaveStatus.className = "settings-status success";
    checkApiStatus();
  });

  testConnectionBtn.addEventListener("click", async () => {
    testConnectionStatus.textContent = "Testing connection…";
    testConnectionStatus.className = "settings-status";
    const url = apiUrlInput.value.trim() || getApiUrl();
    try {
      const res = await fetch(url.replace(/\/+$/, "") + "/", { method: "GET" });
      if (res.ok) {
        const json = await res.json();
        testConnectionStatus.textContent = "✅ Connected: " + (json.status || "OK");
        testConnectionStatus.className = "settings-status success";
      } else {
        testConnectionStatus.textContent = "⚠️ Server responded with status " + res.status;
        testConnectionStatus.className = "settings-status error";
      }
    } catch (e) {
      testConnectionStatus.textContent = "❌ Could not reach the backend. Check the URL and CORS settings.";
      testConnectionStatus.className = "settings-status error";
    }
  });

  animToggle.addEventListener("change", () => {
    const enabled = animToggle.checked;
    localStorage.setItem(STORAGE_KEYS.animToggle, enabled ? "1" : "0");
    document.body.classList.toggle("no-anim", !enabled);
  });

  /* ------------------------------------------------------------------ */
  /* API Status Pill (checked on load)                                    */
  /* ------------------------------------------------------------------ */

  async function checkApiStatus() {
    statusDot.className = "status-dot";
    statusText.textContent = "Checking API…";
    try {
      const res = await fetch(getApiUrl() + "/", { method: "GET" });
      if (res.ok) {
        statusDot.classList.add("online");
        statusText.textContent = "API Online";
      } else {
        statusDot.classList.add("offline");
        statusText.textContent = "API Error";
      }
    } catch (e) {
      statusDot.classList.add("offline");
      statusText.textContent = "API Offline";
    }
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                 */
  /* ------------------------------------------------------------------ */

  function init() {
    apiUrlInput.value = getApiUrl();

    const animSaved = localStorage.getItem(STORAGE_KEYS.animToggle);
    if (animSaved === "0") {
      animToggle.checked = false;
      document.body.classList.add("no-anim");
    }

    updateStats();
    checkApiStatus();
  }

  init();
})();
