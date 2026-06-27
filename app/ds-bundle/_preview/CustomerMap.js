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

  // .design-sync/previews/CustomerMap.tsx
  var CustomerMap_exports = {};
  __export(CustomerMap_exports, {
    CompactNoKey: () => CompactNoKey,
    EmptyList: () => EmptyList,
    NoKey: () => NoKey
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

  // .design-sync/previews/CustomerMap.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  var SAMPLE_CUSTOMERS = [
    {
      id: "c1",
      name: "Sarah Johnson",
      email: "sarah@example.com",
      address: "4821 Shoal Creek Blvd, Austin, TX 78756",
      lat: 30.3344,
      lng: -97.7431,
      status: "active",
      plan: "CO₂ Trap Monthly"
    },
    {
      id: "c2",
      name: "Mike Torres",
      email: "mike@example.com",
      address: "1103 Barton Hills Dr, Austin, TX 78704",
      lat: 30.2449,
      lng: -97.7714,
      status: "active",
      plan: "CO₂ Trap Monthly"
    },
    {
      id: "c3",
      name: "Linda Okafor",
      email: "linda@example.com",
      address: "2108 Manor Rd, Austin, TX 78722",
      lat: 30.2706,
      lng: -97.7131,
      status: "past_due",
      plan: "CO₂ Trap Monthly"
    }
  ];
  var DARK_WRAP = { background: "#0d1a10", borderRadius: 12, padding: 16 };
  function NoKey() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: DARK_WRAP, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CustomerMap, { customers: SAMPLE_CUSTOMERS, height: 360 }) });
  }
  function CompactNoKey() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: DARK_WRAP, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CustomerMap, { customers: SAMPLE_CUSTOMERS, height: 220, compact: true }) });
  }
  function EmptyList() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: DARK_WRAP, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CustomerMap, { customers: [], height: 300 }) });
  }
  return __toCommonJS(CustomerMap_exports);
})();
