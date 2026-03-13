/* ============================================
   Wedding Menu Planner - Application Logic
   ============================================ */
(function () {
  "use strict";

  // ==========================================
  // STATE
  // ==========================================
  let allDishes = [];
  let events = [];
  let eventSelections = {}; // { eventId: [dishId, ...] }
  let eventNotes = {}; // { eventId: "string" }
  let activeFilters = {
    search: "",
    source: [],
    category: [],
    cuisine: [],
    cultural: [],
    spice: [],
    richness: [],
    crowd: [],
    method: [],
  };
  let currentView = "browser";
  let currentEventId = null;
  let popoverDishId = null;
  let activeFilterGroup = null;
  let menuLibrary = {};
  let activeMenuId = null;
  let menuDropdownOpen = false;

  // Pairing groups
  const PAIRING_MAP = {
    "dal-baati-churma": {
      label: "Dal Baati Churma set",
      members: ["dal-baati-churma", "dal-panchmel", "churma-ladoo"],
    },
    "sindhi-kadhi-chawal": {
      label: "Sindhi Kadhi Chawal set",
      members: ["sindhi-kadhi", "bhuga-chawal"],
    },
    "dal-pakwan": { label: "Dal Pakwan set", members: ["dal-pakwan"] },
    "bedmi-puri-aloo": {
      label: "Bedmi Puri + Aloo set",
      members: ["bedmi-puri-aloo"],
    },
    "litti-chokha": { label: "Litti Chokha set", members: ["litti-chokha"] },
    "vada-pav": { label: "Vada Pav set", members: ["vada-pav"] },
  };

  // Course ordering for display
  const COURSE_ORDER = [
    "beverage",
    "starter",
    "soup",
    "salad",
    "chaat",
    "main",
    "side",
    "bread",
    "rice",
    "dessert",
    "live_station",
  ];

  const COURSE_LABELS = {
    beverage: "Beverages",
    starter: "Starters & Snacks",
    soup: "Soups",
    salad: "Salads",
    chaat: "Chaats",
    main: "Main Course",
    side: "Sides",
    bread: "Breads",
    rice: "Rice",
    dessert: "Desserts",
    live_station: "Live Stations",
  };

  const EVENT_TIMING = {
    mehndi_lunch: "Day 1 - Afternoon",
    hi_tea: "Day 1 - Afternoon",
    sangeet_dinner: "Day 1 - Night",
    breakfast: "Day 2 - Morning",
    haldi_lunch: "Day 2 - Afternoon",
    pre_wedding_hi_tea: "Day 2 - Evening",
    wedding_dinner: "Day 2 - Night",
    supper: "Day 2 - Late Night",
    checkout_breakfast: "Day 3 - Morning",
  };

  // Migration map for renamed event IDs
  const EVENT_ID_MIGRATION = {
    mehndi_dinner: "mehndi_lunch",
    lunch_hi_tea: "haldi_lunch",
  };

  // ==========================================
  // DATA LOADING
  // ==========================================
  async function loadData() {
    try {
      const [menuRes, customRes, contextRes] = await Promise.all([
        fetch("data/menu-bank.json"),
        fetch("data/custom-suggestions.json"),
        fetch("data/wedding-context.json"),
      ]);

      const menuData = await menuRes.json();
      const customData = await customRes.json();
      const contextData = await contextRes.json();

      const tajDishes = menuData.dishes || menuData;
      const customDishes = customData.dishes || customData;

      allDishes = [...tajDishes, ...customDishes];
      events = contextData.wedding ? contextData.events : contextData.events;

      // Load saved state
      loadState();

      // Initialize first event
      if (events.length > 0 && !currentEventId) {
        currentEventId = events[0].id;
      }

      // Build UI
      buildFilterOptions();
      renderDishGrid();
      renderEventTabs();
      renderEventContent();
      renderSummary();
      updateMenuUI();
    } catch (err) {
      console.error("Failed to load data:", err);
      document.body.innerHTML =
        '<div style="padding:2rem;color:red;">Failed to load menu data. Make sure data files exist in ./data/ folder.</div>';
    }
  }

  // ==========================================
  // PERSISTENCE
  // ==========================================
  const STORAGE_KEY = "wedding-menu-planner";
  const STORAGE_KEY_V2 = "wedding-menu-planner-v2";

  function saveState() {
    if (!activeMenuId || !menuLibrary[activeMenuId]) return;
    const menu = menuLibrary[activeMenuId];
    menu.eventSelections = JSON.parse(JSON.stringify(eventSelections));
    menu.eventNotes = JSON.parse(JSON.stringify(eventNotes));
    menu.updatedAt = new Date().toISOString();
    const fullState = {
      version: 2,
      activeMenuId,
      menus: menuLibrary,
      uiState: { currentEventId, currentView },
    };
    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(fullState));
    } catch (e) {
      console.warn("Could not save state:", e);
      showToast("Storage full - could not save");
    }
  }

  function loadState() {
    try {
      const v2 = localStorage.getItem(STORAGE_KEY_V2);
      if (v2) {
        const state = JSON.parse(v2);
        menuLibrary = state.menus || {};
        activeMenuId = state.activeMenuId;
        // Load selections BEFORE switchView (which calls saveState)
        if (activeMenuId && menuLibrary[activeMenuId]) {
          eventSelections = JSON.parse(
            JSON.stringify(menuLibrary[activeMenuId].eventSelections || {}),
          );
          eventNotes = JSON.parse(
            JSON.stringify(menuLibrary[activeMenuId].eventNotes || {}),
          );
        }
        if (state.uiState) {
          if (state.uiState.currentEventId)
            currentEventId = state.uiState.currentEventId;
          if (state.uiState.currentView) {
            currentView = state.uiState.currentView;
            switchView(currentView);
          }
        }
      } else {
        const v1 = localStorage.getItem(STORAGE_KEY);
        if (v1) {
          migrateFromV1(JSON.parse(v1));
        } else {
          createNewMenu("My Menu", true);
        }
      }
    } catch (e) {
      console.warn("Could not load state:", e);
      createNewMenu("My Menu", true);
    }

    // Migrate renamed event IDs
    migrateEventIds(eventSelections);
    migrateEventIds(eventNotes);
    // Also migrate in all saved menus
    for (const menu of Object.values(menuLibrary)) {
      if (menu.eventSelections) migrateEventIds(menu.eventSelections);
      if (menu.eventNotes) migrateEventIds(menu.eventNotes);
    }

    // Ensure all events have selections arrays
    events.forEach((ev) => {
      if (!eventSelections[ev.id]) eventSelections[ev.id] = [];
      if (!eventNotes[ev.id]) eventNotes[ev.id] = "";
    });
  }

  function migrateEventIds(obj) {
    for (const [oldId, newId] of Object.entries(EVENT_ID_MIGRATION)) {
      if (obj[oldId] !== undefined) {
        if (!obj[newId]) {
          obj[newId] = obj[oldId];
        } else if (Array.isArray(obj[oldId]) && Array.isArray(obj[newId])) {
          // Merge arrays, deduplicate
          const merged = new Set([...obj[newId], ...obj[oldId]]);
          obj[newId] = [...merged];
        }
        delete obj[oldId];
      }
    }
  }

  function migrateFromV1(v1State) {
    const menuId = "menu_" + Date.now();
    menuLibrary[menuId] = {
      id: menuId,
      name: "My Menu",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eventSelections: v1State.eventSelections || {},
      eventNotes: v1State.eventNotes || {},
    };
    activeMenuId = menuId;
    eventSelections = JSON.parse(
      JSON.stringify(menuLibrary[menuId].eventSelections),
    );
    eventNotes = JSON.parse(JSON.stringify(menuLibrary[menuId].eventNotes));
    if (v1State.currentEventId) currentEventId = v1State.currentEventId;
    if (v1State.currentView) {
      currentView = v1State.currentView;
      switchView(currentView);
    }
    saveState();
  }

  // ==========================================
  // HELPERS
  // ==========================================
  function getDishById(id) {
    return allDishes.find((d) => d.id === id);
  }

  function getDishEvents(dishId) {
    const evts = [];
    for (const [evId, dishes] of Object.entries(eventSelections)) {
      if (dishes.includes(dishId)) {
        const ev = events.find((e) => e.id === evId);
        if (ev) evts.push(ev);
      }
    }
    return evts;
  }

  function getCourseType(dish) {
    // Map category to course type for grouping
    const cat = dish.category;
    if (cat === "snack" || cat === "chaat")
      return dish.course_type || "starter";
    if (cat === "soup") return "soup";
    if (cat === "salad") return "salad";
    if (cat === "main_course" || cat === "dal" || cat === "vegetable")
      return "main";
    if (cat === "rice") return "rice";
    if (cat === "bread") return "bread";
    if (cat === "dessert") return "dessert";
    if (cat === "live_station") return "live_station";
    if (cat === "breakfast" || cat === "hi_tea") {
      if (dish.course_type === "beverage") return "beverage";
      if (dish.course_type === "dessert") return "dessert";
      if (dish.course_type === "bread") return "bread";
      return dish.course_type || "starter";
    }
    return dish.course_type || "main";
  }

  function formatLabel(str) {
    return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
  }

  // ==========================================
  // FILTER BUILDING
  // ==========================================
  function buildFilterOptions() {
    // Collect unique values
    const sources = new Set();
    const categories = new Set();
    const cuisines = new Set();
    const culturals = new Set();
    const spices = new Set();
    const richnesses = new Set();
    const crowds = new Set();
    const methods = new Set();

    allDishes.forEach((d) => {
      sources.add(d.source || "unknown");
      categories.add(d.category);
      (d.cuisine_region || []).forEach((c) => cuisines.add(c));
      (d.cultural_relevance || []).forEach((c) => culturals.add(c));
      if (d.spice_level) spices.add(d.spice_level);
      if (d.richness) richnesses.add(d.richness);
      if (d.crowd_appeal) crowds.add(d.crowd_appeal);
      (d.cooking_method || []).forEach((m) => methods.add(m));
    });

    renderFilterChips("filter-source", [...sources].sort(), "source");
    renderFilterChips("filter-category", [...categories].sort(), "category");
    renderFilterChips("filter-cuisine", [...cuisines].sort(), "cuisine");
    renderFilterChips("filter-cultural", [...culturals].sort(), "cultural");
    renderFilterChips("filter-spice", ["mild", "medium", "spicy"], "spice");
    renderFilterChips(
      "filter-richness",
      ["light", "medium", "rich"],
      "richness",
    );
    renderFilterChips("filter-crowd", [...crowds].sort(), "crowd");
    renderFilterChips("filter-method", [...methods].sort(), "method");
  }

  function renderFilterChips(containerId, values, filterKey) {
    const container = document.getElementById(containerId);
    container.innerHTML = values
      .map(
        (v) =>
          `<button class="filter-chip${filterKey === "category" ? ` cat-${v}` : ""}" data-filter="${filterKey}" data-value="${v}">${formatLabel(v)}</button>`,
      )
      .join("");
  }

  function toggleFilterGroup(groupName) {
    const chipsRow = document.getElementById("filter-chips-row");
    const targetChips = document.getElementById(`filter-${groupName}`);
    if (!targetChips) return;

    if (activeFilterGroup === groupName) {
      // Close - move chips back to hidden container
      targetChips.classList.add("hidden");
      chipsRow.innerHTML = "";
      activeFilterGroup = null;
    } else {
      // Close previous
      if (activeFilterGroup) {
        const prev = document.getElementById(`filter-${activeFilterGroup}`);
        if (prev) prev.classList.add("hidden");
      }
      // Show target chips in the chips row
      chipsRow.innerHTML = "";
      targetChips.classList.remove("hidden");
      chipsRow.appendChild(targetChips);
      activeFilterGroup = groupName;
    }
  }

  function updateFilterGroupLabels() {
    document.querySelectorAll(".filter-group-label").forEach((label) => {
      const group = label.dataset.toggle;
      const count = activeFilters[group] ? activeFilters[group].length : 0;
      const baseName = label.textContent.replace(/\s*\(\d+\)$/, "").trim();
      label.textContent = count > 0 ? `${baseName} (${count})` : baseName;
      label.classList.toggle("has-active", count > 0);
    });
  }

  // ==========================================
  // DISH FILTERING
  // ==========================================
  function getFilteredDishes() {
    return allDishes.filter((dish) => {
      // Search
      if (activeFilters.search) {
        const q = activeFilters.search.toLowerCase();
        const searchable = [
          dish.name,
          dish.description,
          ...(dish.cuisine_region || []),
          ...(dish.cultural_relevance || []),
          dish.category,
          dish.sub_category,
        ]
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }

      // Source
      if (activeFilters.source.length > 0) {
        if (!activeFilters.source.includes(dish.source)) return false;
      }

      // Category
      if (activeFilters.category.length > 0) {
        if (!activeFilters.category.includes(dish.category)) return false;
      }

      // Cuisine
      if (activeFilters.cuisine.length > 0) {
        if (
          !(dish.cuisine_region || []).some((c) =>
            activeFilters.cuisine.includes(c),
          )
        )
          return false;
      }

      // Cultural
      if (activeFilters.cultural.length > 0) {
        if (
          !(dish.cultural_relevance || []).some((c) =>
            activeFilters.cultural.includes(c),
          )
        )
          return false;
      }

      // Spice
      if (activeFilters.spice.length > 0) {
        if (!activeFilters.spice.includes(dish.spice_level)) return false;
      }

      // Richness
      if (activeFilters.richness.length > 0) {
        if (!activeFilters.richness.includes(dish.richness)) return false;
      }

      // Crowd appeal
      if (activeFilters.crowd.length > 0) {
        if (!activeFilters.crowd.includes(dish.crowd_appeal)) return false;
      }

      // Cooking method
      if (activeFilters.method.length > 0) {
        if (
          !(dish.cooking_method || []).some((m) =>
            activeFilters.method.includes(m),
          )
        )
          return false;
      }

      return true;
    });
  }

  // ==========================================
  // VIEW 1: DISH BROWSER RENDERING
  // ==========================================
  function renderDishGrid() {
    const filtered = getFilteredDishes();
    const grid = document.getElementById("dish-grid");
    const stats = document.getElementById("browser-stats");

    const selectedCount = new Set(Object.values(eventSelections).flat()).size;
    stats.innerHTML =
      `<span>${filtered.length} / ${allDishes.length} dishes</span>` +
      (selectedCount > 0
        ? ` <span class="stats-selected">&middot; ${selectedCount} selected</span>`
        : "");

    if (filtered.length === 0) {
      grid.innerHTML =
        '<div class="dish-grid-empty">No dishes match your filters.</div>';
      return;
    }

    grid.innerHTML = filtered
      .map((dish) => {
        const isCustom = dish.source === "custom_suggestion";
        const dishEvents = getDishEvents(dish.id);
        const hasEvents = dishEvents.length > 0;
        const cuisineStr = (dish.cuisine_region || [])
          .slice(0, 2)
          .map(formatLabel)
          .join(", ");
        const subtitle = [formatLabel(dish.category), cuisineStr]
          .filter(Boolean)
          .join(" \u00b7 ");

        const eventDots = dishEvents
          .map(
            (ev) =>
              `<span class="event-dot" title="${escapeHtml(ev.name)}">${ev.name.charAt(0)}</span>`,
          )
          .join("");

        return `<div class="dish-card cat-${dish.category} ${hasEvents ? "dish-selected" : ""} ${isCustom ? "custom-dish" : ""}" data-dish-id="${dish.id}">
          <div class="dish-card-top">
            <span class="dish-name">${escapeHtml(dish.name)}</span>
            ${dish.is_signature ? '<span class="badge-dot sig" title="Signature">\u2605</span>' : ""}
            ${isCustom ? '<span class="badge-dot cust" title="Custom">\u25c6</span>' : ""}
          </div>
          <div class="dish-subtitle">${subtitle}</div>
          ${eventDots ? `<div class="dish-event-dots">${eventDots}</div>` : ""}
        </div>`;
      })
      .join("");
  }

  function getPairingHint(dish) {
    const group = PAIRING_MAP[dish.pairing_group];
    if (!group) return "";
    const others = group.members.filter((id) => id !== dish.id);
    if (others.length === 0) return "";
    const names = others.map((id) => {
      const d = getDishById(id);
      return d ? d.name : formatLabel(id);
    });
    return `Goes with: ${names.join(", ")}`;
  }

  // ==========================================
  // VIEW 2: EVENT PLANNER RENDERING
  // ==========================================
  function renderEventTabs() {
    const container = document.getElementById("event-tabs");
    container.innerHTML = events
      .map((ev) => {
        const count = (eventSelections[ev.id] || []).length;
        return `<button class="event-tab ${ev.id === currentEventId ? "active" : ""}" data-event-id="${ev.id}">
        ${ev.name}
        ${count > 0 ? `<span class="tab-count">${count}</span>` : ""}
      </button>`;
      })
      .join("");
  }

  function renderEventContent() {
    const ev = events.find((e) => e.id === currentEventId);
    if (!ev) return;

    // Header
    const headerEl = document.getElementById("event-header");
    headerEl.innerHTML = `
      <h2>${ev.name}</h2>
      <div class="event-timing">${EVENT_TIMING[ev.id] || ""} &bull; ${formatLabel(ev.type || "")}</div>
      <div class="event-guidance">${escapeHtml(ev.guidance || "")}</div>
    `;

    // Dishes grouped by course
    const dishesEl = document.getElementById("event-dishes");
    const selectedIds = eventSelections[ev.id] || [];

    if (selectedIds.length === 0) {
      dishesEl.innerHTML =
        '<div class="event-empty">No dishes added yet. Go to Dish Browser to add dishes to this event.</div>';
    } else {
      const grouped = {};
      selectedIds.forEach((id) => {
        const dish = getDishById(id);
        if (!dish) return;
        const course = getCourseType(dish);
        if (!grouped[course]) grouped[course] = [];
        grouped[course].push(dish);
      });

      // Sort by course order
      const sortedCourses = COURSE_ORDER.filter((c) => grouped[c]);

      let html = "";

      // Pairing suggestions
      const suggestions = getPairingSuggestions(ev.id);
      if (suggestions.length > 0) {
        html += suggestions
          .map((s) => `<div class="pairing-suggestion">${s}</div>`)
          .join("");
      }

      sortedCourses.forEach((course) => {
        html += `<div class="course-section">
          <div class="course-title">${COURSE_LABELS[course] || formatLabel(course)} (${grouped[course].length})</div>`;

        grouped[course].forEach((dish) => {
          const otherEvents = getDishEvents(dish.id).filter(
            (e) => e.id !== ev.id,
          );
          const repWarning =
            otherEvents.length > 0
              ? `<span class="repetition-warning">Also in: ${otherEvents.map((e) => e.name.split(" ")[0]).join(", ")}</span>`
              : "";

          html += `<div class="planner-dish-item">
            <div class="planner-dish-info">
              <div class="planner-dish-name">${escapeHtml(dish.name)}</div>
              <div class="planner-dish-meta">${formatLabel(dish.category)} &bull; ${(dish.cuisine_region || []).map(formatLabel).join(", ")}</div>
            </div>
            <div class="planner-dish-actions">
              ${repWarning}
              <button class="btn-remove" data-event-id="${ev.id}" data-dish-id="${dish.id}">Remove</button>
            </div>
          </div>`;
        });

        html += "</div>";
      });

      dishesEl.innerHTML = html;
    }

    // Notes
    const notesEl = document.getElementById("event-notes");
    notesEl.value = eventNotes[ev.id] || "";
  }

  function getPairingSuggestions(eventId) {
    const selectedIds = new Set(eventSelections[eventId] || []);
    const suggestions = [];

    // Check for dishes with pairing groups
    selectedIds.forEach((id) => {
      const dish = getDishById(id);
      if (!dish || !dish.pairing_group) return;
      const group = PAIRING_MAP[dish.pairing_group];
      if (!group) return;

      const missing = group.members.filter(
        (memberId) => !selectedIds.has(memberId),
      );
      if (missing.length > 0) {
        const missingNames = missing.map((mid) => {
          const d = getDishById(mid);
          return d ? d.name : formatLabel(mid);
        });
        suggestions.push(
          `You added ${dish.name} -- consider adding: ${missingNames.join(", ")}`,
        );
      }
    });

    return [...new Set(suggestions)];
  }

  // ==========================================
  // VIEW 3: SUMMARY RENDERING
  // ==========================================
  function renderSummary() {
    // Stats
    const allSelectedIds = new Set();
    let totalAssignments = 0;
    events.forEach((ev) => {
      (eventSelections[ev.id] || []).forEach((id) => {
        allSelectedIds.add(id);
        totalAssignments++;
      });
    });

    const statsEl = document.getElementById("summary-stats");
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-number">${allSelectedIds.size}</div><div class="stat-label">Unique Dishes</div></div>
      <div class="stat-card"><div class="stat-number">${totalAssignments}</div><div class="stat-label">Total Assignments</div></div>
      <div class="stat-card"><div class="stat-number">${events.length}</div><div class="stat-label">Events</div></div>
      <div class="stat-card"><div class="stat-number">${allDishes.length}</div><div class="stat-label">Available Dishes</div></div>
    `;

    // Per-event summary
    const eventsEl = document.getElementById("summary-events");
    eventsEl.innerHTML = events
      .map((ev) => {
        const selectedIds = eventSelections[ev.id] || [];

        if (selectedIds.length === 0) {
          return `<div class="summary-event">
          <div class="summary-event-header">
            <h3>${ev.name}</h3>
            <span class="dish-count">0 dishes</span>
          </div>
          <div class="summary-event-body">
            <div class="summary-event-empty">No dishes selected yet</div>
          </div>
        </div>`;
        }

        // Group by course
        const grouped = {};
        selectedIds.forEach((id) => {
          const dish = getDishById(id);
          if (!dish) return;
          const course = getCourseType(dish);
          if (!grouped[course]) grouped[course] = [];
          grouped[course].push(dish);
        });

        const coursesHtml = COURSE_ORDER.filter((c) => grouped[c])
          .map((course) => {
            const names = grouped[course].map((d) => d.name).join(", ");
            return `<div class="summary-course">
          <div class="summary-course-title">${COURSE_LABELS[course] || formatLabel(course)}</div>
          <div class="summary-course-dishes">${escapeHtml(names)}</div>
        </div>`;
          })
          .join("");

        return `<div class="summary-event">
        <div class="summary-event-header">
          <h3>${ev.name}</h3>
          <span class="dish-count">${selectedIds.length} dishes</span>
        </div>
        <div class="summary-event-body">${coursesHtml}</div>
      </div>`;
      })
      .join("");

    // Repetition report
    renderRepetitionReport();
  }

  function renderRepetitionReport() {
    const dishEventCount = {};
    events.forEach((ev) => {
      (eventSelections[ev.id] || []).forEach((id) => {
        if (!dishEventCount[id]) dishEventCount[id] = [];
        dishEventCount[id].push(ev.name);
      });
    });

    const repeated = Object.entries(dishEventCount)
      .filter(([, evts]) => evts.length > 1)
      .map(([id, evts]) => {
        const dish = getDishById(id);
        return { name: dish ? dish.name : id, events: evts };
      });

    const reportEl = document.getElementById("repetition-report");
    if (repeated.length === 0) {
      reportEl.innerHTML = "";
      return;
    }

    reportEl.innerHTML = `
      <h3>Repetition Report (${repeated.length} dishes in 2+ events)</h3>
      ${repeated
        .map(
          (r) =>
            `<div class="repetition-item"><strong>${escapeHtml(r.name)}</strong> -- ${r.events.join(", ")}</div>`,
        )
        .join("")}
    `;
  }

  // ==========================================
  // COPY TO TEXT
  // ==========================================
  function copyAsText() {
    let text = "=== WEDDING MENU ===\n";
    text += "Taj Gateway Nashik | 23 April 2026\n\n";

    events.forEach((ev) => {
      const selectedIds = eventSelections[ev.id] || [];
      text += `--- ${ev.name.toUpperCase()} ---\n`;
      text += `${EVENT_TIMING[ev.id] || ""}\n`;

      if (selectedIds.length === 0) {
        text += "(No dishes selected)\n\n";
        return;
      }

      const grouped = {};
      selectedIds.forEach((id) => {
        const dish = getDishById(id);
        if (!dish) return;
        const course = getCourseType(dish);
        if (!grouped[course]) grouped[course] = [];
        grouped[course].push(dish);
      });

      COURSE_ORDER.filter((c) => grouped[c]).forEach((course) => {
        text += `\n${(COURSE_LABELS[course] || formatLabel(course)).toUpperCase()}:\n`;
        grouped[course].forEach((d) => {
          text += `  - ${d.name}\n`;
        });
      });

      const notes = eventNotes[ev.id];
      if (notes) {
        text += `\nNotes: ${notes}\n`;
      }
      text += "\n";
    });

    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast("Menu copied to clipboard");
      })
      .catch(() => {
        // Fallback
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        showToast("Menu copied to clipboard");
      });
  }

  // ==========================================
  // MENU MANAGEMENT
  // ==========================================
  function createNewMenu(name, setActive) {
    const safeName = (name || "").trim();
    if (!safeName) return null;
    const uniqueName = getUniqueName(safeName);
    const menuId = "menu_" + Date.now();
    menuLibrary[menuId] = {
      id: menuId,
      name: uniqueName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eventSelections: {},
      eventNotes: {},
    };
    if (setActive) {
      activeMenuId = menuId;
      eventSelections = {};
      eventNotes = {};
      events.forEach((ev) => {
        eventSelections[ev.id] = [];
        eventNotes[ev.id] = "";
      });
    }
    saveState();
    updateMenuUI();
    return menuId;
  }

  function saveMenuAs(name) {
    const safeName = (name || "").trim();
    if (!safeName) return null;
    const uniqueName = getUniqueName(safeName);
    const menuId = "menu_" + Date.now();
    menuLibrary[menuId] = {
      id: menuId,
      name: uniqueName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eventSelections: JSON.parse(JSON.stringify(eventSelections)),
      eventNotes: JSON.parse(JSON.stringify(eventNotes)),
    };
    activeMenuId = menuId;
    saveState();
    updateMenuUI();
    showToast(`Saved as "${uniqueName}"`);
    return menuId;
  }

  function switchMenu(menuId) {
    if (!menuLibrary[menuId]) return;
    if (popoverDishId) closePopover();
    saveState();
    activeMenuId = menuId;
    const menu = menuLibrary[menuId];
    eventSelections = JSON.parse(JSON.stringify(menu.eventSelections || {}));
    eventNotes = JSON.parse(JSON.stringify(menu.eventNotes || {}));
    events.forEach((ev) => {
      if (!eventSelections[ev.id]) eventSelections[ev.id] = [];
      if (!eventNotes[ev.id]) eventNotes[ev.id] = "";
    });
    saveState();
    renderDishGrid();
    renderEventTabs();
    renderEventContent();
    renderSummary();
    updateMenuUI();
    toggleMenuDropdown(false);
    showToast(`Switched to "${menu.name}"`);
  }

  function renameMenu(menuId, newName) {
    if (!menuLibrary[menuId]) return;
    const safeName = (newName || "").trim();
    if (!safeName) return;
    menuLibrary[menuId].name = getUniqueName(safeName, menuId);
    menuLibrary[menuId].updatedAt = new Date().toISOString();
    saveState();
    updateMenuUI();
  }

  function deleteMenu(menuId) {
    const menuIds = Object.keys(menuLibrary);
    if (menuIds.length <= 1) {
      showToast("Cannot delete the last menu");
      return;
    }
    if (!confirm(`Delete "${menuLibrary[menuId].name}"?`)) return;
    delete menuLibrary[menuId];
    if (activeMenuId === menuId) {
      const remaining = Object.keys(menuLibrary);
      switchMenu(remaining[0]);
    } else {
      saveState();
      updateMenuUI();
    }
    showToast("Menu deleted");
  }

  function getUniqueName(baseName, excludeId) {
    const existingNames = Object.values(menuLibrary)
      .filter((m) => m.id !== excludeId)
      .map((m) => m.name);
    if (!existingNames.includes(baseName)) return baseName;
    let i = 2;
    while (existingNames.includes(`${baseName} (${i})`)) i++;
    return `${baseName} (${i})`;
  }

  // ==========================================
  // EXPORT / IMPORT
  // ==========================================
  function exportMenu() {
    if (!activeMenuId || !menuLibrary[activeMenuId]) return;
    saveState();
    const menu = menuLibrary[activeMenuId];
    const exportData = {
      _format: "wedding-menu-planner",
      _version: 1,
      name: menu.name,
      exportedAt: new Date().toISOString(),
      eventSelections: menu.eventSelections,
      eventNotes: menu.eventNotes,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `menu-${menu.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Menu exported");
  }

  function importMenu(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!validateImport(data)) {
          showToast("Invalid menu file");
          return;
        }
        const validIds = new Set(allDishes.map((d) => d.id));
        const cleanSelections = {};
        for (const [evId, dishes] of Object.entries(
          data.eventSelections || {},
        )) {
          cleanSelections[evId] = (dishes || []).filter((id) =>
            validIds.has(id),
          );
        }
        const menuId = "menu_" + Date.now();
        const name = getUniqueName(data.name || "Imported Menu");
        menuLibrary[menuId] = {
          id: menuId,
          name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          eventSelections: cleanSelections,
          eventNotes: data.eventNotes || {},
        };
        saveState();
        updateMenuUI();
        showToast(`Imported "${name}"`);
      } catch (err) {
        console.error("Import failed:", err);
        showToast("Failed to import - invalid JSON");
      }
    };
    reader.readAsText(file);
  }

  function validateImport(data) {
    if (!data || typeof data !== "object") return false;
    if (data._format !== "wedding-menu-planner") return false;
    if (!data.eventSelections || typeof data.eventSelections !== "object")
      return false;
    for (const val of Object.values(data.eventSelections)) {
      if (!Array.isArray(val)) return false;
    }
    return true;
  }

  // ==========================================
  // MENU DROPDOWN UI
  // ==========================================
  function updateMenuUI() {
    const trigger = document.getElementById("menu-trigger-name");
    if (!trigger) return;
    const menu = menuLibrary[activeMenuId];
    trigger.textContent = menu ? menu.name : "No Menu";
    renderMenuDropdown();
  }

  function renderMenuDropdown() {
    const list = document.getElementById("menu-dropdown-list");
    if (!list) return;
    const sorted = Object.values(menuLibrary).sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
    );
    list.innerHTML = sorted
      .map((menu) => {
        const dishCount = getDishCountForMenu(menu);
        const isActive = menu.id === activeMenuId;
        const date = new Date(menu.updatedAt).toLocaleDateString();
        return `<div class="menu-dropdown-item ${isActive ? "active" : ""}" data-menu-id="${menu.id}">
        <div class="menu-dropdown-item-info">
          <div class="menu-dropdown-item-name">${escapeHtml(menu.name)}</div>
          <div class="menu-dropdown-item-meta">${dishCount} dishes &bull; ${date}</div>
        </div>
        <div class="menu-dropdown-item-actions">
          <button class="menu-action-btn menu-rename-btn" data-menu-id="${menu.id}" title="Rename">&#9998;</button>
          <button class="menu-action-btn menu-delete-btn" data-menu-id="${menu.id}" title="Delete">&times;</button>
        </div>
      </div>`;
      })
      .join("");
  }

  function getDishCountForMenu(menu) {
    const ids = new Set();
    for (const dishes of Object.values(menu.eventSelections || {})) {
      (dishes || []).forEach((id) => ids.add(id));
    }
    return ids.size;
  }

  function toggleMenuDropdown(open) {
    menuDropdownOpen = open !== undefined ? open : !menuDropdownOpen;
    const dropdown = document.getElementById("menu-dropdown");
    const overlay = document.getElementById("menu-dropdown-overlay");
    if (menuDropdownOpen) {
      dropdown.classList.add("active");
      overlay.classList.add("active");
      renderMenuDropdown();
    } else {
      dropdown.classList.remove("active");
      overlay.classList.remove("active");
    }
  }

  // ==========================================
  // EVENT HANDLERS
  // ==========================================
  function switchView(view) {
    currentView = view;
    if (popoverDishId) closePopover();
    document
      .querySelectorAll(".view")
      .forEach((v) => v.classList.remove("active"));
    document
      .querySelectorAll(".nav-tab")
      .forEach((t) => t.classList.remove("active"));

    document.getElementById(`view-${view}`).classList.add("active");
    document
      .querySelector(`.nav-tab[data-view="${view}"]`)
      .classList.add("active");

    if (view === "planner") {
      renderEventTabs();
      renderEventContent();
    }
    if (view === "summary") {
      renderSummary();
    }
    saveState();
  }

  function openPopover(dishId, anchorEl) {
    popoverDishId = dishId;
    const dish = getDishById(dishId);
    if (!dish) return;

    const popover = document.getElementById("dish-popover");
    document.getElementById("popover-dish-name").textContent = dish.name;

    // Event toggle buttons
    document.getElementById("popover-events").innerHTML = events
      .map((ev) => {
        const isAdded = (eventSelections[ev.id] || []).includes(dishId);
        return `<button class="popover-event-btn ${isAdded ? "event-active" : ""}" data-event-id="${ev.id}">
          <span>${escapeHtml(ev.name)}</span>
          <span>${isAdded ? "\u2713" : "+"}</span>
        </button>`;
      })
      .join("");

    // Dish details
    const tags = [
      ...(dish.cuisine_region || []),
      ...(dish.cultural_relevance || []),
      dish.spice_level,
    ]
      .filter(Boolean)
      .map((t) => `<span class="popover-tag">${formatLabel(t)}</span>`)
      .join("");
    const pairingHint = dish.pairing_group ? getPairingHint(dish) : "";
    document.getElementById("popover-details").innerHTML =
      (dish.description
        ? `<div class="popover-details-desc">${escapeHtml(dish.description)}</div>`
        : "") +
      (tags ? `<div class="popover-tags">${tags}</div>` : "") +
      (pairingHint
        ? `<div style="margin-top:0.25rem;color:var(--accent);font-style:italic">${pairingHint}</div>`
        : "");

    // Position using fixed coordinates
    const rect = anchorEl.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;

    // Flip above if near bottom
    if (rect.bottom + 300 > window.innerHeight) {
      top = rect.top - 300 - 4;
      if (top < 0) top = 4;
    }
    // Clamp right
    if (left + 260 > window.innerWidth) {
      left = window.innerWidth - 264;
    }
    if (left < 4) left = 4;

    popover.style.top = top + "px";
    popover.style.left = left + "px";
    popover.classList.add("active");
  }

  function closePopover() {
    document.getElementById("dish-popover").classList.remove("active");
    popoverDishId = null;
  }

  function closeHelpModal() {
    document.getElementById("help-overlay").classList.remove("active");
  }

  function toggleDishInEvent(eventId, dishId) {
    if (!eventSelections[eventId]) eventSelections[eventId] = [];
    const idx = eventSelections[eventId].indexOf(dishId);

    if (idx >= 0) {
      eventSelections[eventId].splice(idx, 1);
      showToast("Removed from event");
    } else {
      eventSelections[eventId].push(dishId);
      const dish = getDishById(dishId);
      showToast(`Added ${dish ? dish.name : ""} to event`);
    }

    saveState();
    renderDishGrid();
    renderEventTabs();
    if (currentView === "planner") renderEventContent();
    if (currentView === "summary") renderSummary();

    // Re-sync popover after grid re-render
    if (popoverDishId) {
      const newCard = document.querySelector(
        `.dish-card[data-dish-id="${popoverDishId}"]`,
      );
      if (newCard) {
        openPopover(popoverDishId, newCard);
      } else {
        closePopover();
      }
    }
  }

  function removeDishFromEvent(eventId, dishId) {
    if (!eventSelections[eventId]) return;
    const idx = eventSelections[eventId].indexOf(dishId);
    if (idx >= 0) {
      eventSelections[eventId].splice(idx, 1);
      saveState();
      renderEventTabs();
      renderEventContent();
      renderDishGrid();
      showToast("Dish removed");
    }
  }

  // ==========================================
  // EVENT BINDINGS
  // ==========================================
  function bindEvents() {
    // Nav tabs
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchView(tab.dataset.view));
    });

    // Search
    const searchInput = document.getElementById("search-input");
    let searchTimeout;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        activeFilters.search = searchInput.value.trim();
        renderDishGrid();
      }, 200);
    });

    // Filter bar delegation
    document.getElementById("filter-bar").addEventListener("click", (e) => {
      // Filter group label toggle
      const groupLabel = e.target.closest(".filter-group-label");
      if (groupLabel) {
        toggleFilterGroup(groupLabel.dataset.toggle);
        return;
      }
      // Filter chip toggle
      const chip = e.target.closest(".filter-chip");
      if (!chip) return;

      const key = chip.dataset.filter;
      const value = chip.dataset.value;

      chip.classList.toggle("active");

      if (chip.classList.contains("active")) {
        activeFilters[key].push(value);
      } else {
        activeFilters[key] = activeFilters[key].filter((v) => v !== value);
      }

      updateFilterGroupLabels();
      if (popoverDishId) closePopover();
      renderDishGrid();
    });

    // Clear filters
    document
      .getElementById("btn-clear-filters")
      .addEventListener("click", () => {
        Object.keys(activeFilters).forEach((key) => {
          if (Array.isArray(activeFilters[key])) {
            activeFilters[key] = [];
          } else {
            activeFilters[key] = "";
          }
        });
        document.getElementById("search-input").value = "";
        document
          .querySelectorAll("#filter-bar .filter-chip.active")
          .forEach((c) => c.classList.remove("active"));
        activeFilterGroup = null;
        document
          .querySelectorAll(".filter-group-chips")
          .forEach((c) => c.classList.add("hidden"));
        updateFilterGroupLabels();
        if (popoverDishId) closePopover();
        renderDishGrid();
      });

    // Dish grid - whole card click opens popover
    document.getElementById("dish-grid").addEventListener("click", (e) => {
      const card = e.target.closest(".dish-card");
      if (!card) return;
      const dishId = card.dataset.dishId;
      if (popoverDishId === dishId) {
        closePopover();
        return;
      }
      openPopover(dishId, card);
    });

    // Popover events
    document.getElementById("popover-events").addEventListener("click", (e) => {
      const btn = e.target.closest(".popover-event-btn");
      if (btn && popoverDishId) {
        toggleDishInEvent(btn.dataset.eventId, popoverDishId);
      }
    });

    document
      .getElementById("popover-close")
      .addEventListener("click", closePopover);

    // Click outside popover to dismiss
    document.addEventListener("click", (e) => {
      if (!popoverDishId) return;
      const popover = document.getElementById("dish-popover");
      if (popover.contains(e.target)) return;
      if (e.target.closest(".dish-card")) return;
      closePopover();
    });

    // Help modal
    document
      .getElementById("help-close")
      .addEventListener("click", closeHelpModal);
    document.getElementById("help-overlay").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeHelpModal();
    });

    // Scroll dismiss popover
    window.addEventListener(
      "scroll",
      () => {
        if (popoverDishId) closePopover();
      },
      { passive: true },
    );

    // Event tabs
    document.getElementById("event-tabs").addEventListener("click", (e) => {
      const tab = e.target.closest(".event-tab");
      if (tab) {
        currentEventId = tab.dataset.eventId;
        renderEventTabs();
        renderEventContent();
        saveState();
      }
    });

    // Remove dish from event
    document.getElementById("event-dishes").addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-remove");
      if (btn) {
        removeDishFromEvent(btn.dataset.eventId, btn.dataset.dishId);
      }
    });

    // Event notes
    document.getElementById("event-notes").addEventListener("input", (e) => {
      if (currentEventId) {
        eventNotes[currentEventId] = e.target.value;
        saveState();
      }
    });

    // Copy text
    document
      .getElementById("btn-copy-text")
      .addEventListener("click", copyAsText);

    // Menu bar
    document.getElementById("menu-trigger").addEventListener("click", () => {
      toggleMenuDropdown();
    });

    document
      .getElementById("menu-dropdown-overlay")
      .addEventListener("click", () => {
        toggleMenuDropdown(false);
      });

    document
      .getElementById("menu-dropdown-list")
      .addEventListener("click", (e) => {
        const renameBtn = e.target.closest(".menu-rename-btn");
        if (renameBtn) {
          e.stopPropagation();
          const id = renameBtn.dataset.menuId;
          const current = menuLibrary[id] ? menuLibrary[id].name : "";
          const newName = prompt("Rename menu:", current);
          if (newName) renameMenu(id, newName);
          return;
        }
        const deleteBtn = e.target.closest(".menu-delete-btn");
        if (deleteBtn) {
          e.stopPropagation();
          deleteMenu(deleteBtn.dataset.menuId);
          return;
        }
        const item = e.target.closest(".menu-dropdown-item");
        if (item) {
          switchMenu(item.dataset.menuId);
        }
      });

    document.getElementById("btn-new-menu").addEventListener("click", () => {
      const name = prompt("New menu name:");
      if (name && name.trim()) {
        createNewMenu(name.trim(), true);
        renderDishGrid();
        renderEventTabs();
        renderEventContent();
        renderSummary();
        toggleMenuDropdown(false);
        showToast(`Created "${menuLibrary[activeMenuId].name}"`);
      }
    });

    document.getElementById("btn-save-as").addEventListener("click", () => {
      const name = prompt("Save menu as:");
      if (name && name.trim()) {
        saveMenuAs(name.trim());
      }
    });

    document.getElementById("btn-export").addEventListener("click", exportMenu);

    document.getElementById("btn-import").addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        importMenu(e.target.files[0]);
        e.target.value = "";
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      // Don't capture when typing in input/textarea
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        if (e.key === "Escape") {
          e.target.blur();
        }
        return;
      }

      switch (e.key) {
        case "/":
          e.preventDefault();
          document.getElementById("search-input").focus();
          switchView("browser");
          break;
        case "1":
          switchView("browser");
          break;
        case "2":
          switchView("planner");
          break;
        case "3":
          switchView("summary");
          break;
        case "?":
          document.getElementById("help-overlay").classList.add("active");
          break;
        case "Escape":
          if (popoverDishId) {
            closePopover();
          } else if (menuDropdownOpen) {
            toggleMenuDropdown(false);
          } else {
            closeHelpModal();
          }
          break;
      }
    });
  }

  // ==========================================
  // INIT
  // ==========================================
  loadData().then(() => {
    bindEvents();
  });
})();
