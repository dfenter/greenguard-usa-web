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

  // .design-sync/previews/AppointmentDetailDock.tsx
  var AppointmentDetailDock_exports = {};
  __export(AppointmentDetailDock_exports, {
    Loading: () => Loading,
    NewCustomer: () => NewCustomer,
    WithDetails: () => WithDetails
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

  // .design-sync/previews/AppointmentDetailDock.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  var SAMPLE_DETAILS = {
    email: "sarah@example.com",
    event: {
      id: "gcal_evt_001",
      summary: "Sarah Johnson: Biogents CO₂ Trap (GreenGuard USA)",
      location: "4821 Shoal Creek Blvd, Austin, TX 78756",
      description: "Gate code: 4821. Mosquitoes worst near back patio.",
      start: "2026-06-18T10:00:00-05:00",
      end: "2026-06-18T10:30:00-05:00"
    },
    contact: {
      properties: {
        firstname: "Sarah",
        lastname: "Johnson",
        phone: "(512) 555-0142",
        address: "4821 Shoal Creek Blvd, Austin, TX 78756",
        email: "sarah@example.com"
      }
    },
    upcomingBookings: [
      { id: "apt_002", start: "2026-07-16T10:00:00-05:00", summary: "Sarah Johnson: CO₂ Trap (GreenGuard USA)" }
    ],
    pastBookings: [
      { id: "apt_000", start: "2026-05-14T09:00:00-05:00", summary: "Sarah Johnson: CO₂ Trap (GreenGuard USA)" },
      { id: "apt_prev1", start: "2026-04-10T10:00:00-05:00", summary: "Sarah Johnson: CO₂ Trap (GreenGuard USA)" }
    ]
  };
  var PANEL_WRAP = {
    position: "relative",
    transform: "translateZ(0)",
    height: 680,
    overflow: "hidden"
  };
  function Loading() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: PANEL_WRAP, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AppointmentDetailDock, { loading: true, onClose: () => {
    } }) });
  }
  function WithDetails() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: PANEL_WRAP, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AppointmentDetailDock, { details: SAMPLE_DETAILS, onClose: () => {
    } }) });
  }
  function NewCustomer() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: PANEL_WRAP, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      ds_exports.AppointmentDetailDock,
      {
        details: {
          ...SAMPLE_DETAILS,
          event: {
            id: "gcal_evt_002",
            summary: "Alex Rivera: Biogents CO₂ Trap (GreenGuard USA)",
            location: "902 W 12th St, Austin, TX 78703",
            start: "2026-06-26T09:00:00-05:00",
            end: "2026-06-26T09:30:00-05:00"
          },
          contact: {
            properties: {
              firstname: "Alex",
              lastname: "Rivera",
              phone: "(512) 555-0199",
              address: "902 W 12th St, Austin, TX 78703",
              email: "alex@example.com"
            }
          },
          upcomingBookings: [],
          pastBookings: []
        },
        onClose: () => {
        }
      }
    ) });
  }
  return __toCommonJS(AppointmentDetailDock_exports);
})();
