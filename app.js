/* ============================================
   Wedding Menu Planner - Application Logic
   V3: Slot-based Event Package System
   ============================================ */
(function () {
  "use strict";

  // ==========================================
  // STATE
  // ==========================================
  let allDishes = [];
  let events = [];
  let eventSelections = {}; // V3: { eventId: { slots: { slotType: [dishId,...] }, extras: [] } }
  let eventNotes = {}; // { eventId: "string" }
  let customDishes = []; // user-created dishes
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

  // Cache for getAllDishIdsForEvent
  let _cacheGen = 0;
  let _dishEventCache = {};

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
  // V3 SLOT SYSTEM CONSTANTS
  // ==========================================
  const SLOT_TEMPLATE = {
    full_meal: [
      { type: "welcome_drink", label: "Welcome Drinks", count: 2 },
      { type: "soup", label: "Soups", count: 1 },
      { type: "salad", label: "Salads", count: 3 },
      { type: "starter", label: "Starters", count: 3 },
      { type: "main_course", label: "Main Courses", count: 3 },
      { type: "dal", label: "Dal", count: 1 },
      { type: "rice", label: "Rice", count: 1 },
      { type: "bread", label: "Breads", count: 2 },
      { type: "curd", label: "Curd/Raita", count: 1 },
      { type: "dessert", label: "Desserts", count: 2 },
      { type: "ice_cream", label: "Ice Cream", count: 1 },
      { type: "live_counter", label: "Live Counter", count: 1 },
    ],
    hi_tea: [
      { type: "drink", label: "Drinks", count: 2 },
      { type: "starter", label: "Starters", count: 3 },
      { type: "dessert", label: "Desserts", count: 1 },
    ],
    freeform: [],
  };

  const EVENT_PACKAGE_MAP = {
    mehndi_lunch: "full_meal",
    sangeet_dinner: "full_meal",
    haldi_lunch: "full_meal",
    wedding_dinner: "full_meal",
    hi_tea: "hi_tea",
    pre_wedding_hi_tea: "hi_tea",
    breakfast: "freeform",
    checkout_breakfast: "freeform",
    supper: "freeform",
  };

  const SLOT_LABELS = {
    welcome_drink: "Welcome Drinks",
    soup: "Soups",
    salad: "Salads",
    starter: "Starters",
    main_course: "Main Courses",
    dal: "Dal",
    rice: "Rice",
    bread: "Breads",
    curd: "Curd/Raita",
    dessert: "Desserts",
    ice_cream: "Ice Cream",
    live_counter: "Live Counter",
    drink: "Drinks",
  };

  // ==========================================
  // DRAFT MENU TEMPLATE
  // ==========================================
  const DRAFT_MENU_TEMPLATE = {
    mehndi_lunch: {
      slots: {
        welcome_drink: ["jaljeera", "roohafza"],
        soup: ["tomato-pudina-shorba"],
        salad: [
          "lachhedar-pyaaz-salad",
          "bean-sprouts-and-pepper-salad",
          "kachumber-salad",
        ],
        starter: [
          "hariyali-bharwan-paneer-tikka",
          "hare-mutter-ki-shammi",
          "mini-kota-kachori",
        ],
        main_course: ["gatte-ki-subzi", "paneer-kofta-anarkali", "kadai-subzi"],
        dal: ["sindhi-kadhi"],
        rice: ["steamed-rice"],
        bread: [],
        curd: [],
        dessert: ["gulab-jamun", "moong-dal-halwa"],
        ice_cream: [],
        live_counter: [],
      },
      extras: ["dahi-bhalla"],
    },
    hi_tea: {
      slots: {
        drink: [],
        starter: ["vada-pav", "ragda-pattice", "kothimbir-vadi"],
        dessert: ["puran-poli"],
      },
      extras: [],
    },
    sangeet_dinner: {
      slots: {
        welcome_drink: ["virgin-mojito", "virgin-strawberry-margarita"],
        soup: ["cream-of-mushroom-soup"],
        salad: [
          "cucumber-tomato-and-mint-salad",
          "tabouleh",
          "garden-green-salad",
        ],
        starter: ["jalapeno-munchers", "falafel", "paneer-manchurian"],
        main_course: [
          "oriental-chilli-garlic-paneer",
          "subz-kali-mirch",
          "melanzane-parmigianna",
        ],
        dal: ["dhungeri-dal"],
        rice: ["mushroom-parsley-rice"],
        bread: [],
        curd: [],
        dessert: ["tiramisu", "orange-mousse-cake"],
        ice_cream: [],
        live_counter: ["live-chaat-station"],
      },
      extras: ["live-pasta-station", "baked-ras-malai"],
    },
    breakfast: {
      slots: {},
      extras: ["dal-pakwan"],
    },
    haldi_lunch: {
      slots: {
        welcome_drink: ["citruz-fuzz", "sauf-ka-sharbat"],
        soup: ["lemon-coriander-vegetable-soup"],
        salad: ["tossed-vegetable-salad", "thai-papaya-and-chives-salad"],
        starter: ["phaldari-kabab"],
        main_course: [],
        dal: [],
        rice: [],
        bread: [],
        curd: ["boondi-phudina-raita"],
        dessert: [],
        ice_cream: [],
        live_counter: ["live-chaat-station"],
      },
      extras: ["aloo-pudina-chaat"],
    },
    pre_wedding_hi_tea: {
      slots: {
        drink: [],
        starter: ["dhokla", "vegetable-samosa", "fruit-chaat"],
        dessert: ["date-and-almond-energy-bites"],
      },
      extras: [],
    },
    wedding_dinner: {
      slots: {
        welcome_drink: ["aam-panna"],
        soup: ["minestrone-country-soup"],
        salad: [],
        starter: ["hara-bhara-kabab"],
        main_course: [
          "baigan-ka-salan",
          "paneer-methi-malai",
          "subz-diwani-handi",
        ],
        dal: ["dal-makhani"],
        rice: ["jeera-pulao"],
        bread: [],
        curd: [],
        dessert: [],
        ice_cream: [],
        live_counter: [],
      },
      extras: [],
    },
    supper: {
      slots: {},
      extras: [],
    },
    checkout_breakfast: {
      slots: {},
      extras: [],
    },
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
      const customSuggestions = customData.dishes || customData;

      allDishes = [...tajDishes, ...customSuggestions];
      events = contextData.wedding ? contextData.events : contextData.events;

      // Load user-created custom dishes and merge into allDishes
      loadCustomDishes();

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
  const STORAGE_KEY_V3 = "wedding-menu-planner-v3";
  const STORAGE_KEY_CUSTOM_DISHES = "wedding-menu-custom-dishes";

  function saveState() {
    if (!activeMenuId || !menuLibrary[activeMenuId]) return;
    const menu = menuLibrary[activeMenuId];
    menu.eventSelections = JSON.parse(JSON.stringify(eventSelections));
    menu.eventNotes = JSON.parse(JSON.stringify(eventNotes));
    menu.updatedAt = new Date().toISOString();
    const fullState = {
      version: 3,
      activeMenuId,
      menus: menuLibrary,
      customDishes: customDishes,
      uiState: { currentEventId, currentView },
    };
    try {
      localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(fullState));
    } catch (e) {
      console.warn("Could not save state:", e);
      showToast("Storage full - could not save");
    }
  }

  function loadState() {
    try {
      // Try V3 first
      const v3 = localStorage.getItem(STORAGE_KEY_V3);
      if (v3) {
        const state = JSON.parse(v3);
        menuLibrary = state.menus || {};
        activeMenuId = state.activeMenuId;
        if (state.customDishes && Array.isArray(state.customDishes)) {
          customDishes = state.customDishes;
          // Merge into allDishes (avoid duplicates)
          customDishes.forEach((cd) => {
            if (!allDishes.find((d) => d.id === cd.id)) {
              allDishes.push(cd);
            }
          });
        }
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
        // Try V2 (flat arrays) and migrate
        const v2 = localStorage.getItem(STORAGE_KEY_V2);
        if (v2) {
          const state = JSON.parse(v2);
          // Back up V2 data
          try {
            localStorage.setItem("wedding-menu-planner-v2-backup", v2);
          } catch (_) {
            // ignore backup failure
          }
          menuLibrary = state.menus || {};
          activeMenuId = state.activeMenuId;
          // Migrate all menus from V2 flat arrays to V3 slot structure
          for (const menu of Object.values(menuLibrary)) {
            if (menu.eventSelections) {
              menu.eventSelections = migrateV2SelectionsToV3(
                menu.eventSelections,
              );
            }
          }
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
          showToast("Menus upgraded to new format");
        } else {
          // Try V1
          const v1 = localStorage.getItem(STORAGE_KEY);
          if (v1) {
            migrateFromV1(JSON.parse(v1));
          } else {
            // First load: create default menu + draft menu
            createNewMenu("My Menu", true);
            createDraftMenu();
          }
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

    // Ensure all events have V3 selections structure
    events.forEach((ev) => {
      if (!eventSelections[ev.id] || !eventSelections[ev.id].slots) {
        eventSelections[ev.id] = initEventSelections(ev.id);
      }
      if (!eventNotes[ev.id]) eventNotes[ev.id] = "";
    });

    invalidateCache();
  }

  function migrateV2SelectionsToV3(v2Selections) {
    const v3Selections = {};
    for (const [evId, dishes] of Object.entries(v2Selections)) {
      if (Array.isArray(dishes)) {
        // Flat array - migrate to V3
        const pkgKey = EVENT_PACKAGE_MAP[evId] || "freeform";
        const template = SLOT_TEMPLATE[pkgKey];
        const slots = {};
        template.forEach((s) => {
          slots[s.type] = [];
        });
        const slotMaxes = {};
        template.forEach((s) => {
          slotMaxes[s.type] = s.count;
        });
        const extras = [];
        dishes.forEach((dishId) => {
          const dish = getDishById(dishId);
          if (!dish) {
            extras.push(dishId);
            return;
          }
          const suggestedSlot = getSuggestedSlotType(dish, pkgKey);
          if (
            suggestedSlot &&
            slots[suggestedSlot] !== undefined &&
            slots[suggestedSlot].length < (slotMaxes[suggestedSlot] || 0)
          ) {
            slots[suggestedSlot].push(dishId);
          } else {
            extras.push(dishId);
          }
        });
        v3Selections[evId] = { slots, extras };
      } else if (dishes && typeof dishes === "object" && dishes.slots) {
        // Already V3
        v3Selections[evId] = dishes;
      } else {
        v3Selections[evId] = initEventSelections(evId);
      }
    }
    return v3Selections;
  }

  function migrateEventIds(obj) {
    for (const [oldId, newId] of Object.entries(EVENT_ID_MIGRATION)) {
      if (obj[oldId] !== undefined) {
        if (!obj[newId]) {
          obj[newId] = obj[oldId];
        } else {
          const oldVal = obj[oldId];
          const newVal = obj[newId];
          // Handle V3 objects (slots + extras)
          if (
            oldVal &&
            typeof oldVal === "object" &&
            oldVal.slots &&
            newVal &&
            typeof newVal === "object" &&
            newVal.slots
          ) {
            // Merge slots
            for (const [slotType, dishIds] of Object.entries(oldVal.slots)) {
              if (!newVal.slots[slotType]) {
                newVal.slots[slotType] = dishIds;
              } else {
                const merged = new Set([...newVal.slots[slotType], ...dishIds]);
                newVal.slots[slotType] = [...merged];
              }
            }
            // Merge extras
            const mergedExtras = new Set([
              ...(newVal.extras || []),
              ...(oldVal.extras || []),
            ]);
            newVal.extras = [...mergedExtras];
          } else if (Array.isArray(oldVal) && Array.isArray(newVal)) {
            // V2 flat array fallback
            const merged = new Set([...newVal, ...oldVal]);
            obj[newId] = [...merged];
          }
        }
        delete obj[oldId];
      }
    }
  }

  function migrateFromV1(v1State) {
    const menuId = "menu_" + Date.now();
    const v2Selections = v1State.eventSelections || {};
    const v3Selections = migrateV2SelectionsToV3(v2Selections);
    menuLibrary[menuId] = {
      id: menuId,
      name: "My Menu",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eventSelections: v3Selections,
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
  // V3 HELPERS
  // ==========================================
  function initEventSelections(eventId) {
    const pkgKey = EVENT_PACKAGE_MAP[eventId] || "freeform";
    const template = SLOT_TEMPLATE[pkgKey];
    const slots = {};
    template.forEach((s) => {
      slots[s.type] = [];
    });
    return { slots, extras: [] };
  }

  function getAllDishIdsForEvent(eventId) {
    const sel = eventSelections[eventId];
    if (!sel) return [];
    // Check cache
    if (
      _dishEventCache[eventId] &&
      _dishEventCache[eventId].gen === _cacheGen
    ) {
      return _dishEventCache[eventId].ids;
    }
    const ids = [];
    if (sel.slots) {
      for (const arr of Object.values(sel.slots)) {
        ids.push(...arr);
      }
    }
    if (sel.extras) {
      ids.push(...sel.extras);
    }
    _dishEventCache[eventId] = { gen: _cacheGen, ids };
    return ids;
  }

  function invalidateCache() {
    _cacheGen++;
  }

  function getSuggestedSlotType(dish, packageKey) {
    if (!dish) return null;
    const cat = dish.category;
    if (packageKey === "full_meal") {
      const map = {
        beverage: "welcome_drink",
        soup: "soup",
        salad: "salad",
        snack: "starter",
        chaat: "starter",
        main_course: "main_course",
        vegetable: "main_course",
        dal: "dal",
        rice: "rice",
        bread: "bread",
        live_station: "live_counter",
      };
      if (map[cat]) return map[cat];
      // Special cases
      if (cat === "dessert") {
        if (
          dish.sub_category === "ice_cream" ||
          /kulfi|ice cream/i.test(dish.name)
        )
          return "ice_cream";
        return "dessert";
      }
      if (cat === "accompaniment" || dish.sub_category === "raita")
        return "curd";
      // hi_tea/breakfast dishes in a full_meal -> use course_type fallback
      if (dish.course_type === "starter") return "starter";
      if (dish.course_type === "dessert") return "dessert";
      if (dish.course_type === "beverage") return "welcome_drink";
      return null; // -> extras
    }
    if (packageKey === "hi_tea") {
      if (cat === "beverage" || dish.course_type === "beverage") return "drink";
      if (cat === "dessert" || dish.course_type === "dessert") return "dessert";
      return "starter"; // everything else
    }
    return null; // freeform -> extras
  }

  function getSlotFill(eventId, slotType) {
    const sel = eventSelections[eventId];
    if (!sel || !sel.slots || !sel.slots[slotType])
      return { current: 0, max: 0 };
    const pkgKey = EVENT_PACKAGE_MAP[eventId] || "freeform";
    const template = SLOT_TEMPLATE[pkgKey];
    const slotDef = template.find((s) => s.type === slotType);
    return {
      current: sel.slots[slotType].length,
      max: slotDef ? slotDef.count : 0,
    };
  }

  function addDishToEvent(eventId, dishId) {
    if (!eventSelections[eventId]) {
      eventSelections[eventId] = initEventSelections(eventId);
    }
    const sel = eventSelections[eventId];
    const pkgKey = EVENT_PACKAGE_MAP[eventId] || "freeform";
    const dish = getDishById(dishId);

    if (pkgKey === "freeform") {
      sel.extras.push(dishId);
      invalidateCache();
      return { slot: null, overflow: false };
    }

    const suggestedSlot = getSuggestedSlotType(dish, pkgKey);
    if (suggestedSlot && sel.slots[suggestedSlot] !== undefined) {
      const fill = getSlotFill(eventId, suggestedSlot);
      if (fill.current < fill.max) {
        sel.slots[suggestedSlot].push(dishId);
        invalidateCache();
        return { slot: suggestedSlot, overflow: false };
      }
    }

    // Overflow to extras
    sel.extras.push(dishId);
    invalidateCache();
    const slotLabel = suggestedSlot
      ? SLOT_LABELS[suggestedSlot] || suggestedSlot
      : null;
    return { slot: null, overflow: true, fullSlotLabel: slotLabel };
  }

  function removeDishFromEvent(eventId, dishId) {
    const sel = eventSelections[eventId];
    if (!sel) return;

    // Search slots first
    if (sel.slots) {
      for (const slotType of Object.keys(sel.slots)) {
        const idx = sel.slots[slotType].indexOf(dishId);
        if (idx >= 0) {
          sel.slots[slotType].splice(idx, 1);
          invalidateCache();
          saveState();
          renderEventTabs();
          renderEventContent();
          renderDishGrid();
          showToast("Dish removed");
          return;
        }
      }
    }

    // Then search extras
    if (sel.extras) {
      const idx = sel.extras.indexOf(dishId);
      if (idx >= 0) {
        sel.extras.splice(idx, 1);
        invalidateCache();
        saveState();
        renderEventTabs();
        renderEventContent();
        renderDishGrid();
        showToast("Dish removed");
        return;
      }
    }
  }

  function moveDishToSlot(eventId, dishId, newSlotType) {
    const sel = eventSelections[eventId];
    if (!sel) return;

    // Remove from current location
    if (sel.slots) {
      for (const slotType of Object.keys(sel.slots)) {
        const idx = sel.slots[slotType].indexOf(dishId);
        if (idx >= 0) {
          sel.slots[slotType].splice(idx, 1);
          break;
        }
      }
    }
    if (sel.extras) {
      const idx = sel.extras.indexOf(dishId);
      if (idx >= 0) {
        sel.extras.splice(idx, 1);
      }
    }

    // Add to new location
    if (newSlotType === "extras") {
      sel.extras.push(dishId);
    } else if (sel.slots[newSlotType] !== undefined) {
      sel.slots[newSlotType].push(dishId);
    } else {
      sel.extras.push(dishId);
    }

    invalidateCache();
    saveState();
    renderEventTabs();
    renderEventContent();
  }

  function getDishSlotInEvent(eventId, dishId) {
    const sel = eventSelections[eventId];
    if (!sel) return null;
    if (sel.slots) {
      for (const [slotType, ids] of Object.entries(sel.slots)) {
        if (ids.includes(dishId)) return slotType;
      }
    }
    if (sel.extras && sel.extras.includes(dishId)) return "extras";
    return null;
  }

  // ==========================================
  // CUSTOM DISH MANAGEMENT
  // ==========================================
  function createCustomDish(name, category) {
    const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const dish = {
      id,
      name: name.trim(),
      category,
      source: "user_created",
      course_type:
        category === "beverage"
          ? "beverage"
          : category === "dessert"
            ? "dessert"
            : category === "soup"
              ? "soup"
              : category === "salad"
                ? "salad"
                : category === "bread"
                  ? "bread"
                  : category === "rice"
                    ? "rice"
                    : category === "dal"
                      ? "dal"
                      : "starter",
      cuisine_region: [],
      cultural_relevance: [],
      description: "",
    };
    customDishes.push(dish);
    allDishes.push(dish);
    saveCustomDishes();
    saveState();
    return dish;
  }

  function saveCustomDishes() {
    try {
      localStorage.setItem(
        STORAGE_KEY_CUSTOM_DISHES,
        JSON.stringify(customDishes),
      );
    } catch (e) {
      console.warn("Could not save custom dishes:", e);
    }
  }

  function loadCustomDishes() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CUSTOM_DISHES);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          customDishes = parsed;
          customDishes.forEach((cd) => {
            if (!allDishes.find((d) => d.id === cd.id)) {
              allDishes.push(cd);
            }
          });
        }
      }
    } catch (e) {
      console.warn("Could not load custom dishes:", e);
    }
  }

  // ==========================================
  // DRAFT MENU
  // ==========================================
  function createDraftMenu() {
    const menuId = "menu_" + (Date.now() + 1);
    const validIds = new Set(allDishes.map((d) => d.id));
    const draftSelections = {};

    for (const [evId, template] of Object.entries(DRAFT_MENU_TEMPLATE)) {
      const slots = {};
      if (template.slots) {
        for (const [slotType, dishIds] of Object.entries(template.slots)) {
          slots[slotType] = dishIds.filter((id) => validIds.has(id));
        }
      }
      const extras = (template.extras || []).filter((id) => validIds.has(id));
      draftSelections[evId] = { slots, extras };
    }

    // Fill in any missing events
    events.forEach((ev) => {
      if (!draftSelections[ev.id]) {
        draftSelections[ev.id] = initEventSelections(ev.id);
      }
    });

    menuLibrary[menuId] = {
      id: menuId,
      name: "Draft Menu v1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eventSelections: draftSelections,
      eventNotes: {},
    };

    // Initialize notes for all events
    events.forEach((ev) => {
      menuLibrary[menuId].eventNotes[ev.id] = "";
    });

    saveState();
    updateMenuUI();
  }

  // ==========================================
  // HELPERS
  // ==========================================
  function getDishById(id) {
    return allDishes.find((d) => d.id === id);
  }

  function getDishEvents(dishId) {
    const evts = [];
    for (const evId of Object.keys(eventSelections)) {
      const ids = getAllDishIdsForEvent(evId);
      if (ids.includes(dishId)) {
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

    // Collect all unique dish IDs across events using V3 helper
    const allSelectedSet = new Set();
    for (const evId of Object.keys(eventSelections)) {
      getAllDishIdsForEvent(evId).forEach((id) => allSelectedSet.add(id));
    }
    const selectedCount = allSelectedSet.size;

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
        const isUserCreated = dish.source === "user_created";
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

        return `<div class="dish-card cat-${dish.category} ${hasEvents ? "dish-selected" : ""} ${isCustom ? "custom-dish" : ""} ${isUserCreated ? "user-dish" : ""}" data-dish-id="${dish.id}">
          <div class="dish-card-top">
            <span class="dish-name">${escapeHtml(dish.name)}</span>
            ${dish.is_signature ? '<span class="badge-dot sig" title="Signature">\u2605</span>' : ""}
            ${isCustom ? '<span class="badge-dot cust" title="Custom">\u25c6</span>' : ""}
            ${isUserCreated ? '<span class="badge-dot user" title="Your dish">\u270e</span>' : ""}
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
        const count = getAllDishIdsForEvent(ev.id).length;
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
    const theme = ev.theme || "";
    headerEl.innerHTML = `
      <h2>${ev.name}</h2>
      <div class="event-timing">${EVENT_TIMING[ev.id] || ""} &bull; ${formatLabel(ev.type || "")}</div>
      <div class="event-guidance">${escapeHtml(ev.guidance || "")}</div>
      ${theme ? `<div class="event-theme">${escapeHtml(theme)}</div>` : ""}
    `;

    const dishesEl = document.getElementById("event-dishes");
    const pkgKey = EVENT_PACKAGE_MAP[ev.id] || "freeform";
    const allIds = getAllDishIdsForEvent(ev.id);

    if (pkgKey === "freeform") {
      // Freeform rendering - same as old grouped-by-course
      renderFreeformEventContent(ev, dishesEl, allIds);
    } else {
      // Structured slot-based rendering
      renderStructuredEventContent(ev, dishesEl, pkgKey);
    }

    // Notes
    const notesEl = document.getElementById("event-notes");
    notesEl.value = eventNotes[ev.id] || "";
  }

  function renderFreeformEventContent(ev, dishesEl, allIds) {
    if (allIds.length === 0) {
      dishesEl.innerHTML =
        '<div class="freeform-banner">Flexible menu -- add dishes freely</div>' +
        '<div class="event-empty">No dishes added yet. Go to Dish Browser to add dishes to this event.</div>';
      return;
    }

    let html =
      '<div class="freeform-banner">Flexible menu -- add dishes freely</div>';

    // Pairing suggestions
    const suggestions = getPairingSuggestions(ev.id);
    if (suggestions.length > 0) {
      html += suggestions
        .map((s) => `<div class="pairing-suggestion">${s}</div>`)
        .join("");
    }

    const grouped = {};
    allIds.forEach((id) => {
      const dish = getDishById(id);
      if (!dish) return;
      const course = getCourseType(dish);
      if (!grouped[course]) grouped[course] = [];
      grouped[course].push(dish);
    });

    const sortedCourses = COURSE_ORDER.filter((c) => grouped[c]);

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

  function renderStructuredEventContent(ev, dishesEl, pkgKey) {
    const sel = eventSelections[ev.id];
    if (!sel) return;
    const template = SLOT_TEMPLATE[pkgKey];
    const allIds = getAllDishIdsForEvent(ev.id);

    let html = "";

    // Package overview chip bar
    html += '<div class="package-overview">';
    template.forEach((slotDef) => {
      const fill = getSlotFill(ev.id, slotDef.type);
      const isFull = fill.current >= fill.max;
      const isOver = fill.current > fill.max;
      const chipClass = isFull
        ? isOver
          ? "slot-chip slot-over"
          : "slot-chip slot-full"
        : "slot-chip";
      const shortLabel = slotDef.label
        .replace(/Welcome /, "WD ")
        .replace(/Main Courses/, "Main")
        .replace(/Live Counter/, "Live");
      html += `<span class="${chipClass}">${shortLabel} ${fill.current}/${fill.max}${isFull && !isOver ? " \u2713" : ""}</span>`;
    });
    html += "</div>";

    if (allIds.length === 0) {
      html +=
        '<div class="event-empty">No dishes added yet. Go to Dish Browser to add dishes to this event.</div>';
      dishesEl.innerHTML = html;
      return;
    }

    // Pairing suggestions
    const suggestions = getPairingSuggestions(ev.id);
    if (suggestions.length > 0) {
      html += suggestions
        .map((s) => `<div class="pairing-suggestion">${s}</div>`)
        .join("");
    }

    // Build slot dropdown options for reassignment
    const slotOptions =
      template
        .map((s) => `<option value="${s.type}">${s.label}</option>`)
        .join("") + '<option value="extras">Extra Picks</option>';

    // Render each slot section
    template.forEach((slotDef) => {
      const slotDishes = sel.slots[slotDef.type] || [];
      const fill = getSlotFill(ev.id, slotDef.type);
      const isFull = fill.current >= fill.max;
      const isOver = fill.current > fill.max;
      const progressClass = isOver
        ? "slot-progress-over"
        : isFull
          ? "slot-progress-full"
          : "";

      html += `<div class="course-section slot-section">
        <div class="course-title ${progressClass}">${slotDef.label} (${fill.current}/${fill.max})${isFull && !isOver ? " \u2713" : ""}</div>`;

      if (slotDishes.length === 0) {
        html += `<div class="slot-empty">No dishes in this slot</div>`;
      } else {
        slotDishes.forEach((dishId) => {
          const dish = getDishById(dishId);
          if (!dish) return;
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
              <select class="slot-reassign" data-event-id="${ev.id}" data-dish-id="${dish.id}">
                ${slotOptions.replace(`value="${slotDef.type}"`, `value="${slotDef.type}" selected`)}
              </select>
              <button class="btn-remove" data-event-id="${ev.id}" data-dish-id="${dish.id}">Remove</button>
            </div>
          </div>`;
        });
      }

      html += "</div>";
    });

    // Extra Picks section
    const extras = sel.extras || [];
    html += `<div class="course-section extras-section">
      <div class="course-title extras-title">Extra Picks (${extras.length})</div>`;

    if (extras.length === 0) {
      html += `<div class="slot-empty">Dishes that overflow their slot appear here</div>`;
    } else {
      extras.forEach((dishId) => {
        const dish = getDishById(dishId);
        if (!dish) return;
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
            <select class="slot-reassign" data-event-id="${ev.id}" data-dish-id="${dish.id}">
              ${slotOptions.replace('value="extras"', 'value="extras" selected')}
            </select>
            <button class="btn-remove" data-event-id="${ev.id}" data-dish-id="${dish.id}">Remove</button>
          </div>
        </div>`;
      });
    }

    html += "</div>";

    dishesEl.innerHTML = html;
  }

  function getPairingSuggestions(eventId) {
    const selectedIds = new Set(getAllDishIdsForEvent(eventId));
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
      getAllDishIdsForEvent(ev.id).forEach((id) => {
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
        const selectedIds = getAllDishIdsForEvent(ev.id);

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
      getAllDishIdsForEvent(ev.id).forEach((id) => {
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
      const selectedIds = getAllDishIdsForEvent(ev.id);
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
    const newEventSelections = {};
    const newEventNotes = {};
    events.forEach((ev) => {
      newEventSelections[ev.id] = initEventSelections(ev.id);
      newEventNotes[ev.id] = "";
    });
    menuLibrary[menuId] = {
      id: menuId,
      name: uniqueName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eventSelections: newEventSelections,
      eventNotes: newEventNotes,
    };
    if (setActive) {
      activeMenuId = menuId;
      eventSelections = JSON.parse(JSON.stringify(newEventSelections));
      eventNotes = JSON.parse(JSON.stringify(newEventNotes));
      invalidateCache();
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
      if (!eventSelections[ev.id] || !eventSelections[ev.id].slots) {
        eventSelections[ev.id] = initEventSelections(ev.id);
      }
      if (!eventNotes[ev.id]) eventNotes[ev.id] = "";
    });
    invalidateCache();
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
      _version: 2,
      name: menu.name,
      exportedAt: new Date().toISOString(),
      eventSelections: menu.eventSelections,
      eventNotes: menu.eventNotes,
      customDishes: customDishes,
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

        // Import custom dishes if present
        if (data.customDishes && Array.isArray(data.customDishes)) {
          data.customDishes.forEach((cd) => {
            if (!customDishes.find((d) => d.id === cd.id)) {
              customDishes.push(cd);
              if (!allDishes.find((d) => d.id === cd.id)) {
                allDishes.push(cd);
                validIds.add(cd.id);
              }
            }
          });
          saveCustomDishes();
        }

        let cleanSelections = {};

        // Check if V2 (flat array) or V3 (slots/extras)
        const isV2Import = isV2SelectionsFormat(data.eventSelections);
        if (isV2Import) {
          // Migrate V2 flat arrays to V3
          const v2Selections = {};
          for (const [evId, dishes] of Object.entries(
            data.eventSelections || {},
          )) {
            v2Selections[evId] = (dishes || []).filter((id) =>
              validIds.has(id),
            );
          }
          cleanSelections = migrateV2SelectionsToV3(v2Selections);
        } else {
          // V3 format - clean dish IDs
          for (const [evId, evData] of Object.entries(
            data.eventSelections || {},
          )) {
            if (evData && typeof evData === "object" && evData.slots) {
              const slots = {};
              for (const [slotType, dishIds] of Object.entries(
                evData.slots || {},
              )) {
                slots[slotType] = (dishIds || []).filter((id) =>
                  validIds.has(id),
                );
              }
              const extras = (evData.extras || []).filter((id) =>
                validIds.has(id),
              );
              cleanSelections[evId] = { slots, extras };
            } else {
              cleanSelections[evId] = initEventSelections(evId);
            }
          }
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

  function isV2SelectionsFormat(selections) {
    if (!selections || typeof selections !== "object") return false;
    for (const val of Object.values(selections)) {
      if (Array.isArray(val)) return true;
      if (val && typeof val === "object" && val.slots) return false;
    }
    return false;
  }

  function validateImport(data) {
    if (!data || typeof data !== "object") return false;
    if (data._format !== "wedding-menu-planner") return false;
    if (!data.eventSelections || typeof data.eventSelections !== "object")
      return false;
    for (const val of Object.values(data.eventSelections)) {
      // Accept V2 arrays
      if (Array.isArray(val)) continue;
      // Accept V3 objects with slots
      if (val && typeof val === "object" && val.slots) continue;
      return false;
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
    for (const evData of Object.values(menu.eventSelections || {})) {
      if (evData && typeof evData === "object" && evData.slots) {
        // V3 format
        for (const arr of Object.values(evData.slots || {})) {
          (arr || []).forEach((id) => ids.add(id));
        }
        (evData.extras || []).forEach((id) => ids.add(id));
      } else if (Array.isArray(evData)) {
        // V2 fallback
        evData.forEach((id) => ids.add(id));
      }
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
  // VIEW 4: MENU TABLE
  // ==========================================
  function renderMenuView() {
    const wrapper = document.getElementById("menu-table-wrapper");

    // Build row definitions from full_meal template (superset of all slots)
    const fullMealSlots = SLOT_TEMPLATE.full_meal;
    const rows = [];

    // Theme row
    rows.push({ key: "theme", label: "Theme", slotType: null, index: 0 });

    // Expand each slot by its count
    fullMealSlots.forEach((slot) => {
      for (let i = 0; i < slot.count; i++) {
        const label =
          slot.count > 1
            ? `${slot.label.replace(/s$/, "")} ${i + 1}`
            : slot.label;
        rows.push({
          key: `${slot.type}_${i}`,
          label,
          slotType: slot.type,
          index: i,
        });
      }
    });

    // Check if any event has extras, add Extra Pick rows
    const maxExtras = Math.max(
      ...events.map((ev) => {
        const sel = eventSelections[ev.id];
        return sel && sel.extras ? sel.extras.length : 0;
      }),
      0,
    );
    const extrasToShow = Math.max(maxExtras, 3);
    for (let i = 0; i < extrasToShow; i++) {
      rows.push({
        key: `extra_${i}`,
        label: `Extra Pick ${i + 1}`,
        slotType: "extras",
        index: i,
      });
    }

    // Group events by day for column headers
    const dayGroups = {};
    events.forEach((ev) => {
      const day = ev.day || 1;
      if (!dayGroups[day]) dayGroups[day] = [];
      dayGroups[day].push(ev);
    });

    // For freeform events, pre-compute dish placement into virtual rows
    const freeformMapping = {};
    events.forEach((ev) => {
      const pkgKey = EVENT_PACKAGE_MAP[ev.id];
      if (pkgKey !== "freeform") return;
      const allIds = getAllDishIdsForEvent(ev.id);
      const placed = {};
      allIds.forEach((id) => {
        const dish = getDishById(id);
        if (!dish) return;
        const course = getCourseType(dish);
        // Map course type to best-matching slot type
        const courseToSlot = {
          beverage: "welcome_drink",
          starter: "starter",
          soup: "soup",
          salad: "salad",
          chaat: "starter",
          main: "main_course",
          side: "main_course",
          bread: "bread",
          rice: "rice",
          dessert: "dessert",
          live_station: "live_counter",
        };
        const slotType = courseToSlot[course] || "main_course";
        if (!placed[slotType]) placed[slotType] = [];
        placed[slotType].push(dish.name);
      });
      freeformMapping[ev.id] = placed;
    });

    // Build table HTML
    let html = '<table class="menu-table">';

    // Day header row
    html += "<thead><tr><th></th>";
    Object.entries(dayGroups).forEach(([day, evts]) => {
      const dayColors = { 1: "#d4edda", 2: "#cce5ff", 3: "#fff3cd" };
      html += `<th colspan="${evts.length}" class="day-header" style="background:${dayColors[day] || "#f0f0f0"}">Day ${day}</th>`;
    });
    html += "</tr>";

    // Event name header row
    html += "<tr><th class='row-label-header'></th>";
    events.forEach((ev) => {
      html += `<th class="event-header-cell">${escapeHtml(ev.name)}</th>`;
    });
    html += "</tr></thead>";

    // Body rows
    html += "<tbody>";
    rows.forEach((row) => {
      const isTheme = row.key === "theme";
      const isExtra = row.slotType === "extras";
      const rowClass = isTheme ? "theme-row" : isExtra ? "extra-row" : "";

      html += `<tr class="${rowClass}">`;
      html += `<td class="row-label">${escapeHtml(row.label)}</td>`;

      events.forEach((ev) => {
        const pkgKey = EVENT_PACKAGE_MAP[ev.id];
        const sel = eventSelections[ev.id];

        if (isTheme) {
          const theme = ev.theme || "";
          html += `<td class="theme-cell">${escapeHtml(theme)}</td>`;
          return;
        }

        if (isExtra) {
          const extras = sel && sel.extras ? sel.extras : [];
          const dishId = extras[row.index];
          const dish = dishId ? getDishById(dishId) : null;
          html += `<td class="dish-cell extra-cell">${dish ? escapeHtml(dish.name) : ""}</td>`;
          return;
        }

        // Regular slot row
        if (pkgKey === "freeform") {
          // Use pre-computed freeform mapping
          const mapping = freeformMapping[ev.id] || {};
          const dishes = mapping[row.slotType] || [];
          const dishName = dishes[row.index] || "";
          html += `<td class="dish-cell freeform-cell">${escapeHtml(dishName)}</td>`;
          return;
        }

        // Structured event
        const slots = sel && sel.slots ? sel.slots : {};
        const slotDishes = slots[row.slotType] || [];
        const dishId = slotDishes[row.index];
        const dish = dishId ? getDishById(dishId) : null;

        // Check if this slot type exists in this event's package
        const template = SLOT_TEMPLATE[pkgKey] || [];
        const slotDef = template.find((s) => s.type === row.slotType);
        const isAvailable = slotDef && row.index < slotDef.count;
        const isNA = !slotDef;

        if (isNA) {
          html += '<td class="dish-cell na-cell"></td>';
        } else if (!isAvailable) {
          html += '<td class="dish-cell na-cell"></td>';
        } else {
          html += `<td class="dish-cell">${dish ? escapeHtml(dish.name) : ""}</td>`;
        }
      });

      html += "</tr>";
    });

    html += "</tbody></table>";
    wrapper.innerHTML = html;
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
    if (view === "menu") {
      renderMenuView();
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
        const isAdded = getAllDishIdsForEvent(ev.id).includes(dishId);
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
    const currentIds = getAllDishIdsForEvent(eventId);
    if (currentIds.includes(dishId)) {
      // Remove
      removeDishFromEventSilent(eventId, dishId);
      showToast("Removed from event");
    } else {
      // Add
      const ev = events.find((e) => e.id === eventId);
      const dish = getDishById(dishId);
      const result = addDishToEvent(eventId, dishId);
      if (result.overflow && result.fullSlotLabel) {
        showToast(
          `Added ${dish ? dish.name : ""} to ${ev ? ev.name : "event"} (${result.fullSlotLabel} full \u2192 Extra Picks)`,
        );
      } else {
        showToast(
          `Added ${dish ? dish.name : ""} to ${ev ? ev.name : "event"}`,
        );
      }
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

  function removeDishFromEventSilent(eventId, dishId) {
    const sel = eventSelections[eventId];
    if (!sel) return;

    // Search slots first
    if (sel.slots) {
      for (const slotType of Object.keys(sel.slots)) {
        const idx = sel.slots[slotType].indexOf(dishId);
        if (idx >= 0) {
          sel.slots[slotType].splice(idx, 1);
          invalidateCache();
          return;
        }
      }
    }

    // Then search extras
    if (sel.extras) {
      const idx = sel.extras.indexOf(dishId);
      if (idx >= 0) {
        sel.extras.splice(idx, 1);
        invalidateCache();
        return;
      }
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

    // Remove dish from event + slot reassignment
    document.getElementById("event-dishes").addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-remove");
      if (btn) {
        removeDishFromEvent(btn.dataset.eventId, btn.dataset.dishId);
      }
    });

    // Slot reassignment dropdown
    document.getElementById("event-dishes").addEventListener("change", (e) => {
      const select = e.target.closest(".slot-reassign");
      if (select) {
        moveDishToSlot(
          select.dataset.eventId,
          select.dataset.dishId,
          select.value,
        );
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

    // Print menu
    document
      .getElementById("btn-print-menu")
      .addEventListener("click", () => window.print());

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

    // FAB - custom dish button
    const fab = document.getElementById("fab-new-dish");
    if (fab) {
      fab.addEventListener("click", () => {
        const modal = document.getElementById("custom-dish-overlay");
        if (modal) modal.classList.add("active");
      });
    }

    // Custom dish modal close
    const customDishClose = document.getElementById("custom-dish-close");
    if (customDishClose) {
      customDishClose.addEventListener("click", () => {
        document
          .getElementById("custom-dish-overlay")
          .classList.remove("active");
      });
    }
    const customDishOverlay = document.getElementById("custom-dish-overlay");
    if (customDishOverlay) {
      customDishOverlay.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) {
          customDishOverlay.classList.remove("active");
        }
      });
    }

    // Custom dish form submit
    const customDishForm = document.getElementById("custom-dish-form");
    if (customDishForm) {
      customDishForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const nameInput = document.getElementById("custom-dish-name");
        const categorySelect = document.getElementById("custom-dish-category");
        const dishName = (nameInput.value || "").trim();
        const category = categorySelect.value;
        if (!dishName) return;

        const dish = createCustomDish(dishName, category);
        nameInput.value = "";

        // Close modal
        document
          .getElementById("custom-dish-overlay")
          .classList.remove("active");

        // Rebuild filters and grid
        buildFilterOptions();
        renderDishGrid();

        showToast(`Created "${dish.name}"`);

        // Auto-open popover for immediate assignment
        setTimeout(() => {
          const card = document.querySelector(
            `.dish-card[data-dish-id="${dish.id}"]`,
          );
          if (card) {
            openPopover(dish.id, card);
          }
        }, 100);
      });
    }

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
        case "4":
          switchView("menu");
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
