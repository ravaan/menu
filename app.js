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
  let modalDishId = null;

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
    mehndi_dinner: "Day 1 - Evening",
    hi_tea: "Day 1 - Afternoon",
    sangeet_dinner: "Day 1 - Night",
    breakfast: "Day 2 - Morning",
    lunch_hi_tea: "Day 2 - Afternoon",
    wedding_dinner: "Day 2 - Evening",
    supper: "Day 2 - Late Night",
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

  function saveState() {
    const state = { eventSelections, eventNotes, currentEventId, currentView };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save state:", e);
    }
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        eventSelections = state.eventSelections || {};
        eventNotes = state.eventNotes || {};
        if (state.currentEventId) currentEventId = state.currentEventId;
        if (state.currentView) {
          currentView = state.currentView;
          switchView(currentView);
        }
      }
    } catch (e) {
      console.warn("Could not load state:", e);
    }

    // Ensure all events have selections arrays
    events.forEach((ev) => {
      if (!eventSelections[ev.id]) eventSelections[ev.id] = [];
      if (!eventNotes[ev.id]) eventNotes[ev.id] = "";
    });
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
          `<button class="filter-chip" data-filter="${filterKey}" data-value="${v}">${formatLabel(v)}</button>`,
      )
      .join("");
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

    stats.textContent = `Showing ${filtered.length} of ${allDishes.length} dishes`;

    if (filtered.length === 0) {
      grid.innerHTML =
        '<div class="event-empty">No dishes match your filters. Try broadening your search.</div>';
      return;
    }

    grid.innerHTML = filtered
      .map((dish) => {
        const isCustom = dish.source === "custom_suggestion";
        const dishEvents = getDishEvents(dish.id);
        const cuisineTags = (dish.cuisine_region || [])
          .slice(0, 3)
          .map((c) => `<span class="tag tag-cuisine">${formatLabel(c)}</span>`)
          .join("");
        const culturalTags = (dish.cultural_relevance || [])
          .map((c) => `<span class="tag tag-cultural">${formatLabel(c)}</span>`)
          .join("");
        const spiceTag = dish.spice_level
          ? `<span class="tag tag-spice-${dish.spice_level}">${formatLabel(dish.spice_level)}</span>`
          : "";
        const categoryTag = `<span class="tag">${formatLabel(dish.category)}</span>`;

        const eventBadges = dishEvents
          .map(
            (ev) => `<span class="event-badge">${ev.name.split(" ")[0]}</span>`,
          )
          .join("");

        const pairingHint = dish.pairing_group ? getPairingHint(dish) : "";

        return `
        <div class="dish-card ${isCustom ? "custom-dish" : ""}" data-dish-id="${dish.id}">
          <div class="dish-card-header">
            <span class="dish-name">${escapeHtml(dish.name)}</span>
            <span class="dish-badges">
              ${isCustom ? '<span class="badge badge-custom">Custom</span>' : ""}
              ${dish.is_signature ? '<span class="badge badge-signature">Signature</span>' : ""}
            </span>
          </div>
          <div class="dish-description">${escapeHtml(dish.description || "")}</div>
          <div class="dish-tags">
            ${categoryTag}${cuisineTags}${culturalTags}${spiceTag}
          </div>
          ${pairingHint ? `<div class="dish-pairing">${pairingHint}</div>` : ""}
          <div class="dish-actions">
            <button class="btn-add-event" data-dish-id="${dish.id}">+ Add to Event</button>
            ${eventBadges ? `<div class="dish-event-badges">${eventBadges}</div>` : ""}
          </div>
        </div>
      `;
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
  // EVENT HANDLERS
  // ==========================================
  function switchView(view) {
    currentView = view;
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

  function openAddModal(dishId) {
    modalDishId = dishId;
    const dish = getDishById(dishId);
    if (!dish) return;

    document.getElementById("modal-dish-name").textContent = dish.name;

    const eventsContainer = document.getElementById("modal-events");
    eventsContainer.innerHTML = events
      .map((ev) => {
        const isAdded = (eventSelections[ev.id] || []).includes(dishId);
        return `<button class="modal-event-btn ${isAdded ? "already-added" : ""}" data-event-id="${ev.id}">
        ${ev.name}
      </button>`;
      })
      .join("");

    document.getElementById("modal-overlay").classList.add("active");
  }

  function closeModal() {
    document.getElementById("modal-overlay").classList.remove("active");
    document.getElementById("help-overlay").classList.remove("active");
    modalDishId = null;
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

    // Filter chips (event delegation)
    document.querySelector(".filter-sidebar").addEventListener("click", (e) => {
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
          .querySelectorAll(".filter-chip.active")
          .forEach((c) => c.classList.remove("active"));
        renderDishGrid();
      });

    // Add to event buttons (delegation on grid)
    document.getElementById("dish-grid").addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-add-event");
      if (btn) {
        openAddModal(btn.dataset.dishId);
      }
    });

    // Modal events
    document.getElementById("modal-events").addEventListener("click", (e) => {
      const btn = e.target.closest(".modal-event-btn");
      if (btn && modalDishId) {
        toggleDishInEvent(btn.dataset.eventId, modalDishId);
        // Update modal buttons
        openAddModal(modalDishId);
      }
    });

    document
      .getElementById("modal-close")
      .addEventListener("click", closeModal);
    document.getElementById("modal-overlay").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // Help modal
    document.getElementById("help-close").addEventListener("click", closeModal);
    document.getElementById("help-overlay").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

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
          closeModal();
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
