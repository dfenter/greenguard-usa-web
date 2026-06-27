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

  // .design-sync/previews/PortalLayout.tsx
  var PortalLayout_exports = {};
  __export(PortalLayout_exports, {
    AdminNav: () => AdminNav,
    TechnicianNav: () => TechnicianNav,
    WithTopPadding: () => WithTopPadding
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

  // .design-sync/previews/PortalLayout.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  function TechnicianNav() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.PortalLayout, { title: "Today's Route", isAdmin: false, logoHref: "/", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "24px 20px", color: "var(--text)" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { style: { margin: "0 0 8px", color: "var(--green)", fontSize: "1.1rem", fontWeight: 700 }, children: "Page content area" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, opacity: 0.6, fontSize: "0.9rem" }, children: "Route cards and stop list appear here." })
    ] }) });
  }
  function AdminNav() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.PortalLayout, { title: "Admin Dashboard", isAdmin: true, logoHref: "/", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "24px 20px", color: "var(--text)" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { style: { margin: "0 0 8px", color: "var(--green)", fontSize: "1.1rem", fontWeight: 700 }, children: "Admin content area" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, opacity: 0.6, fontSize: "0.9rem" }, children: "Customer list, route plan, analytics appear here." })
    ] }) });
  }
  function WithTopPadding() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.PortalLayout, { title: "Rounds", isAdmin: false, topPadding: 80, logoHref: "/", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "24px 20px", color: "var(--text)" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, opacity: 0.6, fontSize: "0.9rem" }, children: "Content pushed down 80px from top." }) }) });
  }
  return __toCommonJS(PortalLayout_exports);
})();
