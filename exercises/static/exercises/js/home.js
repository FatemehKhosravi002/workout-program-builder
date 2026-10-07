(function () {
  "use strict";

  /* ================= State ================= */

  let categories = [];
  let currentCategoryId = null;
  let currentExercises = [];

  let numberOfDays = 2;
  let currentDay = 1;

  let supersetMode = false;
  let supersetSelection = [];
  let nextSupersetId = 1;

  const workoutPlans = { 1: [], 2: [], 3: [] };

  /* Bottom sheet state */
  let pendingExercise = null;
  let pendingIsSupersetSecond = false;

  /* ================= Helpers ================= */

  const $ = (id) => document.getElementById(id);

  const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
  const toFa = (value) =>
    String(value).replace(/[0-9]/g, (digit) => FA_DIGITS[digit]);

  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));

  const ICON_PATHS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    download:
      '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    dumbbell:
      '<rect x="2" y="9" width="3.5" height="6" rx="1.2"/><rect x="18.5" y="9" width="3.5" height="6" rx="1.2"/><rect x="5.5" y="6.5" width="3.5" height="11" rx="1.2"/><rect x="15" y="6.5" width="3.5" height="11" rx="1.2"/><path d="M9 12h6"/>',
  };

  const icon = (name, extraClass = "") =>
    `<svg class="icon ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

  function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== "") {
      for (const cookie of document.cookie.split(";")) {
        const trimmed = cookie.trim();
        if (trimmed.startsWith(name + "=")) {
          cookieValue = decodeURIComponent(
            trimmed.substring(name.length + 1)
          );
          break;
        }
      }
    }
    return cookieValue;
  }

  function toast(message, type = "info") {
    const root = $("toast-root");
    const element = document.createElement("div");
    element.className = "toast" + (type === "error" ? " error" : "");
    element.textContent = message;
    root.appendChild(element);
    setTimeout(() => {
      element.classList.add("leaving");
      element.addEventListener(
        "animationend",
        () => element.remove(),
        { once: true }
      );
    }, 2400);
  }

  async function apiErrorMessage(response) {
    try {
      const data = await response.json();
      if (typeof data.detail === "string") return data.detail;
      if (data.detail) {
        return String(Object.values(data.detail).flat().join(" "));
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  const emptyState = (title, hint) => `
    <div class="empty">
      ${icon("dumbbell", "empty-icon")}
      <p>${esc(title)}</p>
      ${hint ? `<p class="empty-hint">${esc(hint)}</p>` : ""}
    </div>`;

  const skeletonRows = (count) =>
    Array.from(
      { length: count },
      () => `
      <div class="skeleton-row">
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-circle"></div>
      </div>`
    ).join("");

  /* ================= Categories ================= */

  async function loadCategories() {
    try {
      const response = await fetch("/api/categories/");
      if (!response.ok) throw new Error("categories failed");
      categories = await response.json();
    } catch (_) {
      categories = [];
      toast("خطا در دریافت دسته‌بندی‌ها", "error");
    }
    renderCategories();
    renderAdminCategories();
  }

  function renderCategories() {
    $("categories").innerHTML = categories
      .map(
        (category) => `
        <button
          type="button"
          class="chip ${String(category.id) === String(currentCategoryId) ? "active" : ""}"
          data-id="${category.id}"
        >
          ${esc(category.name)}${
            category.exercise_count
              ? `<span class="chip-count">${toFa(category.exercise_count)}</span>`
              : ""
          }
        </button>`
      )
      .join("");
  }

  async function selectCategory(categoryId) {
    currentCategoryId = categoryId;
    renderCategories();

    const category = categories.find(
      (item) => String(item.id) === String(categoryId)
    );

    $("exercise-toolbar").hidden = false;
    $("exercise-toolbar-title").textContent = category
      ? category.name
      : "";

    $("search-wrapper").hidden = false;
    $("exercise-search").value = "";

    $("exercise-list").innerHTML = skeletonRows(4);

    try {
      const response = await fetch(`/api/exercises/?category=${categoryId}`);
      if (!response.ok) throw new Error("exercises failed");
      currentExercises = await response.json();
    } catch (_) {
      currentExercises = [];
      toast("خطا در دریافت تمرین‌ها", "error");
    }

    renderExercises();
  }

  function closeExerciseList() {
    currentCategoryId = null;
    currentExercises = [];

    supersetMode = false;
    supersetSelection = [];
    $("superset-btn").classList.remove("active");
    $("superset-message").textContent = "";

    $("search-wrapper").hidden = true;
    $("exercise-toolbar").hidden = true;
    $("exercise-list").innerHTML = "";

    renderCategories();
  }

  /* ================= Exercise list ================= */

  function renderExercises() {
    const container = $("exercise-list");
    const search = $("exercise-search").value.trim().toLowerCase();

    const filtered = currentExercises.filter((exercise) =>
      exercise.name.toLowerCase().includes(search)
    );

    if (filtered.length === 0) {
      container.innerHTML = currentExercises.length
        ? emptyState("حرکتی پیدا نشد.", "عبارت دیگری جستجو کن")
        : emptyState("هنوز حرکتی نیست.", "از مدیریت تمرین‌ها اضافه کن");
      return;
    }

    const firstPickId =
      supersetMode && supersetSelection.length === 1
        ? supersetSelection[0].id
        : null;

    container.innerHTML = filtered
      .map(
        (exercise) => `
        <div class="exercise-row">
          <span class="exercise-name">${esc(exercise.name)}</span>
          ${
            String(firstPickId) === String(exercise.id)
              ? '<span class="pick-tag">حرکت اول</span>'
              : ""
          }
          <button
            type="button"
            class="add-btn"
            data-id="${exercise.id}"
            aria-label="افزودن ${esc(exercise.name)}"
          >
            ${icon("plus")}
          </button>
        </div>`
      )
      .join("");
  }

  /* ================= Bottom sheet ================= */

  function openExerciseSheet(exercise, isSupersetSecond) {
    pendingExercise = exercise;
    pendingIsSupersetSecond = isSupersetSecond;

    $("sheet-kicker").textContent = isSupersetSecond
      ? "حرکت دوم سوپرست"
      : `افزودن به روز ${toFa(currentDay)}`;
    $("sheet-title").textContent = exercise.name;
    $("sheet-sets").value = 3;
    $("sheet-reps").value = "";
    $("sheet-note").value = "";

    $("sheet-backdrop").hidden = false;
    document.body.style.overflow = "hidden";

    setTimeout(() => $("sheet-reps").focus(), 260);
  }

  function closeExerciseSheet() {
    $("sheet-backdrop").hidden = true;
    document.body.style.overflow = "";
    pendingExercise = null;
    pendingIsSupersetSecond = false;
  }

  function confirmExerciseSheet() {
    const exercise = pendingExercise;
    if (!exercise) return;

    const entry = {
      id: exercise.id,
      name: exercise.name,
      sets: $("sheet-sets").value || 3,
      reps: $("sheet-reps").value.trim(),
      note: $("sheet-note").value.trim(),
      supersetId: null,
    };

    /* Second exercise of a superset: pair with the first pick */

    if (pendingIsSupersetSecond && supersetSelection.length === 1) {
      const supersetId = nextSupersetId++;

      workoutPlans[currentDay].push({
        ...supersetSelection[0],
        supersetId: supersetId,
      });
      workoutPlans[currentDay].push({
        ...entry,
        supersetId: supersetId,
      });

      supersetSelection = [];
      supersetMode = false;

      $("superset-btn").classList.remove("active");
      $("superset-message").textContent = "";

      closeExerciseSheet();
      renderExercises();
      renderProgram();
      updatePreview();
      toast("سوپرست اضافه شد");
      return;
    }

    /* First exercise of a superset: remember it, wait for the second */

    if (supersetMode) {
      supersetSelection.push(entry);
      $("superset-message").textContent =
        "حالا حرکت دوم سوپرست را انتخاب کن.";
      closeExerciseSheet();
      renderExercises();
      return;
    }

    /* Normal add */

    workoutPlans[currentDay].push(entry);
    closeExerciseSheet();
    renderProgram();
    updatePreview();
    toast("حرکت اضافه شد");
  }

  /* ================= Program ================= */

  function renderProgram() {
    const list = workoutPlans[currentDay];

    renderDayButtons();
    $("clear-day-btn").hidden = list.length === 0;

    const container = $("program-list");

    if (list.length === 0) {
      container.innerHTML = emptyState(
        "هنوز تمرینی انتخاب نشده است.",
        "از بخش انتخاب تمرین، حرکتی اضافه کن"
      );
      return;
    }

    container.innerHTML = list
      .map(
        (exercise, index) => `
        <div class="program-exercise">
          <div class="pe-head">
            <span class="pe-index">${toFa(index + 1)}</span>
            <span class="pe-name">${exercise.supersetId ? "* " : ""}${esc(exercise.name)}</span>
            ${
              exercise.supersetId
                ? '<span class="pe-badge">سوپرست</span>'
                : ""
            }
            <button
              type="button"
              class="pe-remove"
              data-index="${index}"
              aria-label="حذف ${esc(exercise.name)}"
            >
              ${icon("x")}
            </button>
          </div>
          <div class="pe-fields">
            <input
              class="input"
              type="number"
              min="1"
              placeholder="تعداد ست"
              value="${exercise.sets ?? ""}"
              data-field="sets"
              data-index="${index}"
            >
            <input
              class="input"
              type="text"
              placeholder="تکرار"
              value="${exercise.reps ?? ""}"
              data-field="reps"
              data-index="${index}"
            >
          </div>
          <input
            class="input pe-note"
            type="text"
            placeholder="توضیحات حرکت"
            value="${exercise.note ?? ""}"
            data-field="note"
            data-index="${index}"
          >
        </div>`
      )
      .join("");
  }

  function renderDayButtons() {
    let html = "";

    for (let day = 1; day <= numberOfDays; day++) {
      const count = workoutPlans[day].length;
      html += `
        <button
          type="button"
          class="${day === currentDay ? "active" : ""}"
          data-day="${day}"
        >
          روز ${toFa(day)}${
            count ? `<span class="day-count">${toFa(count)}</span>` : ""
          }
        </button>`;
    }

    $("day-buttons").innerHTML = html;
  }

  /* ================= Preview ================= */

  function updatePreview() {
    let html = "";

    for (let day = 1; day <= numberOfDays; day++) {
      const list = workoutPlans[day];

      html += `
        <div class="preview-day">
          <h3 class="preview-day-title">روز ${toFa(day)}</h3>`;

      if (list.length === 0) {
        html += '<p class="preview-empty">هنوز تمرینی انتخاب نشده است.</p>';
      } else {
        html += list
          .map(
            (exercise) => `
            <div class="preview-exercise">
              <div class="pv-name">${exercise.supersetId ? "* " : ""}${esc(exercise.name)}</div>
              <div class="pv-meta">
                <span>${toFa(exercise.sets || "—")} ست</span>
                <span>${toFa(exercise.reps || "—")} تکرار</span>
                <span>${exercise.note ? esc(exercise.note) : "بدون توضیح"}</span>
              </div>
            </div>`
          )
          .join("");
      }

      html += "</div>";
    }

    $("preview-content").innerHTML = html;
  }

  /* ================= PDF ================= */

  async function downloadPdf() {
    const name = $("athlete-name").value.trim();

    if (!name) {
      toast("لطفاً نام ورزشکار را وارد کنید", "error");
      $("athlete-name").focus();
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("number_of_days", numberOfDays);

    for (let day = 1; day <= numberOfDays; day++) {
      workoutPlans[day].forEach((exercise) => {
        const star = exercise.supersetId ? "* " : "";
        const exerciseText =
          `${star}${exercise.name} | ${exercise.sets} ست | ` +
          `${exercise.reps || "—"}` +
          `${exercise.note ? " | " + exercise.note : ""}`;
        formData.append(`day_${day}[]`, exerciseText);
      });
    }

    const button = $("pdf-btn");
    const label = $("pdf-btn-label");
    button.disabled = true;
    label.textContent = "در حال ساخت PDF...";

    try {
      const response = await fetch("/api/generate-pdf/", {
        method: "POST",
        headers: { "X-CSRFToken": getCookie("csrftoken") },
        body: formData,
      });

      if (!response.ok) throw new Error("pdf failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast("برنامه دانلود شد");
    } catch (_) {
      toast("خطا در ساخت PDF", "error");
    } finally {
      button.disabled = false;
      label.textContent = "دریافت برنامه PDF";
    }
  }

  /* ================= Admin ================= */

  function renderAdminCategories() {
    $("new-exercise-category").innerHTML =
      '<option value="">انتخاب دسته‌بندی</option>' +
      categories
        .map(
          (category) =>
            `<option value="${category.id}">${esc(category.name)}</option>`
        )
        .join("");
  }

  async function createCategory(name) {
    const response = await fetch("/api/categories/create/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const message = await apiErrorMessage(response);
      throw new Error(message || "خطا در افزودن دسته‌بندی");
    }

    await loadCategories();
    toast("دسته‌بندی اضافه شد");
  }

  async function createExercise(name, categoryId) {
    const response = await fetch("/api/exercises/create/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify({ name, category: categoryId }),
    });

    if (!response.ok) {
      const message = await apiErrorMessage(response);
      throw new Error(message || "خطا در افزودن حرکت");
    }

    if (String(currentCategoryId) === String(categoryId)) {
      await selectCategory(categoryId);
    }

    toast("حرکت اضافه شد");
  }

  /* ================= Events ================= */

  $("categories").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (chip) selectCategory(chip.dataset.id);
  });

  $("exercise-search").addEventListener("input", renderExercises);

  $("exercise-close-btn").addEventListener("click", closeExerciseList);

  $("exercise-list").addEventListener("click", (event) => {
    const button = event.target.closest(".add-btn");
    if (!button) return;
    const exercise = currentExercises.find(
      (item) => String(item.id) === String(button.dataset.id)
    );
    if (!exercise) return;

    if (supersetMode) {
      if (
        supersetSelection.some(
          (item) => String(item.id) === String(exercise.id)
        )
      ) {
        return;
      }
      openExerciseSheet(exercise, supersetSelection.length >= 1);
    } else {
      openExerciseSheet(exercise, false);
    }
  });

  $("superset-btn").addEventListener("click", () => {
    supersetMode = !supersetMode;
    supersetSelection = [];

    const button = $("superset-btn");
    const message = $("superset-message");

    if (supersetMode) {
      button.classList.add("active");
      message.textContent = "حرکت اول سوپرست را انتخاب کن.";
    } else {
      button.classList.remove("active");
      message.textContent = "";
    }

    renderExercises();
  });

  /* Sheet interactions */

  $("sheet-backdrop").addEventListener("click", (event) => {
    if (event.target === $("sheet-backdrop")) closeExerciseSheet();
  });

  $("sheet-cancel").addEventListener("click", closeExerciseSheet);
  $("sheet-confirm").addEventListener("click", confirmExerciseSheet);

  for (const fieldId of ["sheet-sets", "sheet-reps", "sheet-note"]) {
    $(fieldId).addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        confirmExerciseSheet();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !$("sheet-backdrop").hidden
    ) {
      closeExerciseSheet();
    }
  });

  $("days-segmented").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-days]");
    if (!button) return;

    numberOfDays = Number(button.dataset.days);

    for (const sibling of $("days-segmented").children) {
      sibling.classList.toggle("active", sibling === button);
    }

    if (currentDay > numberOfDays) currentDay = 1;

    renderDayButtons();
    renderProgram();
    updatePreview();
  });

  $("day-buttons").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-day]");
    if (!button) return;
    currentDay = Number(button.dataset.day);
    renderDayButtons();
    renderProgram();
  });

  $("program-list").addEventListener("input", (event) => {
    const input = event.target.closest("input[data-field]");
    if (!input) return;
    const exercise = workoutPlans[currentDay][Number(input.dataset.index)];
    if (!exercise) return;
    exercise[input.dataset.field] = input.value;
    updatePreview();
  });

  $("program-list").addEventListener("click", (event) => {
    const button = event.target.closest(".pe-remove");
    if (!button) return;
    workoutPlans[currentDay].splice(Number(button.dataset.index), 1);
    renderProgram();
    updatePreview();
  });

  $("clear-day-btn").addEventListener("click", () => {
    workoutPlans[currentDay] = [];
    renderProgram();
    updatePreview();
    toast("روز پاک شد");
  });

  $("pdf-btn").addEventListener("click", downloadPdf);

  $("category-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("new-category-name");
    const name = input.value.trim();
    if (!name) return;

    try {
      await createCategory(name);
      input.value = "";
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("exercise-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("new-exercise-name").value.trim();
    const category = $("new-exercise-category").value;

    if (!name || !category) {
      toast("نام حرکت و دسته‌بندی را وارد کنید", "error");
      return;
    }

    try {
      await createExercise(name, category);
      $("new-exercise-name").value = "";
    } catch (error) {
      toast(error.message, "error");
    }
  });

  /* ================= Init ================= */

  renderDayButtons();
  renderProgram();
  updatePreview();
  loadCategories();
})();
