const KEY = "sealRealmMemory";

const TRANSFER_KEY = "sealRealmTransferPiece";

const names = {
  shape: { bowl: "碗", jar: "罐", cup: "盏", "seal-square": "方章", "seal-round": "圆章", "seal-rect": "长方章" },
  pattern: { none: "未刻纹", lotus: "莲瓣", wave: "水波", cloud: "云纹", pinch: "手捏" },
  glaze: { raw: "素胎", pale: "淡青", lake: "湖青", green: "青绿", gray: "青灰" },
  fire: { none: "未入窑", low: "低火", medium: "适中", high: "高火" },
};

function isSealShape(shape) {
  return String(shape ?? state.shape).startsWith("seal-");
}

function workTypeLabel() {
  return isSealShape() ? "印章" : "器物";
}

const stageCopy = {
  clay: ["泥被淘净", "胎体成型", "边口修稳"],
  pattern: ["第一刀落下", "纹路顺器身展开", "纹样入胎"],
  glaze: ["釉色初覆", "釉面沉静", "青色成层"],
  kiln: ["火被喂起", "窑口封稳", "温度成熟"],
};

const kilnActionCopy = {
  feed: "添柴",
  seal: "封窑",
  wait: "候温",
};

const qteGrades = {
  fail: { label: "失", text: "失手", multiplier: 0.72 },
  good: { label: "良", text: "良好", multiplier: 1 },
  excellent: { label: "优", text: "优秀", multiplier: 1.18 },
  perfect: { label: "绝", text: "绝佳", multiplier: 1.35 },
};

const processActionCopy = {
  clay: { wash: "淘泥", pull: "成型", trim: "修边" },
  pattern: { cut: "起刀", trace: "走线", settle: "收纹" },
  glaze: { first: "初施", rest: "静置", second: "复施" },
};

const patternActionCopy = {
  lotus: { cut: "起瓣", trace: "压脉", settle: "合瓣" },
  wave: { cut: "起线", trace: "推波", settle: "收势" },
  cloud: { cut: "起云", trace: "回旋", settle: "合纹" },
  pinch: { cut: "定痕", trace: "塑形", settle: "修整" },
  none: { cut: "起刀", trace: "走线", settle: "收纹" },
};

const state = {
  tab: "clay",
  shape: "bowl",
  pattern: "none",
  selectedPatterns: [],
  glaze: "lake",
  fire: "medium",
  lastAction: "idle",
  customTitle: "",
  sealText: "",
  sealFont: "serif",
  sculpt: { mouth: 1, belly: 1, height: 1 },
  patternControl: { density: 1, depth: 1, band: 1, brush: 1, tool: "rotate" },
  steps: { clay: 0, pattern: 0, glaze: 0, kiln: 0 },
  processGrades: { clay: {}, pattern: {}, glaze: {} },
  patternProgress: {
    lotus: { steps: 0, grades: {} },
    wave: { steps: 0, grades: {} },
    cloud: { steps: 0, grades: {} },
    pinch: { steps: 0, grades: {} },
  },
  kilnGrades: { feed: null, seal: null, wait: null },
  qte: { active: null, tab: null, action: null, pos: 0, dir: 1, raf: null, startedAt: 0, lastTime: 0 },
  valueOverride: null,
  fired: false,
};

state.patternControls = {
  lotus: { density: 1, depth: 1, band: 1, brush: 1, tool: "rotate" },
  wave: { density: 1, depth: 1, band: 1, brush: 1, tool: "rotate" },
  cloud: { density: 1, depth: 1, band: 1, brush: 1, tool: "rotate" },
  pinch: { density: 1, depth: 1, band: 1, brush: 1, tool: "rotate" },
};

const artifact = document.getElementById("artifact");
const kilnAura = document.getElementById("kilnAura");
const craftBurst = document.getElementById("craftBurst");
const progressFill = document.getElementById("progressFill");
const stageLine = document.getElementById("stageLine");
const resultSheet = document.getElementById("resultSheet");
const toast = document.getElementById("toast");
const cover = document.getElementById("cover");
const coverStart = document.getElementById("coverStart");
const qtePanel = document.getElementById("qtePanel");
const qteTrack = document.getElementById("qteTrack");
const qtePointer = document.getElementById("qtePointer");
const qteTitle = document.getElementById("qteTitle");
const qteHint = document.getElementById("qteHint");

function ensureSculptControls() {
  const clayPanel = document.querySelector('[data-panel="clay"]');
  const optionGrid = clayPanel?.querySelector(".option-grid");
  if (!clayPanel || !optionGrid || clayPanel.querySelector(".sculpt-controls")) return;

  const controls = document.createElement("div");
  controls.className = "sculpt-controls";
  controls.innerHTML = `
    <label><span>口径</span><input type="range" min="82" max="118" value="100" data-sculpt="mouth"></label>
    <label><span>腹量</span><input type="range" min="88" max="118" value="100" data-sculpt="belly"></label>
    <label><span>高度</span><input type="range" min="90" max="122" value="100" data-sculpt="height"></label>
  `;
  optionGrid.insertAdjacentElement("afterend", controls);
}

function ensurePatternControls() {
  const patternPanel = document.querySelector('[data-panel="pattern"]');
  const optionGrid = patternPanel?.querySelector(".option-grid");
  const actionRow = patternPanel?.querySelector('[data-actions="pattern"]');
  if (!patternPanel || !optionGrid || patternPanel.querySelector(".pattern-controls")) return;

  const controls = document.createElement("div");
  controls.className = "sculpt-controls pattern-controls";
  controls.innerHTML = `
    <div class="seal-letter-controls" data-seal-letter-controls>
      <div class="seal-letter-heading"><b>印面刻字</b><span>只刻在印章底部，文字越多排版越紧凑。</span></div>
      <label><span>文字</span><input type="text" maxlength="12" placeholder="输入要刻的字" data-seal-text></label>
      <label><span>字体</span><select data-seal-font>
        <option value="serif">宋体 · 清峻</option>
        <option value="kai">楷体 · 温润</option>
        <option value="li">隶书 · 古拙</option>
        <option value="seal">篆书 · 印味</option>
        <option value="fangsong">仿宋 · 端正</option>
      </select></label>
    </div>
    <div class="tool-toggle" role="group" aria-label="手捏工具">
      <button type="button" data-pattern-tool="carve">刻画</button>
      <button type="button" data-pattern-tool="add">加泥</button>
      <button type="button" data-pattern-tool="erase">橡皮</button>
      <button type="button" data-pattern-command="undo">撤回</button>
      <button class="active" type="button" data-pattern-tool="rotate">旋转</button>
    </div>
    <label data-pattern-control-wrap="density"><span>密度</span><input type="range" min="70" max="150" value="100" data-pattern-control="density"></label>
    <label data-pattern-control-wrap="depth"><span>深浅</span><input type="range" min="55" max="155" value="100" data-pattern-control="depth"></label>
    <label data-pattern-control-wrap="brush"><span>笔刷</span><input type="range" min="45" max="180" value="100" data-pattern-control="brush"></label>
    <label data-pattern-control-wrap="band"><span>位置</span><input type="range" min="20" max="180" value="100" data-pattern-control="band"></label>
    <div class="pattern-stack" id="patternStack"></div>
  `;
  const sealFontSelect = controls.querySelector("[data-seal-font]");
  if (sealFontSelect && !sealFontSelect.options.length) {
    [
      ["serif", "宋体 · 清峻"],
      ["kai", "楷体 · 温润"],
      ["li", "隶书 · 古拙"],
      ["seal", "篆书 · 印味"],
      ["fangsong", "仿宋 · 端正"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      sealFontSelect.appendChild(option);
    });
  }
  if (actionRow) {
    actionRow.insertAdjacentElement("beforebegin", controls);
  } else {
    optionGrid.insertAdjacentElement("afterend", controls);
  }
}

function clampStep(tab) {
  state.steps[tab] = Math.max(0, Math.min(3, state.steps[tab]));
}

function totalProgress() {
  return Object.values(state.steps).reduce((sum, value) => sum + value, 0);
}

function patternQueue() {
  return [...new Set([...state.selectedPatterns, state.pattern].filter((pattern) => pattern && pattern !== "none"))];
}

function firstIncompletePattern() {
  return patternQueue().find((pattern) => (state.patternProgress[pattern]?.steps || 0) < 3) || null;
}

function isPatternComplete() {
  if (state.pattern === "none" && !state.selectedPatterns.length) return true;
  return (state.patternProgress[state.pattern]?.steps || 0) >= 3;
}

function isComplete() {
  return state.steps.clay >= 3 && isPatternComplete() && state.steps.glaze >= 3 && state.steps.kiln >= 3;
}

function currentPatternProgress() {
  if (!state.patternProgress[state.pattern]) {
    state.patternProgress[state.pattern] = { steps: 0, grades: {} };
  }
  return state.patternProgress[state.pattern];
}

function currentPatternControl() {
  if (!state.patternControls[state.pattern]) {
    state.patternControls[state.pattern] = { density: 1, depth: 1, band: 1, brush: 1, tool: "rotate" };
  }
  state.patternControl = state.patternControls[state.pattern];
  return state.patternControls[state.pattern];
}

function patternControlFor(pattern) {
  if (!state.patternControls[pattern]) {
    state.patternControls[pattern] = { density: 1, depth: 1, band: 1, brush: 1, tool: "rotate" };
  }
  return state.patternControls[pattern];
}

function selectedPatternsWithProgress() {
  const selected = state.selectedPatterns.filter((pattern) => {
    const progress = state.patternProgress[pattern];
    return progress && progress.steps > 0;
  });
  if (state.pattern === "none") return selected;
  const current = currentPatternProgress().steps > 0 ? [state.pattern] : [];
  return [...new Set([...selected, ...current])];
}

function syncPatternStep() {
  state.steps.pattern = currentPatternProgress().steps;
}

function gradeMultiplier(grade) {
  return (qteGrades[grade] || qteGrades.good).multiplier;
}

function averageGrades(grades) {
  const done = grades.filter(Boolean);
  if (!done.length) return 1;
  return done.reduce((sum, grade) => sum + gradeMultiplier(grade), 0) / done.length;
}

function kilnGradeAverage() {
  return averageGrades(Object.values(state.kilnGrades));
}

function processAverage(tab) {
  if (tab === "pattern") {
    const grades = selectedPatternsWithProgress().flatMap((pattern) => Object.values(state.patternProgress[pattern]?.grades || {}));
    return averageGrades(grades.length ? grades : Object.values(currentPatternProgress().grades));
  }
  return averageGrades(Object.values(state.processGrades[tab] || {}));
}

function qualityToGrade(value) {
  if (value >= 1.26) return "perfect";
  if (value >= 1.08) return "excellent";
  if (value >= 0.88) return "good";
  return "fail";
}

function gradeProcessAction(tab, action) {
  if (tab === "clay") {
    const values = [state.sculpt.mouth, state.sculpt.belly, state.sculpt.height];
    const balance = 1 - Math.min(0.5, values.reduce((sum, value) => sum + Math.abs(value - 1), 0) / 1.15);
    const stageBonus = action === "trim" ? 0.12 : action === "pull" ? 0.06 : 0;
    return qualityToGrade(balance + stageBonus);
  }
  if (tab === "pattern") {
    const control = currentPatternControl();
    const tuned = 1 - Math.min(0.45, (
      Math.abs(control.density - 1) +
      Math.abs(control.depth - 1) +
      Math.abs(control.band - 1) * 0.8
    ) / 1.55);
    const brushBonus = state.pattern === "pinch" && control.tool !== "rotate" ? 0.14 : 0;
    const complexity = state.pattern === "lotus" || state.pattern === "cloud" ? 0.08 : 0;
    return qualityToGrade(tuned + brushBonus + complexity);
  }
  if (tab === "glaze") {
    const glazeBonus = { raw: -0.28, pale: 0.04, lake: 0.14, green: 0.1, gray: 0.02 }[state.glaze] || 0;
    const layerBonus = action === "second" ? 0.16 : action === "rest" ? 0.08 : 0;
    return qualityToGrade(0.9 + glazeBonus + layerBonus);
  }
  return "good";
}

function gradeSummary(tab) {
  const source = tab === "kiln" ? state.kilnGrades : tab === "pattern" ? currentPatternProgress().grades : state.processGrades[tab];
  const copy = tab === "kiln" ? kilnActionCopy : tab === "pattern" ? patternActionCopy[state.pattern] : processActionCopy[tab];
  return Object.keys(copy)
    .map((action) => `${copy[action]}${qteGrades[source[action] || "fail"].label}`)
    .join("、");
}

function allGrades() {
  const patternGrades = selectedPatternsWithProgress()
    .flatMap((pattern) => Object.values(state.patternProgress[pattern]?.grades || {}));
  return [
    ...Object.values(state.processGrades.clay),
    ...patternGrades,
    ...Object.values(state.processGrades.glaze),
    ...Object.values(state.kilnGrades),
  ].filter(Boolean);
}

function patternLabelList() {
  return selectedPatternsWithProgress().map((pattern) => names.pattern[pattern]).join("、");
}

function actionName(tab, action) {
  if (tab === "kiln") return kilnActionCopy[action] || action;
  if (tab === "pattern") return patternActionCopy[state.pattern]?.[action] || action;
  return processActionCopy[tab]?.[action] || action;
}

function actionGrade(tab, action) {
  if (tab === "kiln") return state.kilnGrades[action];
  if (tab === "pattern") return currentPatternProgress().grades[action];
  return state.processGrades[tab]?.[action];
}

function setBurst(text) {
  craftBurst.textContent = text;
  craftBurst.classList.remove("pop");
  void craftBurst.offsetWidth;
  craftBurst.classList.add("pop");
}

function updateArtifact() {
  const visiblePatterns = selectedPatternsWithProgress();
  const visiblePattern = visiblePatterns[0] || (isSealShape() && state.pattern !== "none" ? state.pattern : "none");
  const control = currentPatternControl();
  const visibleGlaze = state.steps.glaze ? state.glaze : "raw";
  const visibleFire = state.steps.kiln ? state.fire : "none";
  const grades = allGrades();
  const failCount = grades.filter((grade) => grade === "fail").length;
  const perfectCount = grades.filter((grade) => grade === "perfect").length;
  artifact.dataset.shape = state.shape;
  artifact.dataset.currentTab = state.tab;
  artifact.dataset.pattern = visiblePattern;
  artifact.dataset.currentPattern = state.pattern;
  artifact.dataset.patterns = visiblePatterns.join(",");
  artifact.dataset.patternSteps = visiblePatterns
    .map((pattern) => `${pattern}:${state.patternProgress[pattern]?.steps || 0}`)
    .join(",");
  artifact.dataset.patternControls = visiblePatterns
    .map((pattern) => {
      const item = patternControlFor(pattern);
      return `${pattern}:${item.density}:${item.depth}:${item.band}:${item.brush}`;
    })
    .join(",");
  artifact.dataset.glaze = visibleGlaze;
  artifact.dataset.fire = visibleFire;
  artifact.dataset.fired = state.fired ? "true" : "false";
  artifact.dataset.action = state.lastAction;
  artifact.dataset.patternTool = control.tool;
  artifact.dataset.sealText = state.sealText.trim();
  artifact.dataset.sealFont = state.sealFont;
  artifact.dataset.clayQuality = processAverage("clay").toFixed(3);
  artifact.dataset.patternQuality = processAverage("pattern").toFixed(3);
  artifact.dataset.glazeQuality = processAverage("glaze").toFixed(3);
  artifact.dataset.kilnQuality = kilnGradeAverage().toFixed(3);
  artifact.dataset.failCount = String(failCount);
  artifact.dataset.perfectCount = String(perfectCount);
  artifact.dataset.masterwork = grades.length > 0 && grades.every((grade) => grade === "perfect") ? "true" : "false";
  artifact.style.setProperty("--clay-step", state.steps.clay);
  artifact.style.setProperty("--pattern-step", state.steps.pattern);
  artifact.style.setProperty("--current-pattern-step", currentPatternProgress().steps);
  artifact.style.setProperty("--glaze-step", state.steps.glaze);
  artifact.style.setProperty("--kiln-step", state.steps.kiln);
  artifact.style.setProperty("--mouth", state.sculpt.mouth);
  artifact.style.setProperty("--belly", state.sculpt.belly);
  artifact.style.setProperty("--height", state.sculpt.height);
  artifact.style.setProperty("--pattern-density", control.density);
  artifact.style.setProperty("--pattern-depth", control.depth);
  artifact.style.setProperty("--pattern-brush", control.brush);
  artifact.style.setProperty("--pattern-band", control.band);
  kilnAura.dataset.fire = state.fire;
  kilnAura.dataset.on = state.tab === "kiln" || state.fired ? "true" : "false";
  document.documentElement.dataset.currentTab = state.tab;
  document.documentElement.dataset.workType = isSealShape() ? "seal" : "vessel";
}

function setPatternTool(tool) {
  currentPatternControl().tool = tool;
  document.querySelectorAll("button[data-pattern-tool]").forEach((item) => {
    item.classList.toggle("active", item.dataset.patternTool === tool);
  });
}

function syncPatternControlInputs() {
  const control = currentPatternControl();
  document.querySelectorAll("[data-pattern-control]").forEach((input) => {
    const key = input.dataset.patternControl;
    input.value = Math.round((control[key] ?? 1) * 100);
  });
  document.querySelectorAll("button[data-pattern-tool]").forEach((item) => {
    item.classList.toggle("active", item.dataset.patternTool === control.tool);
  });
}

function updatePatternControls() {
  const isPinch = state.pattern === "pinch";
  const isNone = state.pattern === "none";
  const isSeal = isSealShape();
  const panel = document.querySelector('[data-panel="pattern"]');
  const controls = document.querySelector(".pattern-controls");
  const actionRow = document.querySelector('[data-actions="pattern"]');
  const stepLabel = document.querySelector(".craft-step-label");
  const sealLetterControls = document.querySelector("[data-seal-letter-controls]");
  if (!controls) return;
  if (panel) panel.dataset.empty = isNone && !isSeal ? "true" : "false";
  syncPatternControlInputs();
  const sealTextInput = document.querySelector("[data-seal-text]");
  const sealFontInput = document.querySelector("[data-seal-font]");
  if (sealTextInput && sealTextInput.value !== state.sealText) sealTextInput.value = state.sealText;
  if (sealFontInput && sealFontInput.value !== state.sealFont) sealFontInput.value = state.sealFont;
  controls.hidden = isNone && !isSeal;
  if (sealLetterControls) sealLetterControls.hidden = !isSeal;
  if (actionRow) actionRow.hidden = isNone;
  if (stepLabel) stepLabel.hidden = isNone;
  if (isNone && !isSeal) {
    const stack = document.getElementById("patternStack");
    if (stack) stack.innerHTML = "";
    return;
  }
  if (isSeal) {
    controls.querySelector(".tool-toggle").hidden = true;
    controls.querySelectorAll("[data-pattern-control-wrap]").forEach((item) => { item.hidden = true; });
    if (actionRow) actionRow.hidden = true;
    if (stepLabel) stepLabel.hidden = true;
    const stack = document.getElementById("patternStack");
    if (stack) stack.innerHTML = "";
    return;
  }
  controls.dataset.mode = isPinch ? "hand" : "fixed";
  controls.querySelector(".tool-toggle").hidden = !isPinch;
  controls.querySelector('[data-pattern-control-wrap="brush"]').hidden = !isPinch;
  controls.querySelector('[data-pattern-control-wrap="band"]').hidden = isPinch;
  controls.querySelector('[data-pattern-control-wrap="density"]').hidden = false;
  controls.querySelector('[data-pattern-control-wrap="depth"]').hidden = false;
  document.querySelectorAll('[data-actions="pattern"] button').forEach((button) => {
    button.textContent = patternActionCopy[state.pattern][button.dataset.action] || button.textContent;
  });
  const stack = document.getElementById("patternStack");
  if (stack) {
    const stackPatterns = [...new Set([...state.selectedPatterns, state.pattern])];
    const selected = stackPatterns.map((pattern) => {
      const progress = state.patternProgress[pattern] || { steps: 0, grades: {} };
      const isSelected = state.selectedPatterns.includes(pattern);
      const active = pattern === state.pattern ? " active" : "";
      const draft = isSelected ? "" : " draft";
            const actionNames = Object.keys(progress.grades || {})
        .map((action) => patternActionCopy[pattern]?.[action])
        .filter(Boolean)
        .join("、");
      const label = !isSelected ? "操作中" : progress.steps >= 3 ? "已成纹" : progress.steps > 0 ? "起纹中" : "未起纹";
      const detail = actionNames ? `<em>${actionNames}</em>` : "";
      return `<span class="${active}${draft}">${names.pattern[pattern]}<strong>${label}</strong>${detail}</span>`;
    }).join("");
    stack.innerHTML = `<b>已叠加</b><div>${selected}</div><small>短按切换操作，长按加入或取消叠加</small>`;
  }
}

function updateChoiceButtons() {
  document.querySelectorAll("[data-choice]").forEach((button) => {
    const type = button.dataset.choice;
    const value = button.dataset.value;
    if (type === "pattern") {
      const selected = value === "none" ? state.pattern === "none" : state.selectedPatterns.includes(value);
      button.classList.toggle("selected", selected);
      button.classList.toggle("active-pattern", state.pattern === value);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      return;
    }
    button.classList.toggle("selected", state[type] === value);
  });
}

function updateStatus() {
  syncPatternStep();
  document.getElementById("shapeTag").textContent = names.shape[state.shape];
  const progressedPatterns = selectedPatternsWithProgress();
  const patternTag = document.getElementById("patternTag");
  if (state.pattern === "none") {
    patternTag.textContent = "无纹";
  } else if (state.steps.pattern > 0) {
    patternTag.textContent = names.pattern[state.pattern];
  } else if (progressedPatterns.length > 1) {
    patternTag.textContent = `${progressedPatterns.length}纹叠加`;
  } else if (progressedPatterns.length === 1) {
    patternTag.textContent = names.pattern[progressedPatterns[0]];
  } else if (state.selectedPatterns.length > 1) {
    patternTag.textContent = `${state.selectedPatterns.length}纹待刻`;
  } else {
    patternTag.textContent = "未刻纹";
  }
  document.getElementById("glazeTag").textContent = state.steps.glaze ? names.glaze[state.glaze] : "素胎";
  document.getElementById("fireTag").textContent = state.steps.kiln ? names.fire[state.fire] : "未入窑";
  progressFill.style.width = `${Math.round((totalProgress() / 12) * 100)}%`;
  const finishBtn = document.getElementById("finishBtn");
  finishBtn.classList.toggle("ready", isComplete());
  finishBtn.disabled = !isComplete();
}

function updateQte() {
  const open = Boolean(state.qte.active);
  if (open) {
    const actionRow = document.querySelector(`[data-actions="${state.qte.tab}"]`);
    if (actionRow && qtePanel.parentElement !== actionRow.parentElement) {
      actionRow.insertAdjacentElement("beforebegin", qtePanel);
    } else if (actionRow && qtePanel.nextElementSibling !== actionRow) {
      actionRow.insertAdjacentElement("beforebegin", qtePanel);
    }
    if (actionRow) {
      qtePanel.style.setProperty("--qte-anchor-offset", `${actionRow.offsetHeight + 8}px`);
    }
  }
  qtePanel.dataset.open = open ? "true" : "false";
  qtePanel.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) {
    qteTitle.textContent = `${actionName(state.qte.tab, state.qte.action)}时机`;
    qteHint.textContent = "再次点击轨道或当前按钮完成判定";
  } else {
    qteTitle.textContent = "工艺判定";
    qteHint.textContent = "指针进入金色区间时点击";
  }
  qtePointer.style.left = `${Math.round(state.qte.pos * 1000) / 10}%`;
}

function updateTabs() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === state.tab);
    button.classList.toggle("done", state.steps[button.dataset.tab] === 3);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === state.tab);
  });
}

function updateActionButtons(tab) {
  document.querySelectorAll(`[data-actions="${tab}"] button`).forEach((button, index) => {
    if (tab === "kiln") {
      const grade = state.kilnGrades[button.dataset.action];
      button.classList.toggle("done", Boolean(grade));
      button.classList.toggle("locked", Boolean(grade));
      button.classList.toggle("judging", state.qte.tab === tab && state.qte.action === button.dataset.action);
      button.disabled = Boolean(grade);
      let badge = button.querySelector(".grade-badge");
      if (grade && !badge) {
        badge = document.createElement("span");
        badge.className = "grade-badge";
        button.appendChild(badge);
      }
      if (badge) {
        badge.textContent = grade ? qteGrades[grade].label : "";
        if (!grade) badge.remove();
      }
      return;
    }
    const grade = tab === "pattern" ? currentPatternProgress().grades[button.dataset.action] : state.processGrades[tab]?.[button.dataset.action];
    const stepCount = tab === "pattern" ? currentPatternProgress().steps : state.steps[tab];
    button.classList.toggle("done", index < stepCount);
    button.classList.toggle("locked", Boolean(grade));
    button.classList.toggle("judging", state.qte.tab === tab && state.qte.action === button.dataset.action);
    button.disabled = Boolean(grade);
    let badge = button.querySelector(".grade-badge");
    if (grade && !badge) {
      badge = document.createElement("span");
      badge.className = "grade-badge";
      button.appendChild(badge);
    }
    if (badge) {
      badge.textContent = grade ? qteGrades[grade].label : "";
      if (!grade) badge.remove();
    }
  });
}

function updateLine() {
  const lines = {
    clay: isSealShape() ? "先定章形，印身稳，印面才压得住。" : "先把泥性稳住，器形才会站起来。",
    pattern: state.pattern === "pinch"
      ? ({
        rotate: isSealShape() ? "旋转模式：拖动印章，可以翻到底部看印面。" : "旋转模式：拖动器身查看不同角度。",
        carve: isSealShape() ? "刻画模式：把章底翻到眼前，痕迹会落在印面上。" : "刻画模式：鼠标点到器身哪里，痕迹就落在哪里。",
        add: isSealShape() ? "加泥模式：在印面上补出凸起线。" : "加泥模式：拖动器身，把泥慢慢补上去。",
        erase: "橡皮模式：擦掉靠近鼠标的手作痕迹。",
      }[currentPatternControl().tool] || "手捏模式：先选工具，再在器身上操作。")
      : (isSealShape() ? "印章纹样刻在底部印面上，拖动模型可以翻看章底。" : "纹样不是贴上去的，是顺着器身长出来的。"),
    glaze: isSealShape() ? "釉色覆过章身，边角会先亮起来。" : "釉色一层一层覆上去，青色才会沉下来。",
    kiln: isSealShape() ? "火候决定印章的釉光、边角和压手感。" : "火候决定最后的颜色、亮度和重量感。",
  };
  stageLine.textContent = lines[state.tab];
}

function render() {
  syncPatternStep();
  updateArtifact();
  updateStatus();
  updateTabs();
  updateChoiceButtons();
  updatePatternControls();
  updateLine();
  updateQte();
  Object.keys(state.steps).forEach(updateActionButtons);
}

function gradeQtePosition(pos) {
  const distance = Math.abs(pos - 0.5);
  if (distance <= 0.018) return "perfect";
  if (distance <= 0.085) return "excellent";
  if (distance <= 0.23) return "good";
  return "fail";
}

function stopQte() {
  if (state.qte.raf) cancelAnimationFrame(state.qte.raf);
  state.qte.raf = null;
}

function tickQte(time) {
  if (!state.qte.active) return;
  const last = state.qte.lastTime || time;
  const delta = Math.min(48, time - last);
  state.qte.lastTime = time;
  state.qte.pos += state.qte.dir * delta * 0.00072;
  if (state.qte.pos >= 1) {
    state.qte.pos = 1;
    state.qte.dir = -1;
  } else if (state.qte.pos <= 0) {
    state.qte.pos = 0;
    state.qte.dir = 1;
  }
  if (time - state.qte.startedAt > 12000) {
    judgeQte("good");
    return;
  }
  updateQte();
  state.qte.raf = requestAnimationFrame(tickQte);
}

function startQte(tab, action) {
  if (actionGrade(tab, action)) return;
  if (state.qte.tab === tab && state.qte.action === action) {
    judgeQte();
    return;
  }
  stopQte();
  state.qte.active = `${tab}:${action}`;
  state.qte.tab = tab;
  state.qte.action = action;
  state.qte.pos = 0.08;
  state.qte.dir = 1;
  state.qte.startedAt = performance.now();
  state.qte.lastTime = state.qte.startedAt;
  setBurst(`${actionName(tab, action)}判定`);
  render();
  state.qte.raf = requestAnimationFrame(tickQte);
}

function judgeQte(forcedGrade) {
  if (!state.qte.active) return;
  const tab = state.qte.tab;
  const action = state.qte.action;
  const grade = forcedGrade || gradeQtePosition(state.qte.pos);
  stopQte();
  completeAction(tab, action, grade);
  state.qte.active = null;
  state.qte.tab = null;
  state.qte.action = null;
  render();
}

function choose(type, value, button) {
  state[type] = value;
  if (type === "shape") state.steps.clay = Math.max(state.steps.clay, 0);
  if (type === "pattern") {
    if (value === "none") {
      state.selectedPatterns = [];
      state.steps.pattern = 0;
    } else if (value === "pinch") {
      // Enter hand shaping in carve mode so the first drag records a mark.
      currentPatternControl().tool = "carve";
    }
    syncPatternStep();
    if (value !== "none") {
      currentPatternControl();
      syncPatternControlInputs();
    }
    render();
    return;
  }
  if (type === "glaze") state.steps.glaze = Math.max(state.steps.glaze, 0);
  if (type === "fire") state.steps.kiln = Math.max(state.steps.kiln, 0);
  render();
}

function togglePatternSelection(value) {
  if (value === "none") return;
  const wasSelected = state.selectedPatterns.includes(value);
  if (!state.patternProgress[value]) state.patternProgress[value] = { steps: 0, grades: {} };
  state.selectedPatterns = state.selectedPatterns.filter((pattern) => pattern !== "none");

  if (wasSelected) {
    state.selectedPatterns = state.selectedPatterns.filter((pattern) => pattern !== value);
    if (state.pattern === value) {
      state.pattern = state.selectedPatterns[0] || "none";
    }
  } else {
    state.selectedPatterns = [...state.selectedPatterns, value];
    if (state.pattern === "none") {
      state.pattern = value;
    }
  }

  if (!state.selectedPatterns.length && state.pattern !== "none") {
    state.selectedPatterns = [state.pattern];
  }

  syncPatternStep();
  if (state.pattern !== "none") {
    currentPatternControl();
    syncPatternControlInputs();
  }
  setBurst(state.selectedPatterns.includes(value) ? `${names.pattern[value]}已叠加` : `${names.pattern[value]}已取消叠加`);
  render();
}

function completeAction(tab, action, grade) {
  if (tab === "pattern") {
    const patternProgress = currentPatternProgress();
    if (!state.selectedPatterns.includes(state.pattern)) {
      state.selectedPatterns = [...state.selectedPatterns, state.pattern];
    }
    patternProgress.grades[action] = grade;
    patternProgress.steps = Math.min(3, Object.values(patternProgress.grades).filter(Boolean).length);
    state.steps.pattern = patternProgress.steps;
  } else if (tab === "kiln") {
    state.kilnGrades[action] = grade;
    state.steps.kiln = Object.values(state.kilnGrades).filter(Boolean).length;
  } else {
    if (!state.processGrades[tab]) state.processGrades[tab] = {};
    state.processGrades[tab][action] = grade;
    state.steps[tab] = Object.values(state.processGrades[tab]).filter(Boolean).length;
  }
  state.lastAction = action;
  state.fired = false;
  state.valueOverride = null;
  state.customTitle = "";
  setBurst(`${actionName(tab, action)}：${qteGrades[grade].text}`);
  artifact.classList.remove("pulse");
  void artifact.offsetWidth;
  artifact.classList.add("pulse");
}

function act(tab, button) {
  if (tab === "pattern") syncPatternStep();
  clampStep(tab);
  const actions = [...document.querySelectorAll(`[data-actions="${tab}"] button`)];
  const stepCount = tab === "pattern" ? currentPatternProgress().steps : state.steps[tab];
  const expectedButton = actions[stepCount];
  const target = button || expectedButton;
  if (!target || stepCount >= 3) {
    setBurst("这一道已经完成");
    return;
  }
  if (target !== expectedButton && !actionGrade(tab, target.dataset.action)) {
    setBurst("请按顺序操作");
    return;
  }
  startQte(tab, target.dataset.action);
}

function actKiln(button) {
  act("kiln", button);
}

function resultTitle() {
  const patterns = selectedPatternsWithProgress();
  const patternNames = patterns.map((pattern) => names.pattern[pattern]).join("、");
  const patternPart = patterns.length === 0
    ? "素面"
    : patterns.length === 1
      ? patternNames
    : patterns.length === 2
      ? "双纹"
      : `${patterns.length}纹`;
  const generated = isSealShape()
    ? `${names.glaze[state.glaze]}${patternPart}${names.shape[state.shape]}`
    : `${names.glaze[state.glaze]}${patternPart}${names.shape[state.shape]}`;
  return (state.customTitle || generated).trim();
}

function resultReview() {
  const grades = allGrades();
  const failCount = grades.filter((grade) => grade === "fail").length;
  const perfectCount = grades.filter((grade) => grade === "perfect").length;
  const allPerfect = grades.length > 0 && grades.every((grade) => grade === "perfect");
  const patternList = patternLabelList() || "无纹素面";

  if (allPerfect) {
    return isSealShape()
      ? `这枚${resultTitle()}已经有成印的气场了。章形稳，${patternList}和印面咬得很紧，釉色与火候也压得住场，整体非常完整。`
      : `这件${resultTitle()}已经有大师作的气场了。器形稳，${patternList}和器身咬得很紧，釉色与火候也压得住场，整体非常完整。`;
  }
  if (failCount >= 10) {
    return `这件${resultTitle()}的失手很明显。器形、纹样、釉面和火候没有完全接住，所以成品会显得发飘、发虚，甚至有点荒诞。`;
  }
  if (failCount >= 6) {
    return `这件${resultTitle()}更像一件脾气很大的练习作。它不平，也不乖，但手作痕迹很强，能看出你在用力把它往作品的方向推。`;
  }
  if (perfectCount >= 3) {
    return isSealShape()
      ? `这枚${resultTitle()}已经开始有成印相了。章形、${patternList}、釉色和火候之间是顺的，整体看起来比较稳，也更适合入藏。`
      : `这件${resultTitle()}已经开始有成品相了。器形、${patternList}、釉色和火候之间是顺的，整体看起来比较稳，也更耐看。`;
  }
  return `鉴定：${resultTitle()}。泥（${gradeSummary("clay")}）、纹（${gradeSummary("pattern")}）、釉（${gradeSummary("glaze")}）、火（${gradeSummary("kiln")}）已经共同塑造了它，现在它更像一${isSealShape() ? "枚" : "件"}完整作品，而不只是步骤叠加。`;
}

function resultValueNumber() {
  if (state.valueOverride !== null) return state.valueOverride;
  const grades = allGrades();
  const failCount = grades.filter((grade) => grade === "fail").length;
  const perfectCount = grades.filter((grade) => grade === "perfect").length;
  if (grades.length > 0 && grades.every((grade) => grade === "perfect")) {
    state.valueOverride = 188888;
    return state.valueOverride;
  }
  let score = 34;
  score += state.steps.clay * 2 + state.steps.pattern * 2 + state.steps.glaze * 3 + state.steps.kiln * 3;
  if (selectedPatternsWithProgress().includes("pinch")) score += 4;
  if (selectedPatternsWithProgress().includes("lotus")) score += 3;
  if (selectedPatternsWithProgress().includes("cloud")) score += 3;
  if (selectedPatternsWithProgress().length > 1) score += selectedPatternsWithProgress().length * 2;
  if (state.glaze !== "raw") score += 4;
  if (state.fire === "medium") score += 3;
  if (state.fire === "high") score += 2;
  score += perfectCount * 4;
  score -= failCount * 9;
  const qualityFactor = processAverage("clay") * 0.28 + processAverage("pattern") * 0.22 + processAverage("glaze") * 0.24 + kilnGradeAverage() * 0.26;
  score *= qualityFactor * Math.pow(0.82, failCount);
  const shapeFactor = { bowl: 0.95, jar: 1.16, cup: 1.02, "seal-square": 1.08, "seal-round": 1.04, "seal-rect": 1.12 }[state.shape] || 1;
  const glazeFactor = { raw: 0.82, pale: 1.02, lake: 1.12, green: 1.18, gray: 1.05 }[state.glaze] || 1;
  const value = Math.round(score * shapeFactor * glazeFactor * 22);
  if (failCount >= 12) {
    state.valueOverride = Math.round(Math.random() * 88) - 66;
    return state.valueOverride;
  }
  if (failCount >= 10) {
    state.valueOverride = Math.round(Math.random() * 118) - 18;
    return state.valueOverride;
  }
  const floor = failCount >= 7 ? 49 : failCount >= 4 ? 180 : failCount >= 2 ? 680 : 980;
  const cap = failCount >= 7 ? 480 : failCount >= 4 ? 1200 : failCount >= 2 ? 2600 : 6800;
  return Math.max(floor, Math.min(cap, value));
}

function resultValue() {
  const value = resultValueNumber();
  const quality = Math.round((processAverage("clay") * 0.28 + processAverage("pattern") * 0.22 + processAverage("glaze") * 0.24 + kilnGradeAverage() * 0.26) * 100);
  const grades = allGrades();
  const failCount = grades.filter((grade) => grade === "fail").length;
  if (grades.length > 0 && grades.every((grade) => grade === "perfect")) {
    return `估值：¥${value}。评级：大师作。依据：四道工序全部压进最高判定，完整度和收藏感都已经拉满。`;
  }
  const level = failCount >= 12 ? "废品" : failCount >= 10 ? "严重残次" : failCount >= 7 ? "残次练习作" : failCount >= 4 ? "低阶练习作" : failCount >= 2 ? "普通手作" : "完整成品";
  const note = failCount >= 10 ? "失手太多，价格会明显塌下去。" : failCount >= 6 ? "失手偏多，但还保留一些手作趣味。" : "完成度比较稳，价格也更站得住。";
  return `估值：¥${value}。评级：${level}。依据：泥/纹/釉/火综合质量 ${quality} 分，失手 ${failCount} 处。${note}`;
}

function finish() {
  if (!isComplete()) {
    if (!isPatternComplete()) {
      const pendingPattern = firstIncompletePattern();
      state.tab = "pattern";
      if (pendingPattern) {
        state.pattern = pendingPattern;
        currentPatternControl();
        syncPatternControlInputs();
        setBurst(`先完成${names.pattern[pendingPattern]}的纹工序`);
      } else {
        setBurst("先把纹样工序做完");
      }
      render();
      return;
    }
    const missing = Object.entries(state.steps).find(([tab, value]) => tab !== "pattern" && value < 3);
    state.tab = missing ? missing[0] : state.tab;
    setBurst("先把四道工序做完");
    render();
    return;
  }
  state.fired = true;
  document.documentElement.classList.add("showcase");
  setBurst("烧成完成");
  render();
  const nameInput = document.getElementById("resultNameInput");
  if (nameInput) nameInput.value = state.customTitle;
  document.getElementById("resultTitle").textContent = resultTitle();
  document.getElementById("resultDesc").textContent = `${workTypeLabel()}形制、纹样、釉色和火候已经合成一${isSealShape() ? "枚" : "件"}${resultTitle()}。`;
  document.getElementById("resultReview").textContent = resultReview();
  document.getElementById("resultValue").textContent = resultValue();
  resultSheet.hidden = false;
}

function capturePreview() {
  const previewCanvas = document.getElementById("threeStage");
  if (!previewCanvas?.width || !previewCanvas?.height) return "";
  try {
    const ratio = previewCanvas.width / previewCanvas.height;
    const width = 520;
    const height = Math.round(width / Math.max(0.5, ratio));
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#071512";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(previewCanvas, 0, 0, width, height);
    return out.toDataURL("image/jpeg", 0.82);
  } catch {
    return "";
  }
}

function makeCraftResult() {
  const createdAt = new Date().toLocaleString("zh-CN");
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const patterns = selectedPatternsWithProgress();
  return {
    id,
    type: isSealShape() ? "seal" : "vessel",
    title: resultTitle(),
    shape: names.shape[state.shape],
    shapeCode: state.shape,
    pattern: names.pattern[state.pattern],
    patternCode: state.pattern,
    selectedPatterns: patterns.map((pattern) => names.pattern[pattern]),
    selectedPatternCodes: patterns,
    glaze: names.glaze[state.glaze],
    glazeCode: state.glaze,
    fire: names.fire[state.fire],
    fireCode: state.fire,
    customTitle: state.customTitle,
    sealText: state.sealText,
    sealFont: state.sealFont,
    review: resultReview(),
    value: resultValue(),
    valueNumber: resultValueNumber(),
    preview: capturePreview(),
    sculpt: { ...state.sculpt },
    model: {
      type: isSealShape() ? "seal" : "vessel",
      shape: state.shape,
      currentPattern: state.pattern,
      sealText: state.sealText,
      sealFont: state.sealFont,
      patterns,
      glaze: state.glaze,
      fire: state.fire,
      sculpt: { ...state.sculpt },
      patternSteps: artifact.dataset.patternSteps || "",
      patternControls: artifact.dataset.patternControls || "",
      clayQuality: artifact.dataset.clayQuality || "",
      patternQuality: artifact.dataset.patternQuality || "",
      glazeQuality: artifact.dataset.glazeQuality || "",
      kilnQuality: artifact.dataset.kilnQuality || "",
      failCount: artifact.dataset.failCount || "0",
      perfectCount: artifact.dataset.perfectCount || "0",
      masterwork: artifact.dataset.masterwork || "false",
      fired: artifact.dataset.fired || "false",
    },
    processGrades: state.processGrades,
    patternProgress: state.patternProgress,
    kilnGrades: state.kilnGrades,
    createdAt,
  };
}

function makeTransferPiece(piece) {
  return {
    id: piece.id,
    title: piece.title,
    shape: piece.shape,
    shapeCode: piece.shapeCode,
    pattern: piece.pattern,
    patternCode: piece.patternCode,
    selectedPatterns: piece.selectedPatterns || [],
    selectedPatternCodes: piece.selectedPatternCodes || [],
    glaze: piece.glaze,
    glazeCode: piece.glazeCode,
    fire: piece.fire,
    fireCode: piece.fireCode,
    customTitle: piece.customTitle || "",
    sealText: piece.sealText || piece.model?.sealText || "",
    sealFont: piece.sealFont || piece.model?.sealFont || "serif",
    review: piece.review || "",
    value: piece.value || "",
    valueNumber: piece.valueNumber || 0,
    type: piece.type || (String(piece.shapeCode || "").startsWith("seal-") ? "seal" : "vessel"),
    sculpt: piece.sculpt || null,
    model: piece.model
      ? {
          type: piece.model.type || piece.type || (String(piece.model.shape || "").startsWith("seal-") ? "seal" : "vessel"),
          shape: piece.model.shape,
          currentPattern: piece.model.currentPattern,
          sealText: piece.model.sealText || piece.sealText || "",
          sealFont: piece.model.sealFont || piece.sealFont || "serif",
          patterns: piece.model.patterns || [],
          glaze: piece.model.glaze,
          fire: piece.model.fire,
          sculpt: piece.model.sculpt || null,
          patternSteps: piece.model.patternSteps || "",
          patternControls: piece.model.patternControls || "",
          clayQuality: piece.model.clayQuality || "",
          patternQuality: piece.model.patternQuality || "",
          glazeQuality: piece.model.glazeQuality || "",
          kilnQuality: piece.model.kilnQuality || "",
          failCount: piece.model.failCount || "0",
          perfectCount: piece.model.perfectCount || "0",
          masterwork: piece.model.masterwork || "false",
          fired: piece.model.fired || "true",
        }
      : null,
    createdAt: piece.createdAt,
    source: "青韵印",
  };
}

function saveResult() {
  const result = makeCraftResult();
  const saveBtn = document.getElementById("saveBtn");
  let transferPiece = makeTransferPiece(result);
  let data;
  try {
    data = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    data = {};
  }
  data.pieces = Array.isArray(data.pieces) ? data.pieces : [];

  const compactPiece = (piece) => ({
    ...piece,
    preview: "",
    model: piece.model || null,
    sculpt: piece.sculpt || null,
  });

  const writeArchive = (piece, keepHistory = true) => {
    const history = keepHistory ? data.pieces.filter((item) => item.id !== piece.id).slice(0, 19) : [];
    data.pieces = [piece, ...history];
    data.craftResult = piece;
    localStorage.setItem(KEY, JSON.stringify(data));
  };

  try {
    writeArchive(result);
    toast.textContent = "作品已保存";
  } catch {
    const smallerResult = { ...result, preview: "" };
    transferPiece = makeTransferPiece(smallerResult);
    try {
      writeArchive(smallerResult);
       toast.textContent = "作品已保存（已保存作品数据）";
    } catch {
      const tinyResult = compactPiece(smallerResult);
      transferPiece = makeTransferPiece(tinyResult);
      data = { pieces: [tinyResult], craftResult: tinyResult };
      localStorage.setItem(KEY, JSON.stringify(data));
       toast.textContent = "作品已保存（已压缩作品数据）";
    }
  }
  toast.classList.add("show");
  if (saveBtn) {
    saveBtn.textContent = "已保存作品";
    saveBtn.dataset.saved = "true";
  }
  window.__lastSavedArchivePiece = transferPiece;
  try {
    sessionStorage.setItem(TRANSFER_KEY, JSON.stringify(result));
  } catch {
    try {
      sessionStorage.setItem(TRANSFER_KEY, JSON.stringify(transferPiece));
    } catch {
      // The URL transfer still carries the core archive data.
    }
  }
  setTimeout(() => {
    toast.classList.remove("show");
    toast.textContent = "作品已保存";
  }, 1500);
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    state.tab = button.dataset.tab;
    setBurst(button.textContent.trim());
    render();
  });
});

document.querySelectorAll("[data-choice]").forEach((button) => {
  let pressTimer = null;
  let longPressed = false;
  button.addEventListener("pointerdown", () => {
    if (button.dataset.choice !== "pattern") return;
    longPressed = false;
    window.clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      longPressed = true;
      togglePatternSelection(button.dataset.value);
    }, 520);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
    button.addEventListener(type, () => window.clearTimeout(pressTimer));
  });
  button.addEventListener("click", () => {
    if (button.dataset.choice === "pattern" && longPressed) {
      longPressed = false;
      return;
    }
    choose(button.dataset.choice, button.dataset.value, button);
  });
});

ensureSculptControls();
ensurePatternControls();

document.querySelectorAll("[data-sculpt]").forEach((input) => {
  input.addEventListener("input", () => {
    state.sculpt[input.dataset.sculpt] = Number(input.value) / 100;
    state.lastAction = "sculpt";
    setBurst("形体调整");
    render();
  });
});

document.querySelectorAll("[data-pattern-control]").forEach((input) => {
  input.addEventListener("input", () => {
    currentPatternControl()[input.dataset.patternControl] = Number(input.value) / 100;
    state.lastAction = "handPattern";
    setBurst("纹样手调");
    render();
  });
});

document.querySelectorAll("button[data-pattern-tool]").forEach((button) => {
  button.addEventListener("click", () => {
    setPatternTool(button.dataset.patternTool);
    setBurst(button.textContent.trim());
    render();
  });
});

document.querySelectorAll("[data-pattern-command]").forEach((button) => {
  button.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("celadon-tool-command", { detail: { command: button.dataset.patternCommand } }));
    setBurst(button.textContent.trim());
    render();
  });
});

document.querySelectorAll("[data-actions] button").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.parentElement.dataset.actions;
    if (tab === "kiln") actKiln(button);
    else act(tab, button);
  });
});

qteTrack?.addEventListener("click", () => judgeQte());

document.getElementById("finishBtn").addEventListener("click", finish);

document.getElementById("resultNameInput")?.addEventListener("input", (event) => {
  state.customTitle = event.target.value.trim();
  document.getElementById("resultTitle").textContent = resultTitle();
  document.getElementById("resultDesc").textContent = `${workTypeLabel()}形制、纹样、釉色和火候已经合成一${isSealShape() ? "枚" : "件"}${resultTitle()}。`;
  document.getElementById("resultReview").textContent = resultReview();
  document.getElementById("resultValue").textContent = resultValue();
});

document.querySelector("[data-seal-text]")?.addEventListener("input", (event) => {
  state.sealText = event.target.value.slice(0, 12);
  state.lastAction = "sealLetter";
  render();
});

document.querySelector("[data-seal-font]")?.addEventListener("change", (event) => {
  state.sealFont = event.target.value;
  state.lastAction = "sealLetter";
  render();
});
document.getElementById("againBtn").addEventListener("click", () => {
  resultSheet.hidden = true;
  document.documentElement.classList.remove("showcase");
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) {
    saveBtn.textContent = "保存作品";
    delete saveBtn.dataset.saved;
  }
  state.fired = false;
  state.valueOverride = null;
  state.customTitle = "";
  state.steps = { clay: 0, pattern: 0, glaze: 0, kiln: 0 };
  state.processGrades = { clay: {}, pattern: {}, glaze: {} };
  state.selectedPatterns = [];
  state.pattern = "none";
  state.patternProgress = {
    lotus: { steps: 0, grades: {} },
    wave: { steps: 0, grades: {} },
    cloud: { steps: 0, grades: {} },
    pinch: { steps: 0, grades: {} },
  };
  state.patternControls = {
    lotus: { density: 1, depth: 1, band: 1, brush: 1, tool: "rotate" },
    wave: { density: 1, depth: 1, band: 1, brush: 1, tool: "rotate" },
    cloud: { density: 1, depth: 1, band: 1, brush: 1, tool: "rotate" },
    pinch: { density: 1, depth: 1, band: 1, brush: 1, tool: "rotate" },
  };
  state.patternControl = state.patternControls.lotus;
  state.kilnGrades = { feed: null, seal: null, wait: null };
  state.qte.active = null;
  stopQte();
  state.tab = "clay";
  setBurst("重新开窑");
  render();
});
document.getElementById("saveBtn").addEventListener("click", (event) => {
  saveResult();
});

coverStart?.addEventListener("click", () => {
  cover?.classList.add("hidden");
  document.documentElement.classList.add("entered");
});

// The launcher passes three=38 to open the creator directly.
// Keep the normal cover page for visitors opening the page without that parameter.
const launchParams = new URLSearchParams(window.location.search);
if (launchParams.get("three") === "38" || launchParams.get("portfolio") === "game") {
  cover?.classList.add("hidden");
  document.documentElement.classList.add("entered");
}

render();








