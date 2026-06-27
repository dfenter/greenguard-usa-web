var __dsPreview = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // ds-raw:__ds_raw__
  var require_ds_raw = __commonJS({
    "ds-raw:__ds_raw__"(exports, module) {
      init_define_import_meta_env();
      module.exports = window.GreenGuardPortal;
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function jsx2(t, p, k) {
        return R.createElement(t, k === void 0 ? p : Object.assign({ key: k }, p));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsx2;
      module.exports.jsxDEV = jsx2;
      module.exports.Fragment = R.Fragment;
    }
  });

  // .design-sync/previews/TankCalendar.tsx
  var TankCalendar_exports = {};
  __export(TankCalendar_exports, {
    EmptyCalendar: () => EmptyCalendar,
    WithDeficit: () => WithDeficit,
    WithSchedule: () => WithSchedule
  });
  init_define_import_meta_env();

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  init_define_import_meta_env();
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.GreenGuardPortal;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/TankCalendar.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  var TODAY = "2026-06-18";
  function EmptyCalendar() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: 16, maxWidth: 480 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TankCalendar, { today: TODAY, currentStock: 14, expectedDelivery: 6 }) });
  }
  function WithSchedule() {
    const scheduleByDate = {
      "2026-06-18": { tanks: 1, appts: 2 },
      "2026-06-19": { tanks: 2, appts: 3 },
      "2026-06-22": { tanks: 0, appts: 1 },
      "2026-06-23": { tanks: 1, appts: 2 },
      "2026-06-24": { tanks: 3, appts: 4 },
      // Wednesday delivery
      "2026-06-25": { tanks: 2, appts: 3 },
      "2026-06-26": { tanks: 1, appts: 2 }
    };
    const tankCalendar = {
      "2026-06-16": { delivered: 6, tech: "Dan" },
      "2026-06-17": { delivered: 0, visits: 3 }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: 16, maxWidth: 480 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      ds_exports.TankCalendar,
      {
        today: TODAY,
        currentStock: 8,
        expectedDelivery: 6,
        tankCalendar,
        scheduleByDate
      }
    ) });
  }
  function WithDeficit() {
    const scheduleByDate = {
      "2026-06-18": { tanks: 3, appts: 5 },
      "2026-06-19": { tanks: 3, appts: 5 },
      "2026-06-20": { tanks: 3, appts: 4 },
      "2026-06-23": { tanks: 3, appts: 5 },
      "2026-06-24": { tanks: 3, appts: 5 },
      "2026-06-25": { tanks: 2, appts: 3 }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: 16, maxWidth: 480 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      ds_exports.TankCalendar,
      {
        today: TODAY,
        currentStock: 4,
        expectedDelivery: 6,
        scheduleByDate
      }
    ) });
  }
  return __toCommonJS(TankCalendar_exports);
})();
