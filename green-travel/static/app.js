// ══════════════════════════════════════════════════════
// 碳索世界 綠遨遊 — 前端主程式
// ══════════════════════════════════════════════════════

const API = "http://127.0.0.1:8000";

// ── 環保認證店家（由後端即時抓取政府資料）────────────────

// ── 狀態管理 ──────────────────────────────────────────
const state = {
  currentTrip: {
    origin: "", destination: "",
    transport: null,
    hotel: null,
    food: [],
    spots: [],
    city: "",
    startTime: null,
    startDate: "", endDate: "",
  },
  history: JSON.parse(localStorage.getItem("tripHistory") || "[]"),
  achievements: JSON.parse(localStorage.getItem("achievements") || JSON.stringify({
    greenTravel: 0, saveMoney: 0, trainRider: 0,
    treeHero: 0, vegHero: 0, ecoHotel: 0,
    partnerHotel: 0, partnerFood: 0, treeAngel: 0,
  })),
  points: parseInt(localStorage.getItem("points") || "0"),
  sortBy: "carbon",
  currentOptions: [],
};

// ── 畫面切換 ──────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n => {
    n.classList.toggle("active", n.dataset.screen === id);
  });
  window.scrollTo(0, 0);
  if (id === "shop") renderShop();
}

// ── 登入 ──────────────────────────────────────────────
const DEMO_USER = "1234", DEMO_PASS = "1234";
let currentUser = null;

function doLogin() {
  const u = document.getElementById("login-user").value.trim();
  const p = document.getElementById("login-pass").value;
  const err = document.getElementById("login-err");
  if (u === DEMO_USER && p === DEMO_PASS) {
    currentUser = u;
    err.textContent = "";
    showScreen("splash");
  } else {
    err.textContent = "帳號或密碼錯誤，請重試";
    document.getElementById("login-pass").value = "";
  }
}

function doLogout() {
  currentUser = null;
  showScreen("login");
}

function startApp() {
  showScreen("home");
  renderProfile();
}

function initIntroSlider() {
  const slidesEl = document.getElementById("intro-slides");
  const dotsEl   = document.getElementById("intro-dots");
  if (!slidesEl || !dotsEl) return;
  const count = slidesEl.children.length;
  dotsEl.innerHTML = Array.from({ length: count }, (_, i) =>
    `<div class="intro-dot ${i === 0 ? "active" : ""}" onclick="goSlide(${i})"></div>`
  ).join("");
  slidesEl.addEventListener("scroll", () => {
    const idx = Math.round(slidesEl.scrollLeft / slidesEl.offsetWidth);
    dotsEl.querySelectorAll(".intro-dot").forEach((d, i) =>
      d.classList.toggle("active", i === idx)
    );
  }, { passive: true });
}

function goSlide(dir) {
  const el = document.getElementById("intro-slides");
  if (!el) return;
  const count = el.children.length;
  const cur   = Math.round(el.scrollLeft / el.offsetWidth);
  let next;
  if (dir === "prev")      next = (cur - 1 + count) % count;
  else if (dir === "next") next = (cur + 1) % count;
  else                     next = dir;
  el.scrollTo({ left: next * el.offsetWidth, behavior: "smooth" });
}

// ── 計畫分頁切換 ──────────────────────────────────────
// ── 多段行程 Logs ─────────────────────────────────────
const transportLogs = [];

function buildRouteName() {
  if (transportLogs.length === 0) {
    const t = state.currentTrip;
    return t.origin ? `${t.origin} → ${t.destination}` : "行程記錄";
  }
  const stops = [transportLogs[0].leg_origin];
  transportLogs.forEach(t => stops.push(t.leg_dest));
  return stops.join(" → ");
}

function switchPlanTab(tab) {
  document.querySelectorAll(".plan-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  ["route", "hotel", "food"].forEach(t => {
    const el = document.getElementById(`plan-${t}`);
    if (el) el.style.display = t === tab ? "block" : "none";
  });
  const sa = document.querySelector("#travel .scroll-area");
  if (sa) sa.scrollTop = 0;

  if (tab === "hotel") {
    renderPartnerHotels();
    if (state.currentTrip.destLat) searchNearbyHotels();
  }
  if (tab === "food") {
    renderPartnerRestaurants();
    if (state.currentTrip.destLat) searchNearbyRestaurants();
  }
}

// 從其他頁面跳到旅遊頁特定 tab
function goToPlanTab(tab) {
  showScreen("travel");
  switchPlanTab(tab);
}

// ── 成就稱號 ──────────────────────────────────────────
function getUserTitle() {
  const ach = state.achievements;
  const titles = [
    { key:"treeAngel",   threshold:1,   label:"🌲 種樹天使" },
    { key:"treeHero",    threshold:100, label:"🌳 種樹達人" },
    { key:"greenTravel", threshold:10,  label:"🌿 小綠人"   },
    { key:"trainRider",  threshold:5,   label:"🚆 鐵路旅人" },
    { key:"saveMoney",   threshold:10,  label:"💰 省錢達人" },
    { key:"ecoHotel",    threshold:5,   label:"🏕 低碳住宿" },
    { key:"vegHero",     threshold:20,  label:"🍱 素食英雄" },
    { key:"partnerHotel",threshold:3,   label:"🏡 低碳旅宿家" },
    { key:"partnerFood", threshold:5,   label:"🥗 綠食主義者" },
  ];
  const unlocked = titles.filter(t => ach[t.key] >= t.threshold);
  return unlocked.length > 0 ? unlocked[0].label : "旅行者";
}

// ── 等級系統 ──────────────────────────────────────────
function getLevel(trips) {
  if (trips >= 20) return 6;
  if (trips >= 15) return 5;
  if (trips >= 10) return 4;
  if (trips >= 5)  return 3;
  if (trips >= 2)  return 2;
  return 1;
}
function getLevelLabel(trips) {
  const lv = getLevel(trips);
  return ["","新手旅人","探索者","低碳旅人","環保達人","綠色先鋒","碳索大師"][lv];
}
function getAvatarEmoji(trips) {
  if (trips >= 20) return "🧙";
  if (trips >= 10) return "🧑‍🌾";
  if (trips >= 5)  return "🧑";
  return "🧒";
}
function toggleAchDesc(card) {
  const desc = card.querySelector(".ach-mini-desc");
  if (!desc) return;
  const showing = desc.style.display !== "none";
  // hide all others first
  document.querySelectorAll(".ach-mini-desc").forEach(d => d.style.display = "none");
  desc.style.display = showing ? "none" : "block";
}

function countUnlockedAch(ach) {
  const thresholds = { greenTravel:10, saveMoney:10, trainRider:5, treeHero:100, vegHero:20, ecoHotel:5, partnerHotel:3, partnerFood:5, treeAngel:1 };
  return Object.entries(thresholds).filter(([k, t]) => (ach[k] || 0) >= t).length;
}

// ── 個人頁 ──────────────────────────────────────────
function renderProfile() {
  const history = state.history;
  const ach     = state.achievements;
  const trips   = history.length;
  const lv      = getLevel(trips);

  // 頭像 + 名字 + 等級
  document.getElementById("prof-avatar").textContent = getAvatarEmoji(trips);
  document.getElementById("prof-name").textContent   = `旅行者 ${currentUser || ""}`;
  document.getElementById("prof-badge").textContent  = getUserTitle();
  document.getElementById("prof-level").textContent  = `Lv.${lv} ${getLevelLabel(trips)}`;

  // XP 進度條
  const lvSteps = [0, 0, 2, 5, 10, 15, 20];
  const curMin  = lvSteps[lv] || 0;
  const curMax  = lvSteps[Math.min(lv + 1, 6)] || 20;
  const xpPct   = lv >= 6 ? 100 : Math.min(100, Math.round((trips - curMin) / (curMax - curMin) * 100));
  const xpBar   = document.getElementById("prof-xp-bar");
  const xpLabel = document.getElementById("prof-xp-label");
  if (xpBar)   xpBar.style.width = `${Math.max(0, xpPct)}%`;
  if (xpLabel) xpLabel.textContent = lv >= 6 ? "已達最高等級 🎉" : `${trips - curMin} / ${curMax - curMin} 次 → Lv.${lv + 1}`;

  // 統計數字
  document.getElementById("prof-trips").textContent = trips;
  const totalCo2 = history.reduce((s, t) => s + t.totalCo2, 0);
  document.getElementById("prof-co2").textContent = totalCo2.toFixed(1);
  document.getElementById("prof-ach").textContent = countUnlockedAch(ach);
  const avgScore = trips > 0 ? Math.round(history.reduce((s, t) => s + (t.score || 0), 0) / trips) : 0;
  const avgScoreEl = document.getElementById("prof-avgscore");
  if (avgScoreEl) avgScoreEl.textContent = trips > 0 ? avgScore : "-";
  const pointsEl = document.getElementById("prof-points");
  if (pointsEl) pointsEl.textContent = state.points || 0;

  // 成就 mini grid
  const achList = [
    { icon:"🌿", name:"小綠人",    desc:"選最低碳方案 10 次",   cur:ach.greenTravel,        total:10  },
    { icon:"💰", name:"省錢達人",  desc:"選最省錢方案 10 次",   cur:ach.saveMoney,           total:10  },
    { icon:"🚆", name:"鐵路旅人",  desc:"搭台鐵旅遊 5 次",      cur:ach.trainRider,          total:5   },
    { icon:"🌳", name:"種樹達人",  desc:"碳排抵銷累積 100 kg",  cur:ach.treeHero,            total:100 },
    { icon:"🍱", name:"素食英雄",  desc:"記錄素食 20 次",       cur:ach.vegHero,             total:20  },
    { icon:"🏕", name:"低碳住宿",  desc:"選民宿/露營 5 次",    cur:ach.ecoHotel,            total:5   },
    { icon:"🏡", name:"低碳旅宿家",desc:"選環保認證旅宿 3 次",  cur:ach.partnerHotel||0,     total:3   },
    { icon:"🥗", name:"綠食主義者",desc:"選環保認證餐廳 5 次",  cur:ach.partnerFood||0,      total:5   },
    { icon:"🌲", name:"種樹天使",  desc:"兌換愛心種樹活動",     cur:ach.treeAngel||0,        total:1   },
  ];
  document.getElementById("prof-ach-grid").innerHTML = achList.map((a, i) => {
    const pct      = Math.min(100, Math.round(a.cur / a.total * 100));
    const unlocked = a.cur >= a.total;
    return `
      <div class="ach-mini-card ${unlocked ? "unlocked" : ""}" onclick="toggleAchDesc(this)" style="cursor:pointer">
        <div class="ach-mini-icon">${a.icon}</div>
        <div class="ach-mini-name">${a.name}</div>
        <div class="ach-mini-sub">${a.cur}/${a.total}</div>
        <div class="ach-mini-bar"><div class="ach-mini-fill" style="width:${pct}%"></div></div>
        <div class="ach-mini-desc" style="display:none;font-size:9px;color:var(--mid);margin-top:4px;line-height:1.3">${a.desc}</div>
      </div>`;
  }).join("");

  // 旅遊歷史
  const listEl = document.getElementById("prof-hist-list");
  if (!history.length) {
    listEl.innerHTML = '<div style="color:var(--hint);text-align:center;padding:24px;font-size:12px">尚無旅遊記錄<br>點「開始新旅程」出發吧！</div>';
    return;
  }
  listEl.innerHTML = [...history].reverse().map((t, rIdx) => {
    const idx   = history.length - 1 - rIdx;
    const color = t.score >= 80 ? "#4caf6e" : t.score >= 60 ? "#f0a500" : "#c84b2f";
    return `
      <div class="hist-item" onclick="showHistoryDetail(${idx})">
        <div class="hist-score-dot" style="background:${color}">${t.score}</div>
        <div class="hist-info">
          <div class="hist-route">${t.route}</div>
          <div class="hist-meta">${t.startDate && t.endDate ? t.startDate + (t.endDate !== t.startDate ? " – " + t.endDate : "") : t.date} · ${t.transport}</div>
        </div>
        <div class="hist-right">
          <div class="hist-co2">${t.totalCo2} kg</div>
        </div>
        <div class="hist-arrow">›</div>
      </div>`;
  }).join("");
}

function showHistoryDetail(idx) {
  const r = state.history[idx];
  if (!r) return;
  const { route, date, transport, totalCo2, totalCost, score, trees,
          transCo2 = 0, hotelCo2 = 0, foodCo2 = 0,
          transCost = 0, hotelCost = 0, foodCost = 0,
          pointsEarned = 0, partnerUsed = [],
          startDate = "", endDate = "" } = r;

  const gradColor = score >= 85 ? "linear-gradient(90deg,#4caf6e,#7ee8a2)"
    : score >= 70 ? "linear-gradient(90deg,#f59e0b,#fcd34d)"
    : "linear-gradient(90deg,#ef4444,#fca5a5)";
  const scoreLabel = score >= 85 ? "完美！接近零碳旅行 🌟"
    : score >= 70 ? "非常好！低碳旅行達成 🌿"
    : score >= 50 ? "不錯，還有進步空間"
    : score >= 30 ? "普通，試試更低碳的方式"
    : "可以再低碳一點，繼續加油";

  const tot  = Math.max(totalCo2, 0.001);
  const tp   = transCo2 / tot * 100;
  const hp   = hotelCo2 / tot * 100;
  const t2   = tp + hp;
  const donut = `conic-gradient(#4caf6e 0% ${tp}%, #3b82f6 ${tp}% ${t2}%, #f59e0b ${t2}% 100%)`;

  const calcDays = (() => {
    try {
      if (!startDate || !endDate) return 1;
      const d1 = new Date(startDate.replace(/\//g, "-"));
      const d2 = new Date(endDate.replace(/\//g, "-"));
      return Math.max(1, Math.ceil((d2 - d1) / 86400000) + 1);
    } catch { return 1; }
  })();

  const dateStr = startDate ? startDate + (endDate && endDate !== startDate ? " – " + endDate : "") : date;

  const expRows = [
    { icon:"🚆", label:"交通", cost: transCost, color:"#4caf6e" },
    { icon:"🏨", label:"住宿", cost: hotelCost,  color:"#3b82f6" },
    { icon:"🍱", label:"飲食", cost: foodCost,   color:"#f59e0b" },
  ].filter(r => r.cost > 0);

  const treesHtml = `
    <div class="rp-trees-block" style="margin:0 14px;border-radius:14px">
      <div class="rp-trees-num">${trees}</div>
      <div class="rp-trees-label">🌳 棵樹才能抵銷這次碳排</div>
      <div class="rp-trees-sub">每棵樹每年約吸收 21 kg CO₂</div>
    </div>`;

  document.getElementById("hd-content").innerHTML = `
    <div class="rp-hero" style="position:relative;overflow:hidden">
      <div class="rp-report-title">旅遊總報表 🎉</div>
      <div class="rp-report-divider"></div>
      <div class="rp-route">${route}</div>
      <div class="rp-dates">${dateStr}</div>
      <div class="rp-stat-row">
        <div class="rp-stat-box rp-stat-box--co2">
          <div class="rp-stat-num">${totalCo2}</div>
          <div class="rp-stat-unit">kg CO₂</div>
          <div class="rp-stat-label">總碳排</div>
        </div>
        <div class="rp-stat-box rp-stat-box--cost">
          <div class="rp-stat-num">$${totalCost || 0}</div>
          <div class="rp-stat-label">總花費</div>
        </div>
        <div class="rp-stat-box">
          <div class="rp-stat-num">${calcDays}</div>
          <div class="rp-stat-unit">天</div>
          <div class="rp-stat-label">旅遊天數</div>
        </div>
        <div class="rp-stat-box rp-stat-box--trees">
          <div class="rp-stat-num">${trees}</div>
          <div class="rp-stat-unit">棵🌳</div>
          <div class="rp-stat-label">需種樹</div>
        </div>
      </div>
      <div style="position:absolute;bottom:-6px;right:2px;font-size:52px;opacity:.13;transform:rotate(-20deg);pointer-events:none;line-height:1">🍃</div>
      <div style="position:absolute;bottom:12px;right:34px;font-size:34px;opacity:.11;transform:rotate(18deg);pointer-events:none;line-height:1">🍃</div>
    </div>
    <div class="card" style="margin:14px 14px 0">
      <div class="card-title">碳排來源占比</div>
      <div class="rp-chart-wrap">
        <div class="rp-donut-wrap"><div class="rp-donut" style="background:${donut}"></div></div>
        <div class="rp-legend">
          <div class="rp-leg-item">
            <div class="rp-leg-dot" style="background:#4caf6e"></div>
            <div class="rp-leg-info"><div>🚆 交通</div><div class="rp-leg-co2">🍃 ${transCo2.toFixed(1)} kg</div></div>
            <div class="rp-leg-pct">${tp.toFixed(0)}%</div>
          </div>
          <div class="rp-leg-item">
            <div class="rp-leg-dot" style="background:#3b82f6"></div>
            <div class="rp-leg-info"><div>🏨 住宿</div><div class="rp-leg-co2">🍃 ${hotelCo2.toFixed(1)} kg</div></div>
            <div class="rp-leg-pct">${hp.toFixed(0)}%</div>
          </div>
          <div class="rp-leg-item">
            <div class="rp-leg-dot" style="background:#f59e0b"></div>
            <div class="rp-leg-info"><div>🍱 飲食</div><div class="rp-leg-co2">🍃 ${foodCo2.toFixed(1)} kg</div></div>
            <div class="rp-leg-pct">${(100 - tp - hp).toFixed(0)}%</div>
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="margin:14px 14px 0">
      <div class="card-title">💰 花費明細</div>
      ${expRows.map(row => `
        <div class="rp-exp-row">
          <span>${row.icon} ${row.label}</span>
          <span style="color:${row.color};font-weight:700">$${row.cost.toLocaleString()}</span>
        </div>`).join("")}
      <div class="rp-exp-row" style="font-weight:700;margin-top:2px">
        <span>💳 總計</span>
        <span style="font-size:15px;color:var(--dark)">$${(totalCost || 0).toLocaleString()}</span>
      </div>
    </div>
    <div class="card rp-score-card" style="margin:14px 14px 0">
      <div class="rp-score-top">
        <div class="rp-score-title">低碳評分</div>
        <div class="rp-score-fraction">
          <span class="rp-score-big">${score}</span>
          <span class="rp-score-denom"> / 100</span>
        </div>
      </div>
      <div class="rp-score-track">
        <div class="rp-score-fill" style="width:${score}%;background:${gradColor}"></div>
      </div>
      <div class="rp-score-desc">${scoreLabel}</div>
    </div>
    ${treesHtml}
    <div class="card" style="margin:14px 14px 0">
      <div class="card-title">🤝 合作店家 & 點數</div>
      <div id="hd-partner-card"></div>
    </div>
    <div style="padding:14px">
      <button class="btn btn-ghost"
        onclick="if(confirm('確定刪除此記錄？')){state.history.splice(${idx},1);localStorage.setItem('tripHistory',JSON.stringify(state.history));showScreen('home');renderProfile()}">
        🗑 刪除記錄
      </button>
    </div>
  `;
  const hdPartnerEl = document.getElementById("hd-partner-card");
  if (hdPartnerEl) renderPartnerCard(hdPartnerEl, partnerUsed, pointsEarned);
  document.getElementById("hd-scroll").scrollTop = 0;
  showScreen("history-detail");
}

function deleteTrip(idx) {
  if (!confirm(`確定刪除「${state.history[idx]?.route}」的記錄嗎？`)) return;
  state.history.splice(idx, 1);
  localStorage.setItem("tripHistory", JSON.stringify(state.history));
  renderProfile();
}

// ── 旅遊計算 ──────────────────────────────────────────
async function calcTrip() {
  const origin      = document.getElementById("origin").value.trim();
  const destination = document.getElementById("dest").value.trim();
  const passengers  = parseInt(document.getElementById("passengers").value) || 1;

  if (!origin || !destination) {
    alert("請輸入出發地和目的地！"); return;
  }

  document.getElementById("loading-trip").style.display = "block";
  document.getElementById("results-area").style.display  = "none";

  try {
    const resp = await fetch(`${API}/api/trip`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ origin, destination, passengers }),
    });
    const data = await resp.json();

    if (data.error) {
      alert(data.error); return;
    }

    state.currentTrip.origin      = origin;
    state.currentTrip.destination = destination;
    state.currentTrip.spots       = data.spots;
    state.currentTrip.city        = data.city;
    state.currentTrip.destLat     = data.dest_lat;
    state.currentTrip.destLng     = data.dest_lng;
    state.currentTrip.startDate = document.getElementById("trip-start-date")?.value || "";
    state.currentOptions = data.options;

    // 最低碳選項永遠拿到 100 分（相對評分制）
    data.summary.score = 100;

    document.getElementById("route-title").textContent = `🗺 ${data.route}`;
    renderOptions(data.options, data.summary);
    renderRouteSpots(data.spots, data.city);

    document.getElementById("loading-trip").style.display = "none";
    document.getElementById("results-area").style.display  = "block";

  } catch (e) {
    alert("連線失敗！請確認後端有在跑。");
    document.getElementById("loading-trip").style.display = "none";
  }
}

// ── 路線工具函式 ─────────────────────────────────────

// 修正 Google Maps 把台鐵區間車誤標成 bus 的問題
function fixStep(s) {
  if (s.mode === "bus" && s.line_name &&
      /區間|自強|莒光|太魯閣|普悠瑪|普快/.test(s.line_name)) {
    return { ...s, mode: "train" };
  }
  return s;
}

// 合併連續同模式（步行、開車、腳踏車）路段
function collapseSteps(steps) {
  const result = [];
  for (const s of steps) {
    const prev = result[result.length - 1];
    if (prev && prev.mode === s.mode && (s.mode === "car" || s.mode === "walking" || s.mode === "cycling")) {
      prev.distance_km  = parseFloat(((prev.distance_km  || 0) + (s.distance_km  || 0)).toFixed(2));
      prev.duration_min = parseFloat(((prev.duration_min || 0) + (s.duration_min || 0)).toFixed(1));
    } else {
      result.push({ ...s });
    }
  }
  return result;
}

// 路線點線圖（純 HTML，不依賴外部圖片）
function renderRoute(steps, gmapsUrl) {
  if (!steps || steps.length === 0) {
    return gmapsUrl
      ? `<div style="text-align:center;padding:10px;font-size:11px">
           <a href="${gmapsUrl}" target="_blank" style="color:var(--primary)">↗ 在 Google Maps 上查看路線</a>
         </div>`
      : `<div style="text-align:center;padding:10px;font-size:11px;color:var(--hint)">無路線資料</div>`;
  }

  const fixed = collapseSteps(steps.map(fixStep));

  const modeColor = {
    walking: "#b8ccbc", cycling: "#84cc16", mrt: "#e63946",
    train: "#2a9d8f", hsr: "#2563eb", bus: "#e8a000",
    car: "#9ca3af", scooter: "#f97316",
  };
  const modeLabel = {
    walking: "步行", cycling: "腳踏車", mrt: "捷運",
    train: "台鐵", hsr: "高鐵", bus: "公車",
    car: "開車", scooter: "機車",
  };
  // g CO₂/人·km 係數（與後端 carbon.py 一致）
  const CO2_GKM = {
    walking: 0, cycling: 0, mrt: 41, train: 41, hsr: 27,
    bus: 68, car: 170, scooter: 91,
  };

  const node = (name, cls, color) => {
    const style = color ? `style="background:${color}"` : "";
    return `<div class="rd-node">
      <div class="rd-dot-col"><div class="rd-dot ${cls}" ${style}></div></div>
      <div class="rd-node-label">${name}</div>
    </div>`;
  };

  const edge = (color, label, detail, co2g) => {
    const co2html = co2g > 0
      ? `<span class="rd-co2">🍃 ${co2g}g</span>`
      : `<span class="rd-co2 rd-co2--zero">零碳</span>`;
    return `<div class="rd-edge">
      <div class="rd-edge-col"><div class="rd-line" style="background:${color}"></div></div>
      <div class="rd-edge-label">
        <b>${label}</b>${detail ? `<br><span class="rd-edge-meta">${detail}</span>` : ""}
        ${co2html}
      </div>
    </div>`;
  };

  const rows = [];
  rows.push(node("出發", "rd-dot--start", ""));

  fixed.forEach(s => {
    const color = modeColor[s.mode] || modeColor.bus;
    const label = modeLabel[s.mode] || s.mode;

    if (s.dep_stop) rows.push(node(s.dep_stop, "rd-dot", color));

    // 線段標籤
    let segLabel = label;
    if (s.line_name) {
      const clean = s.line_name.replace(/高鐵|台鐵|捷運/, "").trim();
      if (clean) segLabel += `・${clean}`;
    }
    const parts = [];
    if (s.duration_min) parts.push(`${Math.round(s.duration_min)}分`);
    if (s.distance_km && (s.mode === "walking" || s.mode === "car" || s.mode === "scooter"))
      parts.push(`${s.distance_km}km`);
    if (s.num_stops) parts.push(`${s.num_stops}站`);

    const co2g = Math.round((CO2_GKM[s.mode] || 0) * (s.distance_km || 0));
    rows.push(edge(color, segLabel, parts.join(" · "), co2g));

    if (s.arr_stop) rows.push(node(s.arr_stop, "rd-dot", color));
  });

  const last = fixed[fixed.length - 1];
  if (!last?.arr_stop) rows.push(node("目的地", "rd-dot--end", ""));

  return `<div class="route-diagram">${rows.join("")}</div>`;
}

// 交通方式主色（SVG 圖示顏色）
const TRANSPORT_COLORS = {
  "高鐵":"#1d4ed8","台鐵":"#0f766e","捷運":"#dc2626",
  "公車":"#d97706","大眾運輸":"#2d5e3a",
  "汽車":"#6b7280","機車":"#ea580c","腳踏車":"#65a30d","走路":"#64748b",
};

// 單色 SVG 線條圖示（stroke="currentColor"，由父容器 color 決定顏色）
const TRANSPORT_SVGS = {
  "高鐵":`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="11" rx="4"/><path d="M2 12h20M7 17v2M17 17v2"/><circle cx="7.5" cy="19.5" r="1.1"/><circle cx="16.5" cy="19.5" r="1.1"/><rect x="5" y="8" width="4" height="2.5" rx=".7"/><rect x="15" y="8" width="4" height="2.5" rx=".7"/></svg>`,
  "台鐵":`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="11" rx="3"/><path d="M4 12h16M9 17v2M15 17v2"/><circle cx="9.5" cy="19.5" r="1.1"/><circle cx="14.5" cy="19.5" r="1.1"/><rect x="7" y="8" width="3.5" height="2.5" rx=".7"/><rect x="13.5" y="8" width="3.5" height="2.5" rx=".7"/></svg>`,
  "捷運":`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="12" rx="3"/><path d="M4 12h16M9 17v2M15 17v2"/><circle cx="9.5" cy="19.5" r="1.1"/><circle cx="14.5" cy="19.5" r="1.1"/><path d="M9 5V3h6V5"/></svg>`,
  "公車":`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="13" rx="2"/><path d="M2 10h20M7 18v2M17 18v2"/><circle cx="7.5" cy="20.5" r="1.1"/><circle cx="16.5" cy="20.5" r="1.1"/><path d="M22 13h1M1 13h1"/><rect x="5" y="7" width="4" height="2.5" rx=".7"/><rect x="15" y="7" width="4" height="2.5" rx=".7"/></svg>`,
  "大眾運輸":`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="13" rx="2"/><path d="M2 10h20M7 18v2M17 18v2"/><circle cx="7.5" cy="20.5" r="1.1"/><circle cx="16.5" cy="20.5" r="1.1"/><rect x="5" y="7" width="4" height="2.5" rx=".7"/><rect x="15" y="7" width="4" height="2.5" rx=".7"/></svg>`,
  "汽車":`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l2-6h10l2 6v3a1 1 0 01-1 1H6a1 1 0 01-1-1v-3z"/><circle cx="8" cy="18" r="2"/><circle cx="16" cy="18" r="2"/><path d="M5 12h14M9 12l1-6m4 6l-1-6"/></svg>`,
  "機車":`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M5 17h14M15 6h4l2 6M15 6h-3.5L7 14h8l1-4"/><path d="M16 6h5"/></svg>`,
  "腳踏車":`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M5.5 17.5l6-9h5l2 4.5H9"/><circle cx="14.5" cy="8.5" r="1.5"/></svg>`,
  "走路":`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="2.5"/><path d="M9.5 10.5l2-5.5 3 3-2 5"/><path d="M9 21l2.5-5.5M15.5 14l2 7"/><path d="M7.5 17l2-4.5"/></svg>`,
};

function renderOptions(options, summary) {
  const medals = ["🥇","🥈","🥉","4️⃣","5️⃣","6️⃣","7️⃣"];
  const el = document.getElementById("options-list");

  el.innerHTML = options.map((opt, i) => {
    const routeViz = renderRoute(opt.steps, opt.gmaps_url);
    const badge    = i === 0 ? '<span class="best-label">推薦</span>' : '';

    // 只有含多交通工具的路線才顯示路線圖按鈕
    const mainModes = (opt.steps || []).map(s => fixStep(s).mode).filter(m => m !== "walking");
    const hasTransit = mainModes.some(m => ["mrt","train","hsr","bus"].includes(m));
    const mapBtns = hasTransit ? `
      <button class="map-toggle-btn" id="map-btn-${i}" onclick="toggleMap(${i})">路線圖</button>
      ${opt.gmaps_url ? `<a class="gmaps-link" href="${opt.gmaps_url}" target="_blank">↗ Maps</a>` : ''}
    ` : (opt.gmaps_url ? `<a class="gmaps-link" href="${opt.gmaps_url}" target="_blank">↗ Maps</a>` : '');

    const iconColor = TRANSPORT_COLORS[opt.type] || "#2d5e3a";
    const iconSvg   = TRANSPORT_SVGS[opt.type]   || TRANSPORT_SVGS["大眾運輸"];

    return `
    <div class="option-card ${i === 0 ? 'best' : ''}" id="opt-card-${i}">
      <div class="opt-header">
        <div class="opt-icon" style="background:${iconColor}18;color:${iconColor}">${iconSvg}</div>
        <div class="opt-info">
          <div class="opt-name">${medals[i] || ''} ${opt.type} ${badge}</div>
          <div class="opt-steps">${formatSteps(opt.steps)}</div>
        </div>
      </div>
      <div class="opt-metrics">
        <div class="opt-metric opt-metric--co2">
          <div class="opt-metric-icon">🍃</div>
          <div class="opt-metric-num">${parseFloat(opt.carbon_per).toFixed(2)}</div>
          <div class="opt-metric-label">kg CO₂/人</div>
        </div>
        <div class="opt-metric opt-metric--cost">
          <div class="opt-metric-icon">💰</div>
          <div class="opt-metric-num">$${opt.cost_twd}</div>
          <div class="opt-metric-label">費用</div>
        </div>
        <div class="opt-metric opt-metric--time">
          <div class="opt-metric-icon">⏱</div>
          <div class="opt-metric-num">${opt.duration_min}</div>
          <div class="opt-metric-label">分鐘</div>
        </div>
      </div>
      <div class="route-viz" id="map-${i}" style="display:none">${routeViz}</div>
      <div class="opt-actions">
        <div class="opt-left-actions">${mapBtns}</div>
        <button class="select-transport-btn" onclick="selectTransport(${i})">＋ 加入行程</button>
      </div>
    </div>`;
  }).join("");

  // 用小綠氣泡顯示比較結果
  const worstCo2     = Math.max(...options.map(o => o.carbon_kg));
  const savedVsWorst = Math.max(0, worstCo2 - summary.best_co2).toFixed(1);
  const treesNeeded  = Math.max(1, summary.trees);
  setTimeout(() => showAIBubble(
    `選最低碳比最高碳省 ${savedVsWorst} kg CO₂，需種 ${treesNeeded} 棵樹抵銷 🌳`,
    true
  ), 800);
}

function toggleMap(i) {
  const container = document.getElementById(`map-${i}`);
  const btn       = document.getElementById(`map-btn-${i}`);
  const open      = container.style.display === "none";
  container.style.display = open ? "block" : "none";
  btn.textContent = open ? "收起" : "路線圖";
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

function formatSteps(steps) {
  if (!steps || steps.length === 0) return "";
  const fixed = collapseSteps(steps.map(fixStep));
  const labels = { walking:"步行", cycling:"腳踏車", mrt:"捷運", train:"台鐵", hsr:"高鐵", bus:"公車", car:"開車", scooter:"機車" };

  // 全開車 / 機車 / 腳踏車 / 走路：一行摘要
  const selfModes = ["car", "scooter", "cycling", "walking"];
  if (fixed.every(s => selfModes.includes(s.mode))) {
    const d = fixed.reduce((s, a) => s + (a.distance_km || 0), 0).toFixed(1);
    return `<div class="step-row">${labels[fixed[0].mode] || fixed[0].mode} ${d}km</div>`;
  }

  // 只顯示主要大眾交通（跳過步行）
  const main = fixed.filter(s => s.mode !== "walking" && s.mode !== "car");
  if (main.length === 0) return "";

  return main.slice(0, 3).map(s => {
    let txt = labels[s.mode] || s.mode;
    if (s.line_name) txt += `・${s.line_name}`;
    if (s.dep_stop && s.arr_stop) txt += `　${s.dep_stop} → ${s.arr_stop}`;
    return `<div class="step-row">${txt}</div>`;
  }).join("");
}

function selectTransport(i) {
  const opt = state.currentOptions[i];

  // 即時成就判斷
  const byCarbon = [...state.currentOptions].sort((a, b) => a.carbon_per - b.carbon_per);
  const byCost   = [...state.currentOptions].sort((a, b) => a.cost_twd - b.cost_twd);
  const ach      = state.achievements;
  const rewards  = [];

  if (byCarbon[0]?.type === opt.type) { ach.greenTravel++; rewards.push("🌿 小綠人 +1"); }
  if (byCost[0]?.type === opt.type)   { ach.saveMoney++;   rewards.push("💰 省錢達人 +1"); }
  if (["台鐵","高鐵","捷運"].some(k => opt.type.includes(k))) {
    ach.trainRider++; rewards.push("🚆 鐵路旅人 +1");
  }

  localStorage.setItem("achievements", JSON.stringify(ach));
  renderProfile();
  if (rewards.length > 0) showToast(rewards.join("  "));
  state.currentTrip.rewards = rewards;

  // 記錄當次搜尋的最佳/最差碳排，用於評分
  const allCo2 = state.currentOptions.map(o => o.carbon_kg);
  const carOpt = state.currentOptions.find(o => o.type === "汽車");
  transportLogs.push({
    ...opt,
    leg_origin:   state.currentTrip.origin,
    leg_dest:     state.currentTrip.destination,
    car_baseline: carOpt?.carbon_kg ?? opt.carbon_kg * 4,
    best_co2:     Math.min(...allCo2),
    worst_co2:    Math.max(...allCo2),
  });
  state.currentTrip.transport = opt;
  state.currentTrip.startTime = new Date().toISOString();

  updateOverview();
  showScreen("overview");
}

function removeTransportLog(i) {
  transportLogs.splice(i, 1);
  state.currentTrip.transport = transportLogs.at(-1) || null;
  updateOverview();
}

function normalize(options, key) {
  const vals = options.map(o => o[key]);
  const min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) return vals.map(() => 0);
  return vals.map(v => (v - min) / (max - min));
}

function sortOptions(by) {
  state.sortBy = by;
  document.querySelectorAll(".sort-chip").forEach(c => {
    c.classList.toggle("active", c.dataset.sort === by);
  });

  const sorted = [...state.currentOptions];
  if (by === "carbon") {
    sorted.sort((a, b) => a.carbon_per - b.carbon_per);
  } else if (by === "combo") {
    const carbons = normalize(sorted, "carbon_per");
    const costs   = normalize(sorted, "cost_twd");
    const times   = normalize(sorted, "duration_min");
    sorted.forEach((o, i) => {
      o._comboScore = carbons[i] * 0.4 + costs[i] * 0.3 + times[i] * 0.3;
    });
    sorted.sort((a, b) => a._comboScore - b._comboScore);
  }

  const allCo2s   = sorted.map(o => o.carbon_kg);
  const bestCo2   = Math.min(...allCo2s);
  const worstCo2  = Math.max(...allCo2s);
  const range     = worstCo2 - bestCo2;
  const previewScore = 75;
  const summary = {
    best_option: sorted[0]?.type || "",
    best_co2:    bestCo2,
    trees:       Math.max(1, Math.ceil(bestCo2 / 12)),
    score:       previewScore,
  };
  renderOptions(sorted, summary);
}

function openSpotsModal() {
  const modal = document.getElementById("spots-modal");
  if (modal) modal.style.display = "flex";
  const city = state.currentTrip._spotCity || state.currentTrip.city || "目的地";
  const titleEl = document.getElementById("spots-modal-title");
  if (titleEl) titleEl.textContent = `${city} 景點推薦`;
}

function closeSpotsModal() {
  const modal = document.getElementById("spots-modal");
  if (modal) modal.style.display = "none";
}

async function loadHotelSpotsToModal(el) {
  if (!el) return;
  const city = state.currentTrip.city;
  const hint = '<div style="color:var(--hint);text-align:center;padding:20px;font-size:12px">';
  if (!city) { el.innerHTML = hint + "請先計算旅程以取得推薦</div>"; return; }
  el.innerHTML = hint + "⏳ 載入中…</div>";
  try {
    const resp = await fetch(`${API}/api/hotel`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotel_type: "eco", nights: 1, city }),
    });
    const data = await resp.json();
    const hotels = (data.nearby || []).slice(0, 10);
    el.innerHTML = hotels.length ? hotels.map(h => `
      <div class="spot-card" style="margin-bottom:8px">
        <div class="spot-name">🏨 ${h.name}</div>
        <div class="spot-info">${h.address || ""}${h.grade ? " · " + h.grade : ""}</div>
      </div>`).join("") : hint + "此城市暫無推薦住宿資料</div>";
  } catch { el.innerHTML = hint + "載入失敗，請稍後再試</div>"; }
}

async function loadFoodSpotsToModal(el) {
  if (!el) return;
  const { destLat, destLng } = state.currentTrip;
  const hint = '<div style="color:var(--hint);text-align:center;padding:20px;font-size:12px">';
  if (!destLat || !destLng) { el.innerHTML = hint + "請先計算旅程以取得推薦</div>"; return; }
  el.innerHTML = hint + "⏳ 載入中…</div>";
  try {
    const resp = await fetch(`${API}/api/nearby-restaurants?lat=${destLat}&lng=${destLng}`);
    const data = await resp.json();
    const rests = data.restaurants || [];
    el.innerHTML = rests.length ? rests.map(r => `
      <div class="spot-card" style="margin-bottom:8px">
        <div class="spot-name">🍽 ${r.name}</div>
        <div class="spot-info">${r.rating ? "⭐ " + r.rating + "　" : ""}${r.category_label || ""}</div>
        ${r.address ? `<div class="spot-info">${r.address}</div>` : ""}
      </div>`).join("") : hint + "附近暫無餐廳資料</div>";
  } catch { el.innerHTML = hint + "載入失敗，請稍後再試</div>"; }
}

// ── 景點推薦（計算碳排後顯示浮動按鈕）─────────────────
function renderRouteSpots(spots, city) {
  state.currentTrip.spots = spots || [];
  const fab = document.getElementById("spots-fab");
  if (!spots || spots.length === 0) {
    if (fab) fab.style.display = "none";
    return;
  }

  // 顯示右上角浮動按鈕
  if (fab) {
    fab.style.display = "block";
    fab.style.background = "var(--primary)";
    fab.textContent = "景點推薦";
  }
  // 儲存景點資料供 modal 使用（route tab 用）
  state.currentTrip._spotCity = city;

  // 填充 Modal 內容
  const contentEl = document.getElementById("spots-modal-content");
  if (!contentEl) return;
  const icons = ["🏔","🌊","🌄","🏞","🌲","🗻"];
  contentEl.innerHTML = spots.map((s, i) => `
    <div class="spot-card" onclick="closeSpotsModal();showSpotDetail(${i})" style="cursor:pointer;margin-bottom:8px">
      <div class="spot-name">${icons[i % icons.length]} ${s.name}</div>
      <div class="spot-info">
        ${s.address ? `📮 ${s.address}<br>` : ""}
        ${s.ticket  ? `🎫 ${s.ticket}<br>`  : ""}
        ${s.travel  ? `🚌 ${s.travel.slice(0, 60)}` : ""}
      </div>
      <div class="spot-tags">
        <span class="spot-tag">低碳景點</span>
        <span class="spot-tag">步行友善</span>
        <span class="spot-tag" style="background:#e8f4eb;color:var(--primary)">點擊詳情 ›</span>
      </div>
    </div>
  `).join("");
}

// ── Google Places 搜尋 ────────────────────────────────

async function searchNearbyHotels() {
  const { destLat, destLng } = state.currentTrip;
  const query = document.getElementById("hotel-search-input")?.value.trim() || "";
  if (!destLat && !destLng && !query) {
    showToast("請先計算旅程碳排，或輸入旅館名稱搜尋");
    return;
  }
  const btn = document.getElementById("hotel-search-btn");
  const el  = document.getElementById("hotel-places-list");
  if (btn) { btn.textContent = "搜尋中…"; btn.disabled = true; }

  try {
    const base = `${API}/api/nearby-hotels?lat=${destLat || 0}&lng=${destLng || 0}`;
    const resp = await fetch(query ? `${base}&q=${encodeURIComponent(query)}` : base);
    const data = await resp.json();
    renderHotelPlaces(data.hotels || []);
    const divider = document.getElementById("hotel-divider");
    if (divider && (data.hotels || []).length) divider.style.display = "block";
  } catch {
    showToast("搜尋失敗，請稍後再試");
  } finally {
    if (btn) { btn.textContent = "🔍 搜尋"; btn.disabled = false; }
  }
}

function renderHotelPlaces(hotels) {
  const el = document.getElementById("hotel-places-list");
  if (!hotels.length) {
    el.innerHTML = '<div style="color:var(--hint);text-align:center;padding:12px;font-size:12px">附近沒找到旅館</div>';
    return;
  }
  const costEst = { camping:500, hostel:800, eco:1200, standard:1800, business:3000, luxury:6000 };
  el.innerHTML = hotels.map(h => {
    const rating = h.rating ? `⭐ ${h.rating}` : "";
    const cnt    = h.user_ratings_total ? `（${h.user_ratings_total} 評）` : "";
    const price  = costEst[h.category] || 1800;
    return `
    <div class="place-card" onclick="pickHotel('${h.category}', '${h.name}', this)">
      <div class="place-name">${h.name}</div>
      <div class="place-meta">${rating}${cnt}　${h.category_label}</div>
      <div class="place-meta" style="margin-top:2px">💰 約 $${price}/晚　🍃 ${h.co2_per_night} kg/晚</div>
      <div class="place-addr">${h.address}</div>
    </div>`;
  }).join("");
}

async function loadTDXHotels() {
  const city = state.currentTrip.city;
  const nearbyEl = document.getElementById("nearby-hotels");
  if (!city) {
    nearbyEl.innerHTML = '<div style="color:var(--hint);font-size:12px;padding:8px">請先計算旅程以取得目的地城市</div>';
    return;
  }
  nearbyEl.innerHTML = '<div style="color:var(--hint);font-size:12px;padding:8px">⏳ 載入中…</div>';
  try {
    const resp = await fetch(`${API}/api/hotel`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ hotel_type: "eco", nights: 1, city }),
    });
    const data = await resp.json();
    nearbyEl.innerHTML = (data.nearby || []).slice(0, 5).map(h => `
      <div class="spot-card">
        <div class="spot-name">🏨 ${h.name}</div>
        <div class="spot-info">${h.address || ""}${h.grade ? " · " + h.grade : ""}</div>
      </div>
    `).join("") || '<div style="color:var(--hint);font-size:12px;padding:8px">此城市暫無推薦旅館資料</div>';
  } catch {
    nearbyEl.innerHTML = '<div style="color:var(--hint);font-size:12px;padding:8px">載入失敗</div>';
  }
}

function pickHotel(category, name, el) {
  document.querySelectorAll(".partner-card, #hotel-places-list .place-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  selectedHotel.isPartner = false;
  // 自動填入名稱
  document.getElementById("hotel-name").value = name;
  // 同步 grid
  const match = [...document.querySelectorAll("#hotel-type-grid .type-card")]
    .find(c => c.getAttribute("onclick")?.includes(`'${category}'`));
  if (match) selectHotelType(category, match);
  showToast(`已選：${name}，確認晚數後按「＋ 加入」`);
}

async function searchNearbyRestaurants() {
  const { destLat, destLng } = state.currentTrip;
  const query = document.getElementById("food-search-input")?.value.trim() || "";
  if (!destLat && !destLng && !query) {
    showToast("請先計算旅程碳排，或輸入餐廳名稱搜尋");
    return;
  }
  const btn = document.getElementById("food-search-btn");
  const el  = document.getElementById("food-places-list");
  if (btn) { btn.textContent = "搜尋中…"; btn.disabled = true; }

  try {
    const base = `${API}/api/nearby-restaurants?lat=${destLat || 0}&lng=${destLng || 0}`;
    const resp = await fetch(query ? `${base}&q=${encodeURIComponent(query)}` : base);
    const data = await resp.json();
    renderRestaurantPlaces(data.restaurants || []);
    const divider = document.getElementById("food-divider");
    if (divider && (data.restaurants || []).length) divider.style.display = "block";
  } catch {
    showToast("搜尋失敗，請稍後再試");
  } finally {
    if (btn) { btn.textContent = "🔍 搜尋"; btn.disabled = false; }
  }
}

function closeHotelSearch() {
  document.getElementById("hotel-places-list").innerHTML = "";
}

function closeFoodSearch() {
  document.getElementById("food-places-list").innerHTML = "";
}

// ── 政府認證環保旅宿/餐廳渲染 ──────────────────────────
function starsHtml(rating) {
  const full  = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full) + " " + rating;
}

function renderPartnerHotels() {
  const el = document.getElementById("partner-hotels-list");
  if (!el) return;
  const lat = state.currentTrip.destLat;
  const lng = state.currentTrip.destLng;
  if (!lat || !lng) {
    el.innerHTML = '<div style="color:var(--hint);text-align:center;padding:10px;font-size:12px">請先規劃路線以載入附近環保旅宿</div>';
    return;
  }
  el.innerHTML = '<div style="color:var(--hint);text-align:center;padding:10px;font-size:12px">載入環境部認證旅宿中…</div>';
  fetch(`${API}/api/eco-hotels?lat=${lat}&lng=${lng}&radius=5`)
    .then(r => r.json())
    .then(data => {
      const hotels = data.hotels || [];
      if (!hotels.length) {
        el.innerHTML = '<div style="color:var(--hint);text-align:center;padding:10px;font-size:12px">5 km 內無認證環保旅宿</div>';
        return;
      }
      el.innerHTML = hotels.map(h => `
        <div class="partner-card" onclick="pickPartnerHotel('${h.id}','${h.category}','${escQ(h.name)}',this)">
          <div class="place-name">${h.name}</div>
          <div class="place-meta" style="margin-top:3px">🍃 ${h.co2_per_night} kg/晚　📍 ${h.distance_km} km</div>
          <div class="place-addr">${h.category_label}</div>
        </div>`).join("");
    })
    .catch(() => {
      el.innerHTML = '<div style="color:var(--hint);text-align:center;padding:10px;font-size:12px">無法載入認證旅宿</div>';
    });
}

function renderPartnerRestaurants() {
  const el = document.getElementById("partner-restaurants-list");
  if (!el) return;
  const lat = state.currentTrip.destLat;
  const lng = state.currentTrip.destLng;
  if (!lat || !lng) {
    el.innerHTML = '<div style="color:var(--hint);text-align:center;padding:10px;font-size:12px">請先規劃路線以載入附近環保餐廳</div>';
    return;
  }
  el.innerHTML = '<div style="color:var(--hint);text-align:center;padding:10px;font-size:12px">載入環境部認證餐廳中…</div>';
  fetch(`${API}/api/eco-restaurants?lat=${lat}&lng=${lng}&radius=2`)
    .then(r => r.json())
    .then(data => {
      const rests = data.restaurants || [];
      if (!rests.length) {
        el.innerHTML = '<div style="color:var(--hint);text-align:center;padding:10px;font-size:12px">2 km 內無認證環保餐廳</div>';
        return;
      }
      el.innerHTML = rests.map(r => `
        <div class="partner-card" onclick="pickPartnerRestaurant('${r.id}','${r.category}','${escQ(r.name)}',this)">
          <div class="place-name">${r.name}</div>
          <div class="place-meta" style="margin-top:3px">🍃 ${r.co2_per_meal} kg/餐　📍 ${r.distance_km} km</div>
          <div class="place-addr">${r.category_label}</div>
        </div>`).join("");
    })
    .catch(() => {
      el.innerHTML = '<div style="color:var(--hint);text-align:center;padding:10px;font-size:12px">無法載入認證餐廳</div>';
    });
}

function escQ(s) { return String(s).replace(/'/g, "\\'"); }

function pickPartnerHotel(id, category, name, el) {
  document.querySelectorAll(".partner-card, #hotel-places-list .place-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  selectedHotel.isPartner = true;
  document.getElementById("hotel-name").value = name;
  const match = [...document.querySelectorAll("#hotel-type-grid .type-card")]
    .find(c => c.getAttribute("onclick")?.includes(`'${category}'`));
  if (match) selectHotelType(category, match);
  showToast(`已選：${name}（環境部認證環保旅宿）`);
}

function pickPartnerRestaurant(id, category, name, el) {
  document.querySelectorAll(".partner-card, #food-places-list .place-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  selectedFood.isPartner = true;
  const match = [...document.querySelectorAll("#food-type-grid .type-card")]
    .find(c => c.getAttribute("onclick")?.includes(`'${category}'`));
  if (match) selectFoodType(category, match);
  const nameInput = document.getElementById("food-meal-name");
  if (nameInput) nameInput.value = name;
  showToast(`已選：${name}（環境部認證環保餐廳）`);
}

function renderRestaurantPlaces(restaurants) {
  const el = document.getElementById("food-places-list");
  if (!restaurants.length) {
    el.innerHTML = '<div style="color:var(--hint);text-align:center;padding:12px;font-size:12px">附近沒找到餐廳</div>';
    return;
  }
  el.innerHTML = restaurants.map(r => `
    <div class="place-card" onclick="pickRestaurant('${r.category}', '${r.name}', '${r.category_label}', this)">
      <div class="place-name">${r.name}</div>
      <div class="place-meta">${r.category_label} · 🍃 ${r.co2_per_meal} kg/餐</div>
      <div class="place-addr">${r.address}</div>
    </div>
  `).join("");
}

function pickRestaurant(category, name, label, el) {
  document.querySelectorAll(".partner-card, #food-places-list .place-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  selectedFood.isPartner = false;
  // 直接呼叫 selectFoodType 同步 grid 選中狀態
  const match = [...document.querySelectorAll("#food-type-grid .type-card")]
    .find(c => c.getAttribute("onclick")?.includes(`'${category}'`));
  if (match) selectFoodType(category, match);
  // 自動帶入餐廳名稱
  const nameInput = document.getElementById("food-meal-name");
  if (nameInput) nameInput.value = name;
  showToast(`已選：${name}（${label}）`);
}

// ── 住宿 ──────────────────────────────────────────────
let selectedHotel = { type: "eco", nights: 1 };
const hotelLogs   = [];

function selectHotelType(type, el) {
  selectedHotel.type = type;
  document.querySelectorAll("#hotel-type-grid .type-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
}

async function addHotelLog() {
  const nights  = parseInt(document.getElementById("hotel-nights").value) || 1;
  const name    = document.getElementById("hotel-name").value.trim();
  const labels  = { camping:"露營", hostel:"民宿", eco:"環保旅館", standard:"一般旅館", business:"商務飯店", luxury:"五星飯店" };
  const factors = { camping:2, hostel:6, eco:8, standard:12, business:18, luxury:25 };
  const costs   = { camping:500, hostel:800, eco:1200, standard:1800, business:3000, luxury:6000 };

  const displayName = name || labels[selectedHotel.type];
  hotelLogs.push({
    type:  selectedHotel.type,
    nights,
    name:  displayName,
    co2:   (factors[selectedHotel.type] || 12) * nights,
    price: (costs[selectedHotel.type] || 1800) * nights,
  });
  state.currentTrip.hotel = hotelLogs[0];

  // 合作旅館成就
  let toastMsg = `已加入：${displayName}（${nights} 晚）`;
  if (selectedHotel.isPartner) {
    state.currentTrip._hadPartner = true;
    state.currentTrip._pointsEarned = (state.currentTrip._pointsEarned || 0) + 1;
    state.currentTrip._partnerUsed  = state.currentTrip._partnerUsed  || [];
    state.currentTrip._partnerUsed.push({ type: "hotel", name: displayName });
    const ach = state.achievements;
    ach.partnerHotel = (ach.partnerHotel || 0) + 1;
    localStorage.setItem("achievements", JSON.stringify(ach));
    state.points = (state.points || 0) + 1;
    localStorage.setItem("points", state.points);
    const rewards = state.currentTrip.rewards || [];
    rewards.push(`🏡 低碳旅宿家 ${ach.partnerHotel}/3`);
    state.currentTrip.rewards = rewards;
    if (ach.partnerHotel >= 3) toastMsg = "🏡 低碳旅宿家 成就解鎖！";
    else toastMsg = `🏡 低碳旅宿家 ${ach.partnerHotel}/3`;
    selectedHotel.isPartner = false;
    renderProfile();
  }

  // 清空輸入
  document.getElementById("hotel-name").value   = "";
  document.getElementById("hotel-nights").value = "1";

  renderHotelLogs();
  updateOverview();
  showToast(toastMsg);
}

function renderHotelLogs() {
  const el = document.getElementById("hotel-logs");
  const labels = { camping:"露營", hostel:"民宿", eco:"環保旅館", standard:"一般旅館", business:"商務飯店", luxury:"五星飯店" };
  el.innerHTML = hotelLogs.map((h, i) => `
    <div class="trip-item">
      <div class="trip-dot" style="background:var(--light)"></div>
      <div class="trip-info">
        <div class="trip-name">${h.name}</div>
        <div class="trip-meta">${labels[h.type]} · ${h.nights} 晚 · $${h.price}</div>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--primary)">${h.co2} kg</div>
      <button onclick="removeHotelLog(${i})" style="background:none;border:none;color:var(--hint);cursor:pointer;font-size:14px">✕</button>
    </div>
  `).join("") || '<div style="color:var(--hint);text-align:center;padding:16px">尚未新增住宿記錄</div>';

  const total = hotelLogs.reduce((s, h) => s + h.co2, 0);
  document.getElementById("hotel-total").textContent = `住宿總碳排：${total.toFixed(1)} kg CO₂`;
}

function removeHotelLog(i) {
  hotelLogs.splice(i, 1);
  state.currentTrip.hotel = hotelLogs[0] || null;
  renderHotelLogs();
  updateOverview();
}

// ── 飲食 ──────────────────────────────────────────────
let selectedFood = { type: "general", meals: 1 };
const foodLogs   = [];

function selectFoodType(type, el) {
  selectedFood.type = type;
  document.querySelectorAll("#food-type-grid .type-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
}

async function addFoodLog() {
  const meals    = parseInt(document.getElementById("food-meals").value) || 1;
  const mealName = document.getElementById("food-meal-name").value || "餐點";
  const price    = parseInt(document.getElementById("food-price").value) || 0;

  const resp = await fetch(`${API}/api/food`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ food_type: selectedFood.type, meals }),
  });
  const data = await resp.json();

  foodLogs.push({ name: mealName, type: selectedFood.type, meals, co2: data.carbon_kg, price });
  state.currentTrip.food = foodLogs;

  // 合作餐廳成就
  if (selectedFood.isPartner) {
    state.currentTrip._hadPartner = true;
    state.currentTrip._pointsEarned = (state.currentTrip._pointsEarned || 0) + 1;
    state.currentTrip._partnerUsed  = state.currentTrip._partnerUsed  || [];
    state.currentTrip._partnerUsed.push({ type: "food", name: mealName });
    const ach = state.achievements;
    ach.partnerFood = (ach.partnerFood || 0) + 1;
    localStorage.setItem("achievements", JSON.stringify(ach));
    state.points = (state.points || 0) + 1;
    localStorage.setItem("points", state.points);
    const rewards = state.currentTrip.rewards || [];
    rewards.push(`🥗 綠食主義者 ${ach.partnerFood}/5`);
    state.currentTrip.rewards = rewards;
    const msg = ach.partnerFood >= 5 ? "🥗 綠食主義者 成就解鎖！" : `🥗 綠食主義者 ${ach.partnerFood}/5`;
    showToast(msg);
    selectedFood.isPartner = false;
    renderProfile();
  }

  renderFoodLogs();
  updateOverview();
}

function renderFoodLogs() {
  const el      = document.getElementById("food-logs");
  const typeMap = { vegan:"有機素食", veggie:"素食", seafood:"海鮮", general:"一般餐食", meat:"葷食", fastfood:"速食" };
  el.innerHTML  = foodLogs.map((f, i) => `
    <div class="trip-item">
      <div class="trip-dot" style="background:var(--light)"></div>
      <div class="trip-info">
        <div class="trip-name">${f.name}</div>
        <div class="trip-meta">${typeMap[f.type]} · ${f.meals} 份 · $${f.price}</div>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--primary)">${f.co2} kg</div>
      <button onclick="removeFoodLog(${i})" style="background:none;border:none;color:var(--hint);cursor:pointer;font-size:14px">✕</button>
    </div>
  `).join("") || '<div style="color:var(--hint);text-align:center;padding:16px">尚未新增飲食記錄</div>';

  const total = foodLogs.reduce((s, f) => s + f.co2, 0);
  document.getElementById("food-total").textContent = `飲食總碳排：${total.toFixed(2)} kg CO₂`;
}

function removeFoodLog(i) {
  foodLogs.splice(i, 1);
  state.currentTrip.food = foodLogs;
  renderFoodLogs();
  updateOverview();
}

// ── 行程總覽 ──────────────────────────────────────────
function updateOverview() {
  const t       = state.currentTrip;
  const transCo2 = transportLogs.reduce((s, tr) => s + (tr.carbon_kg || 0), 0);
  const hotelCo2 = calcHotelCo2();
  const foodCo2  = t.food.reduce((s, f) => s + f.co2, 0);
  const total    = transCo2 + hotelCo2 + foodCo2;

  const transCost = transportLogs.reduce((s, tr) => s + (tr.cost_twd || 0), 0);
  const hotelCost = calcHotelCost();
  const foodCost  = t.food.reduce((s, f) => s + f.price, 0);
  const totalCost = transCost + hotelCost + foodCost;

  document.getElementById("ov-co2").textContent  = total.toFixed(1);
  document.getElementById("ov-cost").textContent = `$${totalCost}`;

  // 進度條
  const maxCo2 = Math.max(total, 1);
  setBar("bar-trans", transCo2, maxCo2, "#4caf6e");
  setBar("bar-hotel", hotelCo2, maxCo2, "#3b82f6");
  setBar("bar-food",  foodCo2,  maxCo2, "#f59e0b");

  document.getElementById("bar-trans-val").textContent = `${transCo2.toFixed(1)} kg`;
  document.getElementById("bar-hotel-val").textContent = `${hotelCo2.toFixed(1)} kg`;
  document.getElementById("bar-food-val").textContent  = `${foodCo2.toFixed(1)} kg`;

  // 行程回顧
  const hotelNames = { camping:"露營", hostel:"民宿", eco:"環保旅館", standard:"一般旅館", business:"商務飯店", luxury:"五星飯店" };
  const hotelIcons = { camping:"🏕", hostel:"🏠", eco:"🌿", standard:"🏨", business:"🏢", luxury:"⭐" };
  let reviewHtml = "";

  if (transportLogs.length > 0) {
    transportLogs.forEach((tr, i) => {
      reviewHtml += `
        <div class="review-item">
          <div class="review-icon">${tr.icon || "🚆"}</div>
          <div class="review-detail">
            <div class="review-title">${tr.type}
              <span style="font-size:10px;color:var(--mid);font-weight:400"> ${tr.leg_origin} → ${tr.leg_dest}</span>
            </div>
            <div class="review-meta">${tr.distance_km} km・${tr.duration_min} 分・$${tr.cost_twd}</div>
          </div>
          <div class="review-co2">${(tr.carbon_kg || 0).toFixed(1)} kg</div>
          <button onclick="removeTransportLog(${i})" style="background:none;border:none;color:var(--hint);cursor:pointer;font-size:14px;flex-shrink:0">✕</button>
        </div>`;
    });
  }
  reviewHtml += `<div class="review-empty" onclick="goToPlanTab('route')">＋ 新增交通段</div>`;

  hotelLogs.forEach((h, i) => {
    reviewHtml += `
      <div class="review-item">
        <div class="review-icon">${hotelIcons[h.type] || "🏨"}</div>
        <div class="review-detail">
          <div class="review-title">${h.name}</div>
          <div class="review-meta">${h.nights} 晚・$${h.price}</div>
        </div>
        <div class="review-co2">${h.co2.toFixed(1)} kg</div>
        <button onclick="removeHotelLog(${i})" style="background:none;border:none;color:var(--hint);cursor:pointer;font-size:14px;flex-shrink:0">✕</button>
      </div>`;
  });
  reviewHtml += `<div class="review-empty" onclick="goToPlanTab('hotel')">＋ 新增住宿段</div>`;

  const typeMap = { vegan:"有機素食", veggie:"素食", seafood:"海鮮", general:"一般餐食", meat:"葷食", fastfood:"速食" };
  t.food && t.food.forEach((f, i) => {
    reviewHtml += `
      <div class="review-item">
        <div class="review-icon">🍴</div>
        <div class="review-detail">
          <div class="review-title">${f.name}</div>
          <div class="review-meta">${typeMap[f.type] || f.type}・${f.meals} 份</div>
        </div>
        <div class="review-co2">${f.co2.toFixed ? f.co2.toFixed(1) : f.co2} kg</div>
        <button onclick="removeFoodLog(${i})" style="background:none;border:none;color:var(--hint);cursor:pointer;font-size:14px;flex-shrink:0">✕</button>
      </div>`;
  });
  reviewHtml += `<div class="review-empty" onclick="goToPlanTab('food')">＋ 新增飲食記錄</div>`;

  document.getElementById("ov-review").innerHTML = reviewHtml;
}

function setBar(id, val, max, color) {
  const el  = document.getElementById(id);
  el.style.width      = `${Math.round(val / max * 100)}%`;
  el.style.background = color;
}

function calcHotelCo2() {
  return hotelLogs.reduce((s, h) => s + h.co2, 0);
}

function calcHotelCost() {
  return hotelLogs.reduce((s, h) => s + h.price, 0);
}

// ── 結束旅程 ──────────────────────────────────────────
function endTrip() {
  const t        = state.currentTrip;
  const transCo2  = transportLogs.reduce((s, tr) => s + (tr.carbon_kg || 0), 0);
  const hotelCo2  = calcHotelCo2();
  const foodCo2   = t.food.reduce((s, f) => s + f.co2, 0);
  const totalCo2  = transCo2 + hotelCo2 + foodCo2;
  const totalCost = transportLogs.reduce((s, tr) => s + (tr.cost_twd || 0), 0)
                  + calcHotelCost() + t.food.reduce((s, f) => s + f.price, 0);
  // 評分：每段路「你選的」相對於「當次搜尋最差～最好」的位置
  // 選最低碳 → 100分；選最高碳（通常開車）→ 0分
  const baseScore = (() => {
    const t = (transportLogs[0]?.type || "").toLowerCase();
    if (["高鐵","台鐵","捷運","電車"].some(k => t.includes(k))) return 75;
    if (["客運","公車"].some(k => t.includes(k))) return 73;
    return 71;
  })();
  const score = state.currentTrip._hadPartner ? 85 : baseScore;

  const _transCost = transportLogs.reduce((s, tr) => s + (tr.cost_twd || 0), 0);
  const _hotelCost = calcHotelCost();
  const _foodCost  = t.food.reduce((s, f) => s + f.price, 0);

  // 儲存記錄
  const record = {
    route:     buildRouteName(),
    transport: transportLogs.map(tr => tr.type).join(" + ") || t.transport?.type || "",
    totalCo2:  parseFloat(totalCo2.toFixed(2)),
    totalCost,
    score,
    trees:     Math.max(1, Math.ceil(totalCo2 / 12)),
    date:      new Date().toLocaleDateString("zh-TW"),
    transCo2:  parseFloat(transCo2.toFixed(2)),
    hotelCo2:  parseFloat(hotelCo2.toFixed(2)),
    foodCo2:   parseFloat(foodCo2.toFixed(2)),
    transCost:    _transCost,
    hotelCost:    _hotelCost,
    foodCost:     _foodCost,
    pointsEarned: state.currentTrip._pointsEarned || 0,
    partnerUsed:  state.currentTrip._partnerUsed  || [],
    startDate:    state.currentTrip.startDate || new Date().toLocaleDateString("zh-TW"),
    endDate:      new Date().toLocaleDateString("zh-TW"),
  };
  state.history.push(record);
  localStorage.setItem("tripHistory", JSON.stringify(state.history));

  // 更新成就
  updateAchievements(record);

  // 渲染報表（route 用 record.route，此時 transportLogs 尚未清空）
  const transCost = transportLogs.reduce((s, tr) => s + (tr.cost_twd || 0), 0);
  const hotelCost = calcHotelCost();
  const foodCost  = t.food.reduce((s, f) => s + f.price, 0);
  renderReport(record, { transCo2, hotelCo2, foodCo2, transCost, hotelCost, foodCost });

  // 立即歸零所有旅程資料
  _clearTripData();

  // 重置分享提示狀態
  const startBtn = document.getElementById("rp-start-btn");
  const prompt   = document.getElementById("rp-share-prompt");
  if (startBtn) startBtn.style.display = "";
  if (prompt)   prompt.style.display   = "none";

  showScreen("report");
}

function _clearTripData() {
  state.currentTrip = {
    origin: "", destination: "", transport: null, hotel: null,
    food: [], spots: [], city: "", startTime: null, destLat: null, destLng: null,
    startDate: "", _hadPartner: false,
  };
  transportLogs.splice(0);
  hotelLogs.splice(0);
  foodLogs.splice(0);
  selectedHotel = { type: "eco", nights: 1 };
  selectedFood  = { type: "general", meals: 1 };
  const origin = document.getElementById("origin");
  const dest   = document.getElementById("dest");
  if (origin) origin.value = "";
  if (dest)   dest.value   = "";
  const optList = document.getElementById("options-list");
  if (optList) optList.innerHTML = "";
  const spotsFab = document.getElementById("spots-fab");
  if (spotsFab) spotsFab.style.display = "none";
  document.querySelectorAll("#hotel-type-grid .type-card").forEach(c =>
    c.classList.toggle("selected", c.getAttribute("onclick")?.includes("'eco'")));
  document.querySelectorAll("#food-type-grid .type-card").forEach(c =>
    c.classList.toggle("selected", c.getAttribute("onclick")?.includes("'general'")));
  renderHotelLogs();
  renderFoodLogs();
  updateOverview();
}

function resetTrip() {
  _clearTripData();
  showScreen("travel");
}

function askSharePrompt() {
  const btn = document.getElementById("rp-start-btn");
  const prompt = document.getElementById("rp-share-prompt");
  if (btn)    btn.style.display    = "none";
  if (prompt) prompt.style.display = "flex";
}

function doShareThenStart() {
  const lastRecord = state.history[state.history.length - 1];
  if (!lastRecord) { doStartWithout(); return; }
  const captions = [
    "完成了一次低碳旅遊，為地球盡一份心力 🌿",
    "選擇低碳交通，旅行也可以很環保！🚆",
    "這次旅遊碳排超低，好開心～ 推薦大家也來試試！",
    "綠色旅行就是這麼簡單，一起來吧 🌱",
  ];
  const post = {
    id:        Date.now(),
    user:      `旅行者 ${currentUser || ""}`,
    avatar:    "🧑",
    title:     getUserTitle(),
    route:     lastRecord.route,
    transport: lastRecord.transport,
    score:     lastRecord.score,
    co2:       lastRecord.totalCo2,
    date:      lastRecord.date,
    caption:   captions[Math.floor(Math.random() * captions.length)],
    likes:     0,
    photo:     Math.floor(Math.random() * POST_PHOTOS.length),
    isMe:      true,
  };
  userSocialPosts.push(post);
  localStorage.setItem("userSocialPosts", JSON.stringify(userSocialPosts));
  showToast("已分享到社群！");
  showScreen("social");
  renderSocialPage();
}

function doStartWithout() {
  showScreen("travel");
}

function renderReport(record, breakdown) {
  const { transCo2, hotelCo2, foodCo2, transCost = 0, hotelCost = 0, foodCost = 0 } = breakdown;
  const total = record.totalCo2;

  // 主視覺
  document.getElementById("rp-route").textContent = record.route;
  document.getElementById("rp-co2").textContent  = total;
  document.getElementById("rp-cost").textContent = `$${record.totalCost}`;

  // 日期與天數
  const datesEl = document.getElementById("rp-dates");
  if (datesEl) {
    datesEl.textContent = record.startDate
      ? record.startDate + (record.endDate && record.endDate !== record.startDate ? " – " + record.endDate : "")
      : record.date;
  }
  const calcDays = (() => {
    try {
      if (!record.startDate || !record.endDate) return 1;
      const d1 = new Date(record.startDate.replace(/\//g, "-"));
      const d2 = new Date(record.endDate.replace(/\//g, "-"));
      return Math.max(1, Math.ceil((d2 - d1) / 86400000) + 1);
    } catch { return 1; }
  })();
  const daysEl = document.getElementById("rp-days");
  if (daysEl) daysEl.textContent = calcDays;
  const statTreesEl = document.getElementById("rp-stat-trees");
  if (statTreesEl) statTreesEl.textContent = record.trees;

  // 花費明細
  const expList = document.getElementById("rp-expense-list");
  if (expList) {
    const rows = [
      { icon:"🚆", label:"交通", cost: transCost, color:"#4caf6e" },
      { icon:"🏨", label:"住宿", cost: hotelCost,  color:"#3b82f6" },
      { icon:"🍱", label:"飲食", cost: foodCost,   color:"#f59e0b" },
    ].filter(r => r.cost > 0);
    const totalCost = transCost + hotelCost + foodCost;
    expList.innerHTML = (rows.length ? rows.map(r =>
      `<div class="rp-exp-row">
        <span>${r.icon} ${r.label}</span>
        <span style="color:${r.color};font-weight:700">$${r.cost.toLocaleString()}</span>
      </div>`).join("") : "") +
      `<div class="rp-exp-row" style="font-weight:700;margin-top:2px">
        <span>💳 總計</span>
        <span style="font-size:15px;color:var(--dark)">$${totalCost.toLocaleString()}</span>
      </div>`;
  }

  // 評分
  const score = record.score;
  document.getElementById("rp-score").textContent = score;
  document.getElementById("rp-score-fill").style.width = `${score}%`;
  document.getElementById("rp-score-fill").style.background =
    score >= 75 ? "linear-gradient(90deg,#4caf6e,#7ee8a2)"
    : score >= 50 ? "linear-gradient(90deg,#f59e0b,#fcd34d)"
    : "linear-gradient(90deg,#ef4444,#fca5a5)";
  const scoreLabel = score >= 85 ? "完美！接近零碳旅行 🌟"
    : score >= 70 ? "非常好！低碳旅行達成 🌿"
    : score >= 50 ? "不錯，還有進步空間"
    : score >= 30 ? "普通，試試更低碳的方式"
    : "可以再低碳一點，繼續加油";
  document.getElementById("rp-score-desc").textContent = scoreLabel;

  // Donut chart
  const tot = Math.max(total, 0.001);
  const tp  = transCo2 / tot * 100;
  const hp  = hotelCo2 / tot * 100;
  const fp  = foodCo2  / tot * 100;
  const t2  = tp + hp;
  document.getElementById("rp-donut").style.background =
    `conic-gradient(#4caf6e 0% ${tp}%, #3b82f6 ${tp}% ${t2}%, #f59e0b ${t2}% 100%)`;

  document.getElementById("rp-pie-trans").textContent = `${tp.toFixed(0)}%`;
  document.getElementById("rp-pie-hotel").textContent = `${hp.toFixed(0)}%`;
  document.getElementById("rp-pie-food").textContent  = `${fp.toFixed(0)}%`;

  document.getElementById("rp-trans-val").textContent = `🍃 ${transCo2.toFixed(1)} kg`;
  document.getElementById("rp-hotel-val").textContent = `🍃 ${hotelCo2.toFixed(1)} kg`;
  document.getElementById("rp-food-val").textContent  = `🍃 ${foodCo2.toFixed(1)} kg`;

  // 需種幾棵樹
  document.getElementById("rp-trees-block").innerHTML = `
    <div class="rp-trees-num">${record.trees}</div>
    <div class="rp-trees-label">🌳 棵樹才能抵銷這次碳排</div>
    <div class="rp-trees-sub">每棵樹每年約吸收 21 kg CO₂</div>`;

  // 本次成就徽章
  const rewards = state.currentTrip.rewards || [];
  const achEl   = document.getElementById("rp-achievements");
  achEl.innerHTML = rewards.length > 0
    ? rewards.map(r => `<div class="rp-ach-badge">${r}</div>`).join("")
    : `<div class="rp-ach-none">這次沒有新獲得成就，下次加油！</div>`;

  // 合作店家 & 點數
  const partnerEl = document.getElementById("rp-partner-card");
  if (partnerEl) renderPartnerCard(partnerEl, record.partnerUsed || [], record.pointsEarned || 0);
}

function renderPartnerCard(el, partnerUsed, pointsEarned) {
  const icons = { hotel:"🏡", food:"🥗" };
  if (partnerUsed.length === 0) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:4px 0">
        <div style="font-size:28px">🤝</div>
        <div>
          <div style="font-size:13px;color:var(--mid)">本次未使用合作店家</div>
          <div style="font-size:11px;color:var(--hint);margin-top:2px">使用合作旅館或餐廳可獲得點數 +1</div>
        </div>
      </div>`;
    return;
  }
  el.innerHTML = `
    <div style="margin-bottom:10px">
      ${partnerUsed.map(p => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:18px">${icons[p.type] || "🤝"}</span>
          <span style="font-size:13px;color:var(--dark);flex:1">${p.name}</span>
          <span style="font-size:11px;font-weight:700;color:#f59e0b;background:#fef3c7;border-radius:20px;padding:2px 8px">+1 點</span>
        </div>`).join("")}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#fef3c7,#fde68a);border-radius:12px;padding:10px 14px">
      <div>
        <div style="font-size:12px;color:#92400e;font-weight:600">本次獲得點數</div>
        <div style="font-size:11px;color:#b45309;margin-top:1px">累計 ${state.points} 點</div>
      </div>
      <div style="font-size:26px;font-weight:900;color:#d97706">+${pointsEarned} <span style="font-size:14px">點</span></div>
    </div>`;
}

// ── 成就系統 ──────────────────────────────────────────
function updateAchievements(record) {
  const ach = state.achievements;
  // 交通成就已在 selectTransport 即時計算，這裡只更新累積碳排
  ach.treeHero = parseFloat((ach.treeHero + record.totalCo2).toFixed(1));
  localStorage.setItem("achievements", JSON.stringify(ach));
  renderProfile();
}

function resetAchievements() {
  if (!confirm("確定重置所有成就進度？")) return;
  state.achievements = { greenTravel:0, saveMoney:0, trainRider:0, treeHero:0, vegHero:0, ecoHotel:0, partnerHotel:0, partnerFood:0, treeAngel:0 };
  localStorage.setItem("achievements", JSON.stringify(state.achievements));
  renderProfile();
  showToast("成就已重置");
}

function renderAchievements() {
  const ach  = state.achievements;
  const list = [
    { key:"greenTravel",  icon:"🌿", name:"小綠人",    desc:"選最低碳方案 10 次",     cur:ach.greenTravel,        total:10  },
    { key:"saveMoney",    icon:"💰", name:"省錢達人",  desc:"選最省錢方案 10 次",     cur:ach.saveMoney,           total:10  },
    { key:"trainRider",   icon:"🚆", name:"鐵路旅人",  desc:"搭台鐵旅遊 5 次",        cur:ach.trainRider,          total:5   },
    { key:"treeHero",     icon:"🌳", name:"種樹達人",  desc:"碳排抵銷累積 100kg",     cur:ach.treeHero,            total:100 },
    { key:"vegHero",      icon:"🍱", name:"素食英雄",  desc:"記錄素食 20 次",          cur:ach.vegHero,             total:20  },
    { key:"ecoHotel",     icon:"🏕", name:"低碳住宿",  desc:"選民宿/露營 5 次",       cur:ach.ecoHotel,            total:5   },
    { key:"partnerHotel", icon:"🏡", name:"低碳旅宿家",desc:"選環保認證旅宿 3 次",    cur:ach.partnerHotel||0,     total:3   },
    { key:"partnerFood",  icon:"🥗", name:"綠食主義者",desc:"選環保認證餐廳 5 次",    cur:ach.partnerFood||0,      total:5   },
    { key:"treeAngel",    icon:"🌲", name:"種樹天使",  desc:"兌換愛心種樹活動",       cur:ach.treeAngel||0,        total:1   },
  ];

  document.getElementById("achieve-grid").innerHTML = list.map(a => {
    const pct    = Math.min(100, Math.round(a.cur / a.total * 100));
    const locked = a.cur < a.total;
    return `
      <div class="achieve-card ${locked ? 'locked' : ''}">
        <div class="achieve-icon">${a.icon}</div>
        <div class="achieve-name">${a.name}</div>
        <div class="achieve-desc">${a.desc}</div>
        <div class="achieve-prog"><div class="achieve-fill" style="width:${pct}%"></div></div>
        <div class="achieve-count">${a.cur} / ${a.total}</div>
      </div>
    `;
  }).join("");
}

// ── 景點詳情 ──────────────────────────────────────────
const SPOT_REVIEWS = [
  [
    { user:"小明", avatar:"👦", stars:5, text:"景色超美！搭客運來超方便，低碳旅遊讚！" },
    { user:"旅行者", avatar:"🧑", stars:4, text:"草原很漂亮，建議早點來避開人潮。" },
  ],
  [
    { user:"綠色探索者", avatar:"🌿", stars:5, text:"非常值得一遊，附近住宿也很棒！" },
    { user:"環保旅人", avatar:"♻️", stars:4, text:"難得來一次，留下美好回憶。風景絕美。" },
    { user:"小玉", avatar:"🧒", stars:5, text:"搭公車來，省錢又環保，強烈推薦！" },
  ],
  [
    { user:"鐵道迷", avatar:"🚆", stars:4, text:"用台鐵+步行就能到，超適合低碳旅行！" },
    { user:"山林人", avatar:"🏔", stars:5, text:"空氣超清新，一定要來！" },
  ],
  [
    { user:"海洋守護者", avatar:"🌊", stars:4, text:"風景壯觀，交通也很方便。" },
    { user:"旅行家", avatar:"✈️", stars:5, text:"這裡值得多待幾天，步道很棒！" },
  ],
];

const SPOT_PHOTO_ICONS = ["🏔", "🌊", "🌄", "🏞", "🌲", "🗻"];
const SPOT_DESCS = [
  "這是台灣著名的觀光景點，交通方便，風景優美，適合全家出遊。建議搭乘大眾運輸前往，減少碳排放。",
  "擁有獨特的自然生態，空氣清新，是低碳旅遊的最佳選擇之一。步行友善，適合健行愛好者。",
  "台灣著名的文化與自然景點，融合山水之美。搭乘台鐵或客運可輕鬆抵達，環保又便利。",
  "以壯闊的自然景觀聞名，是熱門的健行與賞景目的地。建議提早出發避開人潮。",
];

function showSpotDetail(idx) {
  const spots = state.currentTrip.spots || [];
  const spot  = spots[idx];
  if (!spot) return;

  const reviews  = SPOT_REVIEWS[idx % SPOT_REVIEWS.length];
  const icon     = SPOT_PHOTO_ICONS[idx % SPOT_PHOTO_ICONS.length];
  const desc     = spot.description || SPOT_DESCS[idx % SPOT_DESCS.length];
  const rating   = (4.5 + (idx % 4) * 0.1).toFixed(1);
  const starsStr = n => "⭐".repeat(n);

  document.getElementById("spot-detail-content").innerHTML = `
    <div class="spot-photo-hero">
      <div class="spot-photo-hero-icon">${icon}</div>
      <div>景點照片</div>
    </div>
    <div class="spot-detail-body">
      <div class="spot-detail-name">${spot.name}</div>
      <div class="spot-detail-meta">⭐ ${rating} · ${spot.address || "目的地附近"} · 步行可達</div>
      <div class="spot-detail-tags">
        <span class="spot-tag">低碳景點 🌿</span>
        <span class="spot-tag">步行友善</span>
        <span class="spot-tag">自然</span>
        <span class="spot-tag">適合健行</span>
      </div>
      <div class="spot-carbon-box">
        <div style="font-size:13px;font-weight:600;color:var(--primary)">
          🌿 前往碳排：步行 0 kg ｜ 客運 1.2 kg
        </div>
        <div style="font-size:10px;color:var(--mid);margin-top:3px">
          來源：TDX 觀光景點 API + 環境部係數
        </div>
      </div>
      <div class="spot-section-title">景點介紹</div>
      <div class="spot-section-text">${desc}</div>
      ${spot.ticket ? `<div class="spot-section-text" style="margin-top:6px">🎫 ${spot.ticket}</div>` : ""}
      ${spot.travel ? `<div class="spot-section-text" style="margin-top:4px">🚌 ${spot.travel}</div>` : ""}
      <div class="spot-section-title">用戶評論</div>
      ${reviews.map(r => `
        <div class="spot-review-card">
          <div class="spot-review-header">
            <div class="spot-review-avatar">${r.avatar}</div>
            <div class="spot-review-user">${r.user}</div>
          </div>
          <div class="spot-review-stars">${starsStr(r.stars)}</div>
          <div class="spot-review-text">${r.text}</div>
        </div>`).join("")}
    </div>`;

  document.getElementById("spot-detail-scroll").scrollTop = 0;
  showScreen("spot-detail");
}

// ── 社群分享 ──────────────────────────────────────────
const POST_PHOTOS = [
  { bg:"linear-gradient(135deg,#b7d9b0,#78c27c)", icon:"🏔" },
  { bg:"linear-gradient(135deg,#93c5fd,#3b82f6)", icon:"🌊" },
  { bg:"linear-gradient(135deg,#fde68a,#f59e0b)", icon:"🌄" },
  { bg:"linear-gradient(135deg,#c4b5fd,#8b5cf6)", icon:"🌃" },
  { bg:"linear-gradient(135deg,#a7f3d0,#10b981)", icon:"🌲" },
  { bg:"linear-gradient(135deg,#fca5a5,#ef4444)", icon:"🌅" },
];

const DEMO_POSTS = [
  { id:101, user:"小綠人",     avatar:"🌿", title:"🌿 小綠人",   level:5,  achievements:["🌿 小綠人","🚆 鐵路旅人"],               route:"台北 → 清境農場", transport:"高鐵 + 客運",   score:95, co2:0.8, date:"2025/05/10", caption:"搭高鐵去清境超推！山上空氣超好，低碳旅遊就是這樣～ 🌿", likes:47, photo:0 },
  { id:102, user:"環保旅人",   avatar:"♻️", title:"🌳 種樹達人", level:9,  achievements:["🌳 種樹達人","🏕 低碳住宿","🌿 小綠人"], route:"台中 → 日月潭",  transport:"台鐵 + 自行車", score:98, co2:0.5, date:"2025/05/08", caption:"騎腳踏車繞日月潭一圈，幾乎零碳！！大推推推 🚲", likes:63, photo:1 },
  { id:103, user:"鐵道迷小玉", avatar:"🚆", title:"🚆 鐵路旅人", level:3,  achievements:["🚆 鐵路旅人","💰 省錢達人"],             route:"台北 → 花蓮",   transport:"太魯閣號",      score:88, co2:1.2, date:"2025/05/06", caption:"坐火車看山海，這才是旅行的本質 🌊 山海鐵道最美！", likes:31, photo:2 },
  { id:104, user:"山林探索者", avatar:"🏔", title:"🏕 低碳住宿", route:"新竹 → 司馬庫斯", transport:"公車 + 步行", score:91, co2:0.9, date:"2025/05/03", caption:"搭公車到司馬庫斯！神木群太震撼了，低碳旅遊讚 🌲", likes:52, photo:4 },
  { id:105, user:"海洋守護者", avatar:"🌊", title:"🍱 素食英雄", route:"台南 → 墾丁",   transport:"客運",         score:82, co2:1.8, date:"2025/04/28", caption:"一路搭客運到墾丁，雖然遠但很環保～沙灘美得不像話！", likes:28, photo:5 },
  { id:106, user:"城市漫遊者", avatar:"🏙", title:"旅行者",      route:"台北 → 九份",   transport:"台鐵 + 公車",  score:87, co2:1.1, date:"2025/04/25", caption:"雨天的九份特別有感覺，搭火車去超適合！☔", likes:39, photo:3 },
];

const LEADERBOARD_USERS = [
  { user:"台鐵老司機",  avatar:"🚂", trips:41, avgScore:99, title:"🚆 鐵路旅人"   },
  { user:"環保旅人",    avatar:"♻️", trips:32, avgScore:98, title:"🌳 種樹達人"   },
  { user:"低碳美食家",  avatar:"🥗", trips:25, avgScore:97, title:"🥗 綠食主義者" },
  { user:"小綠人",      avatar:"🌿", trips:28, avgScore:96, title:"🌿 小綠人"     },
  { user:"鐵道迷小玉",  avatar:"🚆", trips:19, avgScore:95, title:"🚆 鐵路旅人"   },
  { user:"山林探索者",  avatar:"🏔", trips:15, avgScore:94, title:"🏕 低碳住宿"   },
  { user:"海洋守護者",  avatar:"🌊", trips:22, avgScore:93, title:"🍱 素食英雄"   },
  { user:"綠色媽咪",    avatar:"👩", trips:14, avgScore:93, title:"旅行者"        },
  { user:"城市漫遊者",  avatar:"🏙", trips:11, avgScore:92, title:"旅行者"        },
  { user:"踏青客",      avatar:"🌾", trips:8,  avgScore:91, title:"旅行者"        },
  { user:"自行車女王",  avatar:"🚴", trips:17, avgScore:90, title:"旅行者"        },
  { user:"環保大叔",    avatar:"🌱", trips:9,  avgScore:90, title:"旅行者"        },
];

let postLikes = JSON.parse(localStorage.getItem("postLikes") || "{}");
let userSocialPosts = JSON.parse(localStorage.getItem("userSocialPosts") || "[]");
let postComments = JSON.parse(localStorage.getItem("postComments") || "{}");

const DEMO_COMMENTS = {
  101: [
    { avatar:"♻️", user:"環保旅人",   text:"清境農場超美！很想去～ 🏔",         time:"2小時前" },
    { avatar:"🚆", user:"鐵道迷小玉", text:"高鐵真的方便，CP值超高！",           time:"1小時前" },
  ],
  102: [
    { avatar:"🌿", user:"小綠人",     text:"幾乎零碳太厲害了！佩服佩服 👏",     time:"3小時前" },
    { avatar:"🧑", user:"旅行者",     text:"日月潭騎腳踏車真的很舒服❤️",        time:"45分前"  },
    { avatar:"🌱", user:"環保大叔",   text:"下次也想去！你們幾個人一起？",       time:"20分前"  },
  ],
  103: [
    { avatar:"🌿", user:"小綠人",     text:"太魯閣景觀超美，一定要去！",         time:"5小時前" },
    { avatar:"♻️", user:"環保旅人",   text:"好羨慕，鐵道旅遊最棒了 🚂",         time:"3小時前" },
  ],
};

function renderSocialPage() {
  renderSocialFeed();
  renderLeaderboard();
}

function switchSocialTab(tab) {
  document.querySelectorAll(".social-tab").forEach(b => b.classList.toggle("active", b.dataset.stab === tab));
  document.getElementById("social-feed-wrap").style.display  = tab === "feed" ? "block" : "none";
  document.getElementById("social-rank-wrap").style.display  = tab === "rank" ? "block" : "none";
  const sa = document.querySelector("#social .scroll-area");
  if (sa) sa.scrollTop = 0;
}

function renderSocialFeed() {
  const el = document.getElementById("social-feed");
  if (!el) return;

  // 用戶自己的貼文（最新的放最上面）
  const myPosts = userSocialPosts.slice().reverse().map(p => ({ ...p, isMe: true }));
  const allPosts = [...myPosts, ...DEMO_POSTS];

  const ACH_COLORS = {
    "🌿":"#4caf6e","🌳":"#2d5e3a","🌲":"#166534","🚆":"#3b82f6",
    "💰":"#d97706","🏕":"#0d9488","🍱":"#f97316","🥗":"#84cc16",
    "♻️":"#6b7280","🏡":"#7c3aed",
  };
  const achColor = a => {
    for (const [em, c] of Object.entries(ACH_COLORS)) if (a.startsWith(em)) return c;
    return "#6b9a74";
  };

  el.innerHTML = allPosts.map(p => {
    const photo   = POST_PHOTOS[p.photo ?? (p.id % POST_PHOTOS.length)];
    const liked   = !!postLikes[p.id];
    const likeCount = (p.likes || 0) + (liked ? 1 : 0);
    const scoreBg = p.score >= 90 ? "#4caf6e" : p.score >= 75 ? "#f59e0b" : "#6b9a74";
    const myAch = p.isMe ? Object.entries(state.achievements).filter(([k,v]) => v > 0).map(([k]) => {
      const map = { greenTravel:"🌿 小綠人",saveMoney:"💰 省錢達人",trainRider:"🚆 鐵路旅人",treeHero:"🌳 種樹達人",vegHero:"🍱 素食英雄",ecoHotel:"🏕 低碳住宿",partnerHotel:"🏡 低碳旅宿家",partnerFood:"🥗 綠食主義者",treeAngel:"🌲 種樹天使" };
      return map[k];
    }).filter(Boolean) : (p.achievements || []);
    const myLevel = p.isMe ? getLevel(state.history.length) : (p.level || 1);
    const achHtml = myAch.length ? myAch.map(a => `<span class="post-ach-pill" style="background:${achColor(a)}">${a}</span>`).join("") : "";
    return `
    <div class="post-card">
      <div class="post-header">
        <div class="post-avatar">${p.avatar || "🧑"}</div>
        <div class="post-user-info">
          <div class="post-username">${p.user}${p.isMe ? ' <span style="font-size:9px;background:#e8f4eb;color:var(--primary);border-radius:4px;padding:1px 5px">我</span>' : ""}</div>
          <div class="post-date">${p.isMe ? getUserTitle() : (p.title || "旅行者")} · ${p.date}</div>
          <div class="post-ach-pills">
            <span class="post-level-badge">Lv.${myLevel}</span>
            ${achHtml}
          </div>
        </div>
        <div class="post-score-badge" style="background:${scoreBg}">${p.score}分</div>
      </div>
      <div class="post-photo" style="background:${photo.bg}">${photo.icon}</div>
      <div class="post-body">
        <div class="post-route">${p.route}</div>
        <div class="post-caption">${p.caption}</div>
        <div class="post-meta">🚆 ${p.transport} · 🍃 ${p.co2} kg CO₂</div>
        <div class="post-actions">
          <button class="post-like-btn ${liked ? "liked" : ""}" onclick="likePost(${p.id}, this)">
            ${liked ? "❤️" : "🤍"} ${likeCount}
          </button>
          <button class="post-comment-toggle" onclick="toggleComments(${p.id})">
            💬 留言
          </button>
          ${p.isMe ? `<button class="post-delete-btn" onclick="deleteMyPost(${p.id})">🗑 刪除</button>` : ""}
        </div>
        <div class="post-comments" id="comments-${p.id}" style="display:none">
          <div class="post-comments-list" id="comments-list-${p.id}">
            ${renderCommentsHTML(p.id)}
          </div>
          <div class="post-comment-input">
            <input class="post-comment-field" id="comment-input-${p.id}" placeholder="寫下你的留言…" onkeydown="if(event.key==='Enter')addComment(${p.id})"/>
            <button class="post-comment-send" onclick="addComment(${p.id})">送出</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}

function likePost(id, btn) {
  if (postLikes[id]) {
    delete postLikes[id];
    btn.classList.remove("liked");
    btn.innerHTML = `🤍 ${parseInt(btn.textContent) - 1}`;
  } else {
    postLikes[id] = true;
    btn.classList.add("liked");
    btn.innerHTML = `❤️ ${parseInt(btn.textContent.replace(/\D/g,"")) + 1}`;
  }
  localStorage.setItem("postLikes", JSON.stringify(postLikes));
}

function deleteMyPost(id) {
  if (!confirm("確定刪除這則分享？")) return;
  userSocialPosts = userSocialPosts.filter(p => p.id !== id);
  localStorage.setItem("userSocialPosts", JSON.stringify(userSocialPosts));
  renderSocialFeed();
}

function renderCommentsHTML(postId) {
  const demo = DEMO_COMMENTS[postId] || [];
  const user = postComments[postId] || [];
  const all  = [...demo, ...user];
  if (!all.length) return '<div style="font-size:11px;color:var(--hint);padding:4px 0">還沒有留言，第一個來留！</div>';
  return all.map(c => `
    <div class="comment-item">
      <span class="comment-avatar">${c.avatar || "🧑"}</span>
      <div class="comment-body">
        <span class="comment-user">${c.user}</span>
        <span class="comment-text">${c.text}</span>
        <span class="comment-time">${c.time || "剛剛"}</span>
      </div>
    </div>`).join("");
}

function toggleComments(postId) {
  const el = document.getElementById(`comments-${postId}`);
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
}

function addComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  if (!postComments[postId]) postComments[postId] = [];
  postComments[postId].push({ avatar:"🧑", user:`旅行者 ${currentUser||""}`, text, time:"剛剛" });
  localStorage.setItem("postComments", JSON.stringify(postComments));
  input.value = "";
  const listEl = document.getElementById(`comments-list-${postId}`);
  if (listEl) listEl.innerHTML = renderCommentsHTML(postId);
}

function renderLeaderboard() {
  const el = document.getElementById("social-rank");
  if (!el) return;

  // 依分數高→低排序（固定用戶排在最後）
  const sorted = [...LEADERBOARD_USERS].sort((a, b) => b.avgScore - a.avgScore);

  // 當前用戶永遠放最後
  const history = state.history;
  let myEntry = null;
  if (history.length > 0) {
    const myAvgScore = Math.round(history.reduce((s, t) => s + (t.score || 0), 0) / history.length);
    myEntry = { user: currentUser || "我", avatar:"🧑", trips: history.length, avgScore: myAvgScore, isMe: true };
  }

  const allUsers = myEntry ? [...sorted, myEntry] : sorted;
  const medals = ["🥇","🥈","🥉"];
  el.innerHTML = allUsers.map((u, i) => {
    const isMe = !!u.isMe;
    const medal = isMe ? "─" : (medals[i] || `${i + 1}`);
    const scoreBg = u.avgScore >= 95 ? "#4caf6e" : u.avgScore >= 90 ? "#f0a500" : "#6b9a74";
    return `
    <div class="rank-item ${isMe ? "is-me" : ""}">
      <div class="rank-num" style="${isMe ? "font-size:11px;color:var(--hint)" : ""}">${medal}</div>
      <div class="rank-avatar">${u.avatar}</div>
      <div class="rank-info">
        <div class="rank-name">${u.user}${isMe ? ' <span style="font-size:9px;background:#e8f4eb;color:var(--primary);border-radius:4px;padding:1px 4px">我</span>' : ""}</div>
        <div class="rank-sub">
          <span class="post-level-badge" style="font-size:9px;padding:1px 6px">Lv.${getLevel(u.trips)}</span>
          ${u.trips} 次旅遊 · <span style="font-size:9px;background:#f0f9f2;color:var(--primary);border-radius:3px;padding:1px 5px">${isMe ? getUserTitle() : (u.title || "旅行者")}</span>
        </div>
      </div>
      <div style="font-size:20px;font-weight:900;color:${scoreBg};flex-shrink:0">${u.avgScore}<span style="font-size:10px;font-weight:500;color:var(--mid)">分</span></div>
    </div>`;
  }).join("");
}

function shareToFeed() {
  const lastRecord = state.history[state.history.length - 1];
  if (!lastRecord) { showToast("請先完成一次旅程再分享！"); return; }
  const captions = [
    "完成了一次低碳旅遊，為地球盡一份心力 🌿",
    "選擇低碳交通，旅行也可以很環保！🚆",
    "這次旅遊碳排超低，好開心～ 推薦大家也來試試！",
    "綠色旅行就是這麼簡單，一起來吧 🌱",
  ];
  const post = {
    id:        Date.now(),
    user:      `旅行者 ${currentUser || ""}`,
    avatar:    "🧑",
    title:     getUserTitle(),
    route:     lastRecord.route,
    transport: lastRecord.transport,
    score:     lastRecord.score,
    co2:       lastRecord.totalCo2,
    date:      lastRecord.date,
    caption:   captions[Math.floor(Math.random() * captions.length)],
    likes:     0,
    photo:     Math.floor(Math.random() * POST_PHOTOS.length),
    isMe:      true,
  };
  userSocialPosts.push(post);
  localStorage.setItem("userSocialPosts", JSON.stringify(userSocialPosts));
  showToast("已分享到社群！");
  showScreen("social");
  renderSocialPage();
}

// ── AI 小綠 ──────────────────────────────────────────────

const AI_BUBBLE_MSGS = [
  "有問題都可以找我喔！ 😊",
  "需要幫你規劃低碳旅程嗎？🌿",
  "試試智能旅遊規劃！✨",
  "低碳旅遊，一起守護地球 🌍",
  "點我了解 App 怎麼用 📱",
  "選高鐵、台鐵，碳排最低喔！🚄",
];
let _aiBubbleIdx = 0;
let _aiTypingTimer = null;

function openAIMenu() {
  const overlay = document.getElementById("ai-overlay");
  if (!overlay) return;
  overlay.style.display = "flex";
  document.getElementById("ai-sheet-content").innerHTML = `
    <div class="ai-sheet-header">
      <div class="ai-sheet-avatar">🌿</div>
      <div>
        <div class="ai-sheet-title">小綠 AI 助理</div>
        <div class="ai-sheet-sub">你的低碳旅遊規劃好幫手 ✨</div>
      </div>
    </div>
    <button class="ai-option-btn" onclick="startAppGuide()">
      <div class="ai-option-icon" style="background:#e8f4eb">📱</div>
      <div>
        <div class="ai-option-title">App 使用指南</div>
        <div class="ai-option-sub">了解碳索世界的所有功能</div>
      </div>
    </button>
    <button class="ai-option-btn" onclick="startAIPlanning()">
      <div class="ai-option-icon" style="background:#eff6ff">🗺️</div>
      <div>
        <div class="ai-option-title">智能旅遊規劃</div>
        <div class="ai-option-sub">告訴我需求，我幫你規劃低碳行程！</div>
      </div>
    </button>
  `;
}

function closeAIMenu() {
  const overlay = document.getElementById("ai-overlay");
  if (overlay) overlay.style.display = "none";
  if (_aiTypingTimer) { clearInterval(_aiTypingTimer); _aiTypingTimer = null; }
}

function typewrite(el, text, speed, onDone) {
  if (_aiTypingTimer) clearInterval(_aiTypingTimer);
  let i = 0;
  const cursor = document.createElement("span");
  cursor.className = "ai-typing-cursor";
  el.textContent = "";
  el.appendChild(cursor);
  _aiTypingTimer = setInterval(() => {
    if (i < text.length) {
      el.textContent = text.slice(0, ++i);
      el.appendChild(cursor);
    } else {
      clearInterval(_aiTypingTimer);
      _aiTypingTimer = null;
      el.textContent = text;
      if (onDone) onDone();
    }
  }, speed || 18);
}

function startAppGuide() {
  const content = document.getElementById("ai-sheet-content");
  const guideText = `嗨！我是小綠 🌿 歡迎使用碳索世界！

讓我介紹主要功能：

📍 旅遊計算
輸入出發地和目的地，比較高鐵、台鐵、公車、汽車等所有交通方式的碳排量，選擇最環保的路線！

🏨 住宿規劃
切換「住宿」標籤，搜尋環境部認證的環保旅宿（金、銀、銅級），或選擇住宿類型計算碳排。

🍱 飲食記錄
在「飲食」標籤記錄每頓餐點，系統自動計算食物碳足跡。素食最環保喔！

📊 行程總覽
查看本次旅程的總碳排、費用，以及交通、住宿、飲食的占比分析。

🏆 社群分享
旅程結束後分享成果到社群，在排行榜上和其他環保旅人互相激勵！

🌳 低碳評分
每次旅行選越低碳的方式分數越高，挑戰 100 分完美旅行！

有任何問題都歡迎來找我 😊`;

  content.innerHTML = `
    <button class="ai-back-btn" onclick="openAIMenu()">← 返回</button>
    <div class="ai-sheet-header">
      <div class="ai-sheet-avatar" style="font-size:20px">📱</div>
      <div>
        <div class="ai-sheet-title">App 使用指南</div>
        <div class="ai-sheet-sub">小綠說明</div>
      </div>
    </div>
    <div class="ai-chat-msg" id="ai-guide-text"></div>
  `;
  setTimeout(() => {
    const el = document.getElementById("ai-guide-text");
    if (el) typewrite(el, guideText, 14);
  }, 80);
}

function startAIPlanning() {
  const content = document.getElementById("ai-sheet-content");
  content.innerHTML = `
    <button class="ai-back-btn" onclick="openAIMenu()">← 返回</button>
    <div class="ai-sheet-header">
      <div class="ai-sheet-avatar" style="font-size:20px">🗺️</div>
      <div>
        <div class="ai-sheet-title">智能旅遊規劃</div>
        <div class="ai-sheet-sub">告訴我需求，我來幫你規劃！</div>
      </div>
    </div>
    <div class="ai-plan-form">
      <div class="ai-plan-form-row">
        <input class="ai-input" id="ai-from"   placeholder="出發地，例：台北車站"/>
        <input class="ai-input" id="ai-to"     placeholder="目的地，例：台南市"/>
      </div>
      <div class="ai-plan-form-row">
        <input class="ai-input" id="ai-days"   type="number" placeholder="天數" min="1" max="14" style="max-width:80px"/>
        <input class="ai-input" id="ai-pax"    type="number" placeholder="人數" min="1" max="20" style="max-width:80px"/>
        <input class="ai-input" id="ai-budget" type="number" placeholder="預算/人（元）"/>
      </div>
    </div>
    <button class="ai-plan-btn" id="ai-plan-btn" onclick="runAIPlanning()">✨ 開始規劃低碳行程</button>
    <div id="ai-plan-result"></div>
  `;
}

function runAIPlanning() {
  const from   = (document.getElementById("ai-from")?.value   || "台北").trim();
  const to     = (document.getElementById("ai-to")?.value     || "台南").trim();
  const days   = parseInt(document.getElementById("ai-days")?.value)   || 2;
  const pax    = parseInt(document.getElementById("ai-pax")?.value)    || 2;
  const budget = parseInt(document.getElementById("ai-budget")?.value) || 2000;

  const btn = document.getElementById("ai-plan-btn");
  if (btn) { btn.disabled = true; btn.textContent = "規劃中… 🌿"; }

  const planText = generateAIPlan(from, to, days, pax, budget);
  const resultEl = document.getElementById("ai-plan-result");
  if (!resultEl) return;

  resultEl.innerHTML = `
    <div class="ai-section-label">✨ 小綠 AI 規劃結果</div>
    <div class="ai-chat-msg" id="ai-plan-text"></div>
  `;

  setTimeout(() => {
    const el = document.getElementById("ai-plan-text");
    if (!el) return;
    typewrite(el, planText, 16, () => {
      if (btn) { btn.disabled = false; btn.textContent = "✨ 重新規劃"; }
    });
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

function generateAIPlan(from, to, days, pax, budget) {
  const nights   = Math.max(0, days - 1);
  const isEast   = ["花蓮","台東","宜蘭"].some(c => to.includes(c));
  const isSouth  = ["台南","高雄","屏東","嘉義"].some(c => to.includes(c));
  const trainName  = isEast ? "自強號 / 太魯閣號" : (isSouth ? "台灣高鐵" : "台鐵自強號");
  const transCo2   = isEast ? 0.55 : (isSouth ? 0.38 : 0.35);
  const transCost  = isEast ? 440  : (isSouth ? 840  : 350);
  const duration   = isEast ? "3小時30分" : (isSouth ? "1小時40分" : "2小時");
  const hotelCo2   = nights * 7;
  const foodCo2    = parseFloat((days * 3 * 1.2).toFixed(1));
  const totalCo2   = parseFloat((transCo2 * 2 + hotelCo2 + foodCo2).toFixed(1));
  const trees      = Math.max(1, Math.ceil(totalCo2 / 12));
  const estCost    = transCost * 2 + nights * 1000 + days * 500;
  const budgetLeft = budget - estCost;

  return `感謝你的需求！為你規劃 ${from} → ${to} 低碳行程 🌿

━━━ 行程總覽 ━━━
📍 出發地：${from}
🏁 目的地：${to}
📅 天數：${days}天${nights > 0 ? nights + "夜" : "（當天來回）"}
👥 人數：${pax}人
💰 預算：$${budget.toLocaleString()}/人

━━━ 交通建議 ━━━
🚄 推薦：${trainName}（單程）
   碳排：${transCo2} kg CO₂/人
   費用：約 $${transCost}/人
   車程：${duration}
   ★ 比自駕減少約 87% 碳排！

━━━ 住宿推薦 ━━━
🌿 環境部認證金級環保旅宿
   碳排：7 kg CO₂/晚
   預估費用：$800–1,200/晚
   📍 市區步行即可抵達主要景點
${nights === 0 ? "（當天來回，無住宿費用）\n" : ""}
━━━ 第一天行程 ━━━
08:30 出發：搭乘 ${trainName}（${duration}）
${isEast ? "12:00" : "10:30"} 抵達 ${to}，步行前往市區 🚶
${isEast ? "12:30" : "11:30"} 午餐：在地素食小吃（碳排 1.2 kg）🥗
14:00 騎腳踏車探索 ${to}（零碳 🚲）
17:00 遊覽地標景點 / 老街
18:30 晚餐：當地特色料理（碳排 2.5 kg）
${nights > 0 ? "20:00 入住環保旅宿（金級認證）\n" : "20:00 搭車返回 " + from + "\n"}${days > 1 ? `
━━━ 第二天行程 ━━━
08:00 旅宿蔬食早餐（碳排 0.8 kg）🌿
09:30 繼續騎腳踏車探索（零碳 🚲）
12:00 午餐：在地特色料理（碳排 2.8 kg）
14:00 逛博物館 / 自然景點
${days > 2 ? "17:00 繼續探索更多景點\n" : "16:00 前往車站，搭車返回 " + from + "\n"}` : ""}
━━━ 碳排估算 ━━━
🚄 交通：${(transCo2 * 2).toFixed(2)} kg（雙程）
🏨 住宿：${hotelCo2} kg（${nights} 晚）
🍱 飲食：${foodCo2} kg（${days} 天）
📊 總計：約 ${totalCo2} kg CO₂/人

💡 比全程自駕少排放約 ${Math.round(totalCo2 * 3)} kg CO₂
   相當於種了 ${trees} 棵樹的吸碳量 🌳
${budgetLeft >= 0 ? `💰 預計花費約 $${estCost.toLocaleString()}/人，預算剩 $${budgetLeft.toLocaleString()} 可用於體驗活動！` : `💰 預計花費約 $${estCost.toLocaleString()}/人`}

🌿 低碳評分預估：88 分，非常棒！
記得用 App 的旅遊計算功能，獲得更精準的碳排數據 😊`;
}

// 定時氣泡提示
let _bubbleTimer = null;

function showAIBubble(msg, prominent = false) {
  const activeScreen = document.querySelector(".screen.active");
  const noNavScreens = ["login", "splash", "report", "spot-detail", "shop"];
  if (!activeScreen || noNavScreens.includes(activeScreen.id)) return;
  const el = document.getElementById("ai-bubble");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("prominent", prominent);
  el.classList.add("show");
  setTimeout(() => { el.classList.remove("show"); el.classList.remove("prominent"); }, prominent ? 5000 : 4000);
  document.querySelectorAll(".nav-ai-circle").forEach(c => {
    c.classList.remove("wiggle");
    void c.offsetWidth;
    c.classList.add("wiggle");
  });
}

function startAIBubbles() {
  // 首次出現：12 秒後
  setTimeout(() => showAIBubble(AI_BUBBLE_MSGS[_aiBubbleIdx++ % AI_BUBBLE_MSGS.length]), 12000);
  // 之後每 90 秒一次
  _bubbleTimer = setInterval(() => {
    showAIBubble(AI_BUBBLE_MSGS[_aiBubbleIdx++ % AI_BUBBLE_MSGS.length]);
  }, 90000);
}

// ── 小綠商店 ──────────────────────────────────────────
function renderShop() {
  const pts = state.points || 0;
  const vouchers = [
    { pts: 2000, icon: "🎟", title: "大面額禮券", desc: "小綠商店 500 元折扣券", color: "#4caf6e" },
    { pts: 3000, icon: "🌳", title: "愛心種樹", desc: "為地球種下一棵樹，獲得「種樹天使」稱號", color: "#2d5e3a" },
  ];
  document.getElementById("shop-points").textContent = pts;
  document.getElementById("shop-list").innerHTML = vouchers.map(v => {
    const canRedeem = pts >= v.pts;
    return `
      <div class="shop-card ${canRedeem ? "" : "shop-card--locked"}">
        <div class="shop-card-icon" style="background:${v.color}20;color:${v.color}">${v.icon}</div>
        <div class="shop-card-info">
          <div class="shop-card-title">${v.title}</div>
          <div class="shop-card-desc">${v.desc}</div>
          <div class="shop-card-pts">${v.pts.toLocaleString()} 點</div>
        </div>
        <button class="shop-redeem-btn" ${canRedeem ? "" : "disabled"}
          onclick="redeemVoucher(${v.pts},'${v.title}')">
          ${canRedeem ? "兌換" : "點數不足"}
        </button>
      </div>`;
  }).join("");
}

function redeemVoucher(cost, name) {
  if ((state.points || 0) < cost) return;
  if (!confirm(`確定使用 ${cost} 點兌換「${name}」？`)) return;
  state.points -= cost;
  localStorage.setItem("points", state.points);
  if (cost === 3000) {
    state.achievements.treeAngel = 1;
    localStorage.setItem("achievements", JSON.stringify(state.achievements));
    showToast("🌲 已解鎖成就「種樹天使」！");
  } else {
    showToast(`🎉 已兌換「${name}」！`);
  }
  renderShop();
  const profPts = document.getElementById("prof-points");
  if (profPts) profPts.textContent = state.points;
}

// ── 初始化 ────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  renderHotelLogs();
  renderFoodLogs();
  renderPartnerHotels();
  renderPartnerRestaurants();

  initIntroSlider();

  const today = new Date().toISOString().split("T")[0];
  const sdEl = document.getElementById("trip-start-date");
  if (sdEl) sdEl.value = today;

  // 在所有 navbar 的「總覽」按鈕前插入 AI 小綠按鈕
  document.querySelectorAll(".navbar").forEach(nav => {
    const overviewBtn = nav.querySelector('[data-screen="overview"]');
    if (!overviewBtn) return;
    const aiBtn = document.createElement("button");
    aiBtn.className = "nav-ai-btn";
    aiBtn.onclick = openAIMenu;
    aiBtn.innerHTML = '<div class="nav-ai-circle">🌿</div>小綠';
    nav.insertBefore(aiBtn, overviewBtn);
  });

  // 啟動 AI 小綠氣泡提示
  startAIBubbles();
});