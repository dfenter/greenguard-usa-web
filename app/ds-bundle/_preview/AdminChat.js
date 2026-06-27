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

  // .design-sync/previews/AdminChat.tsx
  var AdminChat_exports = {};
  __export(AdminChat_exports, {
    CollapsedButton: () => CollapsedButton,
    ExpandedPanel: () => ExpandedPanel
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

  // .design-sync/previews/AdminChat.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  function CollapsedButton() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { position: "relative", transform: "translateZ(0)", height: 120, overflow: "hidden", background: "var(--bg)", borderRadius: 8 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AdminChat, {}) });
  }
  function ExpandedPanel() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { width: 360, background: "#0d1a10", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(201,168,76,0.35)", boxShadow: "0 12px 36px rgba(0,0,0,0.55)", fontFamily: "Inter, sans-serif" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "14px 18px", background: "rgba(201,168,76,0.07)", borderBottom: "1px solid rgba(201,168,76,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 900, color: "#c9a84c", fontSize: "1rem" }, children: "Ops Assistant" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "0.7rem", color: "rgba(212,230,202,0.5)" }, children: "Route · customers · inventory · SMS" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "rgba(212,230,202,0.6)", fontSize: "1.4rem" }, children: "×" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 16, minHeight: 200 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginBottom: 12, padding: "8px 12px", background: "rgba(201,168,76,0.08)", borderRadius: 8, fontSize: "0.85rem", color: "rgba(212,230,202,0.85)", maxWidth: "85%" }, children: "Ops assistant. Ask me about today's route, a customer, tank inventory, or say 'text [name] I'm on my way'." }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: 12 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "8px 12px", background: "rgba(201,168,76,0.12)", borderRadius: 8, fontSize: "0.85rem", color: "#c9a84c", maxWidth: "85%" }, children: "How many stops today?" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "8px 12px", background: "rgba(201,168,76,0.08)", borderRadius: 8, fontSize: "0.85rem", color: "rgba(212,230,202,0.85)", maxWidth: "85%" }, children: "You have 6 stops today. First is Sarah Johnson at 10:00 AM." })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "10px 14px", borderTop: "1px solid rgba(201,168,76,0.15)", display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: { flex: 1, background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 8, padding: "8px 12px", color: "#d4e6ca", fontSize: "0.85rem" }, placeholder: "Ask anything…", readOnly: true }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: { background: "#c9a84c", border: "none", borderRadius: 8, padding: "8px 14px", color: "#0d1a10", fontWeight: 800, cursor: "pointer", fontSize: "0.85rem" }, children: "Send" })
      ] })
    ] });
  }
  return __toCommonJS(AdminChat_exports);
})();
