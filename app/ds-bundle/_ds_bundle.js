/* @ds-bundle: {"namespace":"GreenGuardPortal","components":[{"name":"AdminChat","sourcePath":"components/general/AdminChat/AdminChat.jsx"},{"name":"AppointmentDetailDock","sourcePath":"components/general/AppointmentDetailDock/AppointmentDetailDock.jsx"},{"name":"CustomerChat","sourcePath":"components/general/CustomerChat/CustomerChat.jsx"},{"name":"CustomerMap","sourcePath":"components/general/CustomerMap/CustomerMap.jsx"},{"name":"CustomerPanel","sourcePath":"components/general/CustomerPanel/CustomerPanel.jsx"},{"name":"PortalLayout","sourcePath":"components/general/PortalLayout/PortalLayout.jsx"},{"name":"SignaturePad","sourcePath":"components/general/SignaturePad/SignaturePad.jsx"},{"name":"StopCard","sourcePath":"components/general/StopCard/StopCard.jsx"},{"name":"TankCalendar","sourcePath":"components/general/TankCalendar/TankCalendar.jsx"}],"sourceHashes":{"components/general/AdminChat/AdminChat.jsx":"330e2546bd0a","components/general/AdminChat/AdminChat.d.ts":"9f6dd08457d1","components/general/AdminChat/AdminChat.prompt.md":"c1752e4bb89d","components/general/AppointmentDetailDock/AppointmentDetailDock.jsx":"4a124872f99e","components/general/AppointmentDetailDock/AppointmentDetailDock.d.ts":"ce87ee410c58","components/general/AppointmentDetailDock/AppointmentDetailDock.prompt.md":"3b18c182a730","components/general/CustomerChat/CustomerChat.jsx":"a26f17ba2672","components/general/CustomerChat/CustomerChat.d.ts":"70ca38d7c129","components/general/CustomerChat/CustomerChat.prompt.md":"49315202fbe8","components/general/CustomerMap/CustomerMap.jsx":"596ad9d0b818","components/general/CustomerMap/CustomerMap.d.ts":"71a885c1231e","components/general/CustomerMap/CustomerMap.prompt.md":"a9914b6782f6","components/general/CustomerPanel/CustomerPanel.jsx":"99db9293a1ad","components/general/CustomerPanel/CustomerPanel.d.ts":"8d5294e8b74c","components/general/CustomerPanel/CustomerPanel.prompt.md":"449c94ada325","components/general/PortalLayout/PortalLayout.jsx":"74718b7ec244","components/general/PortalLayout/PortalLayout.d.ts":"6280a7164ae4","components/general/PortalLayout/PortalLayout.prompt.md":"d0517480031e","components/general/SignaturePad/SignaturePad.jsx":"05f7bd44f4c6","components/general/SignaturePad/SignaturePad.d.ts":"07a0438b75df","components/general/SignaturePad/SignaturePad.prompt.md":"0d1b451f759a","components/general/StopCard/StopCard.jsx":"aa0e689e0c6a","components/general/StopCard/StopCard.d.ts":"cac1ad76cc4e","components/general/StopCard/StopCard.prompt.md":"25cdfb11c7e2","components/general/TankCalendar/TankCalendar.jsx":"e8793cef7e41","components/general/TankCalendar/TankCalendar.d.ts":"b0c6de6abc92","components/general/TankCalendar/TankCalendar.prompt.md":"62dc2de20446"},"inlinedExternals":[],"builtBy":"cc-design-sync"} */
var GreenGuardPortal = (() => {
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

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function jsx10(t, p, k) {
        return R.createElement(t, k === void 0 ? p : Object.assign({ key: k }, p));
      }
      module.exports = R;
      module.exports.jsx = jsx10;
      module.exports.jsxs = jsx10;
      module.exports.jsxDEV = jsx10;
      module.exports.Fragment = R.Fragment;
    }
  });

  // dist/portal-entry.js
  var portal_entry_exports = {};
  __export(portal_entry_exports, {
    AdminChat: () => AdminChat,
    AppointmentDetailDock: () => DetailDock,
    CustomerChat: () => CustomerChat,
    CustomerMap: () => CustomerMap,
    CustomerPanel: () => CustomerPanel,
    PortalLayout: () => PortalLayout,
    SignaturePad: () => SignaturePad,
    StopCard: () => StopCard,
    TankCalendar: () => TankCalendar
  });
  init_define_import_meta_env();
  var import_react = __toESM(require_react_shim());
  var import_jsx_runtime = __toESM(require_react_shim());
  var import_react2 = __toESM(require_react_shim());
  var import_react3 = __toESM(require_react_shim());
  var import_jsx_runtime2 = __toESM(require_react_shim());
  var import_react4 = __toESM(require_react_shim());
  var import_jsx_runtime3 = __toESM(require_react_shim());
  var import_react5 = __toESM(require_react_shim());
  var import_jsx_runtime4 = __toESM(require_react_shim());
  var import_react6 = __toESM(require_react_shim());
  var import_jsx_runtime5 = __toESM(require_react_shim());
  var import_react7 = __toESM(require_react_shim());
  var import_jsx_runtime6 = __toESM(require_react_shim());
  var import_react8 = __toESM(require_react_shim());
  var import_jsx_runtime7 = __toESM(require_react_shim());
  var import_react9 = __toESM(require_react_shim());
  var import_jsx_runtime8 = __toESM(require_react_shim());
  var import_react10 = __toESM(require_react_shim());
  var import_jsx_runtime9 = __toESM(require_react_shim());
  function AdminChat() {
    const [open, setOpen] = (0, import_react.useState)(false);
    const [messages, setMessages] = (0, import_react.useState)([
      { role: "assistant", content: "Ops assistant. Ask me about today's route, a customer, tank inventory, or say 'text [name] I'm on my way'." }
    ]);
    const [input, setInput] = (0, import_react.useState)("");
    const [busy, setBusy] = (0, import_react.useState)(false);
    const endRef = (0, import_react.useRef)(null);
    (0, import_react.useEffect)(() => {
      if (open && endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" });
    }, [messages, open]);
    async function send() {
      const msg = input.trim();
      if (!msg || busy) return;
      setBusy(true);
      setInput("");
      const next = [...messages, { role: "user", content: msg }];
      setMessages(next);
      try {
        const res = await fetch("/api/admin/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, history: messages.filter((m) => typeof m.content === "string") })
        });
        const j = await res.json();
        setMessages([...next, { role: "assistant", content: res.ok ? j.reply : j.error || "Something went wrong." }]);
      } catch {
        setMessages([...next, { role: "assistant", content: "Connection trouble. Try again." }]);
      } finally {
        setBusy(false);
      }
    }
    if (!open) {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          onClick: () => setOpen(true),
          "aria-label": "Open ops assistant",
          style: {
            position: "fixed",
            right: 20,
            bottom: 88,
            zIndex: 95,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#0d1a10",
            color: "#5bc4ff",
            border: "1px solid rgba(91,196,255,0.45)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            fontSize: "1.6rem",
            cursor: "pointer"
          },
          children: "\u{1F4AC}"
        }
      );
    }
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: {
      position: "fixed",
      right: 20,
      bottom: 88,
      zIndex: 95,
      width: "min(400px, calc(100vw - 40px))",
      height: "min(560px, calc(100vh - 120px))",
      background: "#0d1a10",
      borderRadius: 16,
      overflow: "hidden",
      border: "1px solid rgba(201,168,76,0.35)",
      boxShadow: "0 12px 36px rgba(0,0,0,0.55)",
      display: "flex",
      flexDirection: "column",
      fontFamily: "Inter, sans-serif"
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: {
        padding: "14px 18px",
        background: "rgba(201,168,76,0.07)",
        borderBottom: "1px solid rgba(201,168,76,0.2)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 900, color: "#c9a84c", fontSize: "1rem" }, children: "Ops Assistant" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "0.7rem", color: "rgba(212,230,202,0.5)" }, children: "Route \xB7 customers \xB7 inventory \xB7 SMS" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => setOpen(false), style: { background: "none", border: "none", color: "rgba(212,230,202,0.6)", cursor: "pointer", fontSize: "1.4rem" }, children: "\xD7" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1, overflowY: "auto", padding: "14px 18px" }, children: [
        messages.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { margin: "8px 0", display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: {
          maxWidth: "85%",
          padding: "10px 14px",
          borderRadius: 12,
          background: m.role === "user" ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.05)",
          color: "#e3f0db",
          fontSize: "0.9rem",
          lineHeight: 1.45,
          whiteSpace: "pre-wrap"
        }, children: m.content }) }, i)),
        busy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "rgba(212,230,202,0.4)", fontSize: "0.85rem", padding: "6px 12px" }, children: "working\u2026" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref: endRef })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "12px 14px", borderTop: "1px solid rgba(122,171,130,0.15)", display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "text",
            value: input,
            onChange: (e) => setInput(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            },
            placeholder: "Ask the ops assistant\u2026",
            disabled: busy,
            style: {
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.05)",
              color: "#e3f0db",
              border: "1px solid rgba(122,171,130,0.25)",
              fontSize: "0.9rem",
              outline: "none",
              fontFamily: "inherit"
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            onClick: send,
            disabled: busy || !input.trim(),
            style: {
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              cursor: busy || !input.trim() ? "not-allowed" : "pointer",
              background: busy || !input.trim() ? "rgba(201,168,76,0.2)" : "#c9a84c",
              color: "#0d1a10",
              fontWeight: 800,
              fontSize: "0.85rem"
            },
            children: "Send"
          }
        )
      ] })
    ] });
  }
  function Link({ href, children, ...props }) {
    return import_react3.default.createElement("a", { href, ...props }, children);
  }
  var TZ = "America/Chicago";
  function fmtDockDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
  }
  function fmtDockTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  }
  function cleanDescription(desc) {
    if (!desc) return "";
    return desc.split(/\r?\n/).filter((l) => !/^(Change Appointment:|Please use Acuity|AcuityID=|\(created by Acuity|Calendar:|Name:|Phone:|Email:|Price:|Location|Address|====|Rental Terms)/i.test(l.trim())).join("\n").trim();
  }
  function CalApptRow({ b, accent }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { padding: "9px 0", borderBottom: "1px solid rgba(122,171,130,0.07)" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: "0.83rem", fontWeight: 800, color: accent }, children: fmtDockDate(b.start) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.4)", whiteSpace: "nowrap" }, children: fmtDockTime(b.start) })
      ] }),
      b.summary && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.75rem", color: "rgba(212,230,202,0.5)", marginTop: 2 }, children: b.summary.replace(/\s*\(GreenGuard USA\)\s*$/, "") })
    ] });
  }
  function CalAppointmentHistory({ d, scheduleHref }) {
    const upcoming = d.upcomingBookings || (d.next ? [d.next] : []);
    const past = d.pastBookings || (d.last ? [d.last] : []);
    const lbl = { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", margin: "16px 0 6px" };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { paddingTop: 4 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Link,
        {
          href: scheduleHref,
          style: { display: "block", textAlign: "center", padding: "10px 14px", borderRadius: 6, background: "#c9a84c", color: "#0d1a10", fontWeight: 900, fontSize: "0.85rem", textDecoration: "none" },
          children: "+ Schedule appointment"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: lbl, children: [
        "Upcoming (",
        upcoming.length,
        ")"
      ] }),
      upcoming.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.3)" }, children: "None scheduled" }) : upcoming.map((b, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CalApptRow, { b, accent: "#c9a84c" }, b.id || i)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: lbl, children: [
        "Past (",
        past.length,
        ")"
      ] }),
      past.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.3)" }, children: "No past visits" }) : past.map((b, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CalApptRow, { b, accent: "#7dffaa" }, b.id || i))
    ] });
  }
  function EventNotesSection({ eventId, customerEmail }) {
    const [notes, setNotes] = (0, import_react2.useState)([]);
    const [body, setBody] = (0, import_react2.useState)("");
    const [busy, setBusy] = (0, import_react2.useState)(false);
    const [msg, setMsg] = (0, import_react2.useState)(null);
    async function load() {
      try {
        const res = await fetch(`/api/admin/event-notes?eventId=${encodeURIComponent(eventId)}`);
        const j = await res.json();
        if (res.ok) setNotes(j.notes || []);
      } catch {
      }
    }
    (0, import_react2.useEffect)(() => {
      load();
    }, [eventId]);
    async function save() {
      if (!body.trim()) return;
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/admin/event-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, customerEmail, body })
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setBody("");
        setMsg({ ok: true, text: "Saved." });
        load();
        setTimeout(() => setMsg(null), 2e3);
      } catch (err) {
        setMsg({ ok: false, text: err.message });
      } finally {
        setBusy(false);
      }
    }
    async function del(id) {
      if (!window.confirm("Delete this note?")) return;
      await fetch(`/api/admin/event-notes?id=${id}`, { method: "DELETE" });
      load();
    }
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 14, padding: 12, background: "rgba(125,255,170,0.04)", border: "1px solid rgba(125,255,170,0.18)", borderRadius: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7dffaa", marginBottom: 8 }, children: "This appointment's notes" }),
      notes.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }, children: notes.map((n) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { padding: "7px 10px", background: "rgba(0,0,0,0.2)", borderRadius: 4, fontSize: "0.78rem", color: "rgba(212,230,202,0.85)", position: "relative" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { whiteSpace: "pre-wrap", lineHeight: 1.4 }, children: n.body }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { fontSize: "0.66rem", color: "rgba(212,230,202,0.4)" }, children: [
            n.author_email?.split("@")[0],
            " \xB7 ",
            new Date(n.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              onClick: () => del(n.id),
              title: "Delete",
              style: { background: "none", border: "none", color: "rgba(255,128,128,0.55)", cursor: "pointer", fontSize: "0.72rem", padding: 0, fontFamily: "inherit" },
              children: "\xD7"
            }
          )
        ] })
      ] }, n.id)) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "textarea",
        {
          rows: 2,
          value: body,
          onChange: (e) => setBody(e.target.value),
          placeholder: "Gate code today, side gate only, customer requested AM\u2026",
          style: { width: "100%", padding: "7px 9px", borderRadius: 5, border: "1px solid rgba(122,171,130,0.25)", background: "rgba(255,255,255,0.04)", color: "#d4e6ca", fontSize: "0.82rem", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 6, alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            onClick: save,
            disabled: busy || !body.trim(),
            style: { padding: "5px 12px", borderRadius: 4, border: "none", background: "#7dffaa", color: "#0d1a10", fontWeight: 800, fontSize: "0.76rem", cursor: busy || !body.trim() ? "not-allowed" : "pointer", opacity: busy || !body.trim() ? 0.5 : 1, fontFamily: "Inter, sans-serif" },
            children: busy ? "Saving\u2026" : "Add"
          }
        ),
        msg && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: "0.74rem", color: msg.ok ? "#7dffaa" : "#ff8080" }, children: msg.text })
      ] })
    ] });
  }
  function DockNoteComposer({ email, hsContactId }) {
    const [body, setBody] = (0, import_react2.useState)("");
    const [busy, setBusy] = (0, import_react2.useState)(false);
    const [msg, setMsg] = (0, import_react2.useState)(null);
    async function save() {
      if (!body.trim()) return;
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/admin/add-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, contactId: hsContactId, body })
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setBody("");
        setMsg({ ok: true, text: "Saved." });
        setTimeout(() => setMsg(null), 2500);
      } catch (err) {
        setMsg({ ok: false, text: err.message });
      } finally {
        setBusy(false);
      }
    }
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "textarea",
        {
          rows: 2,
          value: body,
          onChange: (e) => setBody(e.target.value),
          placeholder: "Add a note to this customer's HubSpot timeline\u2026",
          style: { width: "100%", padding: "7px 9px", borderRadius: 5, border: "1px solid rgba(122,171,130,0.25)", background: "rgba(255,255,255,0.04)", color: "#d4e6ca", fontSize: "0.82rem", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 6, alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            onClick: save,
            disabled: busy || !body.trim(),
            style: { padding: "5px 12px", borderRadius: 4, border: "none", background: "#7dffaa", color: "#0d1a10", fontWeight: 800, fontSize: "0.76rem", cursor: busy || !body.trim() ? "not-allowed" : "pointer", opacity: busy || !body.trim() ? 0.5 : 1, fontFamily: "Inter, sans-serif" },
            children: busy ? "Saving\u2026" : "Save"
          }
        ),
        msg && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: "0.74rem", color: msg.ok ? "#7dffaa" : "#ff8080" }, children: msg.text })
      ] })
    ] });
  }
  function DetailDock({ details, loading, onClose }) {
    const d = details || {};
    const ev = d.event || {};
    const p = d.contact?.properties || {};
    const customerName = [p.firstname, p.lastname].filter(Boolean).join(" ") || ev.summary?.split(":")[0] || "Unknown";
    const phone = p.phone || "";
    const address = p.address || ev.location || "";
    const email = d.email || p.email || "";
    const notes = cleanDescription(ev.description);
    const billingContact = p.billing_contact_name;
    const [tab, setTab] = (0, import_react2.useState)("details");
    const scheduleHref = "/admin/booking?" + new URLSearchParams({ email: email || "", name: customerName || "", phone: phone || "", address: address || "" }).toString();
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: {
      position: "fixed",
      right: 0,
      top: 0,
      bottom: 0,
      width: "min(420px, 95vw)",
      background: "#0d1a10",
      borderLeft: "1px solid rgba(122,171,130,0.25)",
      boxShadow: "-4px 0 24px rgba(0,0,0,0.5)",
      zIndex: 300,
      overflow: "auto",
      color: "#d4e6ca",
      fontFamily: "Inter, sans-serif"
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { padding: "14px 18px", borderBottom: "1px solid rgba(122,171,130,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#0d1a10", zIndex: 1 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(212,230,202,0.45)" }, children: "Appointment Details" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: onClose, style: { background: "none", border: "none", color: "rgba(212,230,202,0.5)", cursor: "pointer", fontSize: "1.4rem", lineHeight: 1, padding: 0 }, children: "\xD7" })
      ] }),
      loading && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { padding: 20, color: "rgba(212,230,202,0.5)", fontSize: "0.85rem" }, children: "Loading\u2026" }),
      !loading && d.error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { padding: 20, color: "#ff8080", fontSize: "0.85rem" }, children: d.error }),
      !loading && !d.error && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { padding: "14px 18px" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 2 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "1.1rem", fontWeight: 900 }, children: customerName }),
            billingContact && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: "0.7rem", color: "#c9a84c", fontWeight: 700, background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", padding: "2px 8px", borderRadius: 4, display: "inline-block", marginTop: 4 }, children: [
              "Bill to: ",
              billingContact
            ] })
          ] }),
          (address || phone) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { textAlign: "right", flexShrink: 0, maxWidth: "55%" }, children: [
            address && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.78rem", marginBottom: 2 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("a", { href: `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`, target: "_blank", rel: "noopener noreferrer", style: { color: "#7dffaa", textDecoration: "none" }, children: [
              "\u{1F4CD} ",
              address
            ] }) }),
            phone && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.78rem" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("a", { href: `tel:${phone}`, style: { color: "#7dffaa", textDecoration: "none" }, children: [
              "\u{1F4DE} ",
              phone
            ] }) })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", gap: 6, margin: "12px 0 4px" }, children: [{ k: "details", l: "Details" }, { k: "history", l: "History" }].map((t) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            onClick: () => setTab(t.k),
            style: {
              padding: "6px 16px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: "0.76rem",
              fontFamily: "Inter, sans-serif",
              background: tab === t.k ? "#c9a84c" : "rgba(201,168,76,0.1)",
              color: tab === t.k ? "#0d1a10" : "rgba(201,168,76,0.7)"
            },
            children: t.l
          },
          t.k
        )) }),
        tab === "history" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CalAppointmentHistory, { d, scheduleHref }),
        tab === "details" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginTop: 10, marginBottom: 14, padding: "10px 12px", background: "rgba(125,255,170,0.05)", border: "1px solid rgba(125,255,170,0.15)", borderRadius: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.85rem", fontWeight: 700, marginBottom: 4 }, children: ev.summary?.replace(/\s*\(GreenGuard USA\)\s*$/, "") || "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: "0.78rem", color: "#7dffaa", fontWeight: 700 }, children: [
              fmtDockDate(ev.start),
              " \xB7 ",
              fmtDockTime(ev.start),
              ev.end ? ` \u2013 ${fmtDockTime(ev.end)}` : ""
            ] })
          ] }),
          email && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 14 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 6 }, children: "Customer" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: "0.85rem", marginBottom: 3 }, children: [
              "\u2709 ",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href: `mailto:${email}`, style: { color: "#7dffaa", textDecoration: "none" }, children: email })
            ] })
          ] }),
          (p.system_type || p.trap_count || p.tank_count || p.recurring_addons) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 14 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 6 }, children: "Service Profile" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.75)" }, children: [
              p.system_type && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                "System: ",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: p.system_type })
              ] }),
              p.trap_count && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                "Traps: ",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: p.trap_count })
              ] }),
              p.tank_count && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                "Tanks: ",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: p.tank_count })
              ] }),
              p.recurring_addons && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                "Recurring: ",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: p.recurring_addons })
              ] })
            ] })
          ] }),
          (p.gate_code || p.access_notes || p.pets_on_property || p.special_instructions) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 14, display: "flex", flexDirection: "column", gap: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 2 }, children: "Property Notes" }),
            p.pets_on_property && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: "0.78rem", padding: "6px 10px", background: "rgba(255,160,80,0.08)", border: "1px solid rgba(255,160,80,0.3)", borderRadius: 6, color: "#ffb060" }, children: [
              "\u{1F415} ",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "Pets:" }),
              " ",
              p.pets_on_property
            ] }),
            p.gate_code && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: "0.78rem", padding: "6px 10px", background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 6, color: "#c9a84c" }, children: [
              "\u{1F511} ",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "Gate code:" }),
              " ",
              p.gate_code
            ] }),
            p.access_notes && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: "0.78rem", padding: "6px 10px", background: "rgba(91,196,255,0.07)", border: "1px solid rgba(91,196,255,0.25)", borderRadius: 6, color: "#5bc4ff" }, children: [
              "\u{1F6AA} ",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "Access:" }),
              " ",
              p.access_notes
            ] }),
            p.special_instructions && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: "0.78rem", padding: "6px 10px", background: "rgba(125,255,170,0.06)", border: "1px solid rgba(125,255,170,0.25)", borderRadius: 6, color: "#7dffaa" }, children: [
              "\u{1F4DD} ",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "Notes:" }),
              " ",
              p.special_instructions
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 14 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 6 }, children: "Appointment History" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.65)" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                "Last visit: ",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { style: { color: "#d4e6ca" }, children: d.last ? fmtDockDate(d.last.start) : "\u2014" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                "Next visit: ",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { style: { color: "#d4e6ca" }, children: d.next ? fmtDockDate(d.next.start) : "\u2014" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.4)", marginTop: 2 }, children: [
                "Total appointments: ",
                d.totalAppointments || 0
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EventNotesSection, { eventId: ev.id, customerEmail: email }),
          notes && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 14 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 6 }, children: "Notes" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.7)", whiteSpace: "pre-wrap" }, children: notes })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 14 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 6 }, children: "Customer note (HubSpot timeline)" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DockNoteComposer, { email, hsContactId: d.contact?.id })
          ] })
        ] })
      ] })
    ] });
  }
  function CustomerChat() {
    const [open, setOpen] = (0, import_react4.useState)(false);
    const [messages, setMessages] = (0, import_react4.useState)([
      { role: "assistant", content: "Hi! I can answer simple questions about your service, billing, or next visit. What can I help with?" }
    ]);
    const [input, setInput] = (0, import_react4.useState)("");
    const [busy, setBusy] = (0, import_react4.useState)(false);
    const endRef = (0, import_react4.useRef)(null);
    (0, import_react4.useEffect)(() => {
      if (open && endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" });
    }, [messages, open]);
    async function send() {
      const msg = input.trim();
      if (!msg || busy) return;
      setBusy(true);
      setInput("");
      const next = [...messages, { role: "user", content: msg }];
      setMessages(next);
      try {
        const res = await fetch("/api/customer/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, history: messages })
        });
        const j = await res.json();
        if (res.ok) {
          setMessages([...next, { role: "assistant", content: j.reply, escalated: j.escalated }]);
        } else {
          setMessages([...next, { role: "assistant", content: j.error || "Sorry, something went wrong. Please email admin@greenguard-usa.com." }]);
        }
      } catch (e) {
        setMessages([...next, { role: "assistant", content: "I'm having trouble connecting. Please try again or email admin@greenguard-usa.com." }]);
      } finally {
        setBusy(false);
      }
    }
    if (!open) {
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          onClick: () => setOpen(true),
          "aria-label": "Open chat",
          style: {
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 200,
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "#0d1a10",
            color: "#7dffaa",
            border: "1px solid rgba(125,255,170,0.4)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            fontSize: "1.8rem",
            cursor: "pointer"
          },
          children: "\u{1F4AC}"
        }
      );
    }
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: {
      position: "fixed",
      right: 20,
      bottom: 20,
      zIndex: 200,
      width: "min(380px, calc(100vw - 40px))",
      height: "min(540px, calc(100vh - 100px))",
      background: "#0d1a10",
      borderRadius: 16,
      overflow: "hidden",
      border: "1px solid rgba(125,255,170,0.3)",
      boxShadow: "0 12px 36px rgba(0,0,0,0.5)",
      display: "flex",
      flexDirection: "column",
      fontFamily: "Inter, sans-serif"
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: {
        padding: "14px 18px",
        background: "rgba(125,255,170,0.06)",
        borderBottom: "1px solid rgba(125,255,170,0.15)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontWeight: 900, color: "#7dffaa", fontSize: "1rem" }, children: "GreenGuard Assistant" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: "0.7rem", color: "rgba(212,230,202,0.5)" }, children: "Powered by AI \xB7 Escalates to humans" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { onClick: () => setOpen(false), style: { background: "none", border: "none", color: "rgba(212,230,202,0.6)", cursor: "pointer", fontSize: "1.4rem" }, children: "\xD7" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { flex: 1, overflowY: "auto", padding: "14px 18px" }, children: [
        messages.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: {
          margin: "8px 0",
          display: "flex",
          justifyContent: m.role === "user" ? "flex-end" : "flex-start"
        }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: {
          maxWidth: "85%",
          padding: "10px 14px",
          borderRadius: 12,
          background: m.role === "user" ? "rgba(125,255,170,0.15)" : "rgba(255,255,255,0.05)",
          color: "#d4e6ca",
          fontSize: "0.9rem",
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          ...m.escalated ? { borderLeft: "3px solid #c9a84c" } : {}
        }, children: [
          m.content,
          m.escalated && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { marginTop: 6, fontSize: "0.72rem", color: "#c9a84c" }, children: "\u2691 Flagged for the team" })
        ] }) }, i)),
        busy && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { color: "rgba(212,230,202,0.4)", fontSize: "0.85rem", padding: "6px 12px" }, children: "thinking\u2026" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { ref: endRef })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { padding: "12px 14px", borderTop: "1px solid rgba(122,171,130,0.15)", display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "text",
            value: input,
            onChange: (e) => setInput(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            },
            placeholder: "Type a question\u2026",
            disabled: busy,
            style: {
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.05)",
              color: "#d4e6ca",
              border: "1px solid rgba(122,171,130,0.25)",
              fontSize: "0.9rem",
              outline: "none",
              fontFamily: "inherit"
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            onClick: send,
            disabled: busy || !input.trim(),
            style: {
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              cursor: busy || !input.trim() ? "not-allowed" : "pointer",
              background: busy || !input.trim() ? "rgba(125,255,170,0.2)" : "#7dffaa",
              color: "#0d1a10",
              fontWeight: 800,
              fontSize: "0.85rem"
            },
            children: "Send"
          }
        )
      ] })
    ] });
  }
  var STATUS_COLORS = {
    active: "#7dffaa",
    trialing: "#7dffaa",
    past_due: "#ffb060",
    unpaid: "#ff8080",
    canceled: "rgba(212,230,202,0.3)",
    inactive: "rgba(212,230,202,0.3)"
  };
  function CustomerMap({ customers = [], mapsKey, height = 400, compact = false }) {
    const mapRef = (0, import_react5.useRef)(null);
    const mapObj = (0, import_react5.useRef)(null);
    const [loaded, setLoaded] = (0, import_react5.useState)(false);
    (0, import_react5.useEffect)(() => {
      if (!mapsKey || loaded) return;
      if (window.google?.maps) {
        setLoaded(true);
        return;
      }
      const existing = document.querySelector("script[data-greenguard-maps]");
      if (existing) {
        existing.addEventListener("load", () => setLoaded(true));
        return;
      }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=marker`;
      script.async = true;
      script.dataset.greenguardMaps = "1";
      script.onload = () => setLoaded(true);
      document.head.appendChild(script);
    }, [mapsKey, loaded]);
    (0, import_react5.useEffect)(() => {
      if (!loaded || !mapRef.current || mapObj.current) return;
      mapObj.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 30.2672, lng: -97.7431 },
        zoom: compact ? 10 : 11,
        disableDefaultUI: compact,
        zoomControl: true,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#0d1a10" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#7aab82" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#0d1a10" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a2e1f" }] },
          { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0d1a10" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#051a08" }] },
          { featureType: "poi", stylers: [{ visibility: "off" }] }
        ]
      });
    }, [loaded, compact]);
    (0, import_react5.useEffect)(() => {
      if (!mapObj.current || !loaded) return;
      mapObj.current._markers?.forEach((m) => m.setMap(null));
      mapObj.current._markers = [];
      const geocoder = new window.google.maps.Geocoder();
      if (!mapObj.current._geoCache) mapObj.current._geoCache = {};
      const geoCache = mapObj.current._geoCache;
      function placeMarker(c, pos) {
        const color = STATUS_COLORS[c.status] || "#7aab82";
        const marker = new window.google.maps.Marker({
          position: pos,
          map: mapObj.current,
          title: c.name,
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: compact ? 6 : 9, fillColor: color, fillOpacity: 0.9, strokeColor: "#0d1a10", strokeWeight: 2 }
        });
        mapObj.current._markers.push(marker);
      }
      customers.forEach((c, idx) => {
        if (!c.address) return;
        if (geoCache[c.id]) {
          placeMarker(c, geoCache[c.id]);
          return;
        }
        setTimeout(() => {
          geocoder.geocode({ address: c.address }, (results, status) => {
            if (status !== "OK" || !results[0]) return;
            const pos = results[0].geometry.location;
            geoCache[c.id] = pos;
            placeMarker(c, pos);
          });
        }, idx * 100);
      });
    }, [loaded, customers, compact]);
    if (!mapsKey) {
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { padding: 12, borderRadius: 8, background: "linear-gradient(165deg, rgba(125,255,170,0.05), rgba(201,168,76,0.022))", color: "rgba(212,230,202,0.5)", fontSize: "0.85rem" }, children: "Map unavailable (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set)" });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { ref: mapRef, style: { height, width: "100%", borderRadius: 12, border: "1px solid rgba(122,171,130,0.2)", overflow: "hidden", background: "#0d1a10" }, children: !loaded && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(212,230,202,0.3)", fontSize: "0.88rem" }, children: "Loading map\u2026" }) });
  }
  function useRouter() {
    return { pathname: "/", query: {}, push: () => {
    }, back: () => {
    }, replace: () => {
    } };
  }
  var TZ2 = "America/Chicago";
  var CUST_STATUS = {
    active: { bg: "rgba(125,255,170,0.12)", color: "#7dffaa", label: "Active" },
    trialing: { bg: "rgba(125,255,170,0.08)", color: "#7dffaa", label: "Trialing" },
    past_due: { bg: "rgba(255,130,80,0.12)", color: "#ff8050", label: "Past Due" },
    inactive: { bg: "rgba(212,230,202,0.06)", color: "rgba(212,230,202,0.4)", label: "No Sub" },
    canceled: { bg: "rgba(212,230,202,0.06)", color: "rgba(212,230,202,0.4)", label: "Canceled" },
    prospect: { bg: "rgba(201,168,76,0.12)", color: "#c9a84c", label: "Prospect" }
  };
  function getTrapImage(systemType, trapCount) {
    const images = JSON.parse("null");
    if (images) {
      return images[`${systemType}-${trapCount}`] || images[systemType] || null;
    }
    if (systemType === "Mosqitter-Grand" || systemType === "Mosqitter" || systemType === "MQ-RENT") return "/images/trap-mosqitter.webp";
    if (systemType === "Biogents-NonCO2") return "/images/mosquitairenoco2.webp";
    if (systemType === "Biogents-CO2") {
      if (trapCount >= 3) return "/images/biogentstriple.webp";
      if (trapCount === 2) return "/images/mosquitairedouble.webp";
      return "/images/mosquitairesingle.jpg";
    }
    return null;
  }
  function fmtDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ2 });
  }
  function fmtTime(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ2 });
  }
  function fmtDateShort(unix) {
    return new Date(unix * 1e3).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ2 });
  }
  function fmtAmt(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }
  function StatusBadge({ status }) {
    const s = CUST_STATUS[status] || CUST_STATUS.inactive;
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.06em", background: s.bg, color: s.color }, children: s.label });
  }
  function NoteComposer({ email, hsContactId, onSaved }) {
    const [body, setBody] = (0, import_react6.useState)("");
    const [busy, setBusy] = (0, import_react6.useState)(false);
    const [msg, setMsg] = (0, import_react6.useState)(null);
    async function save() {
      if (!body.trim()) return;
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/admin/add-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, contactId: hsContactId, body })
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setBody("");
        setMsg({ ok: true, text: "Saved." });
        onSaved?.();
        setTimeout(() => setMsg(null), 2500);
      } catch (err) {
        setMsg({ ok: false, text: err.message });
      } finally {
        setBusy(false);
      }
    }
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 4 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "textarea",
        {
          rows: 3,
          value: body,
          onChange: (e) => setBody(e.target.value),
          placeholder: "What did you observe / arrange / promise?",
          style: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(122,171,130,0.25)", background: "rgba(255,255,255,0.04)", color: "#d4e6ca", fontSize: "0.85rem", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 6, alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            onClick: save,
            disabled: busy || !body.trim(),
            style: { padding: "6px 14px", borderRadius: 5, border: "none", background: "#7dffaa", color: "#0d1a10", fontWeight: 800, fontSize: "0.78rem", cursor: busy || !body.trim() ? "not-allowed" : "pointer", opacity: busy || !body.trim() ? 0.5 : 1, fontFamily: "Inter, sans-serif" },
            children: busy ? "Saving\u2026" : "Save note"
          }
        ),
        msg && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: "0.78rem", color: msg.ok ? "#7dffaa" : "#ff8080" }, children: msg.text })
      ] })
    ] });
  }
  function SmsComposer({ email, phone, onSent }) {
    const [body, setBody] = (0, import_react6.useState)("");
    const [sending, setSending] = (0, import_react6.useState)(false);
    const [msg, setMsg] = (0, import_react6.useState)(null);
    async function send() {
      if (!body.trim()) return;
      setSending(true);
      setMsg(null);
      try {
        const r = await fetch("/api/admin/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerEmail: email, customerPhone: phone, body })
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          setBody("");
          setMsg("\u2713 Sent");
          setTimeout(() => {
            setMsg(null);
            onSent && onSent();
          }, 800);
        } else setMsg(d.error || "Failed");
      } catch (e) {
        setMsg(e.message);
      }
      setSending(false);
    }
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "textarea",
        {
          rows: 2,
          value: body,
          onChange: (e) => setBody(e.target.value),
          maxLength: 320,
          placeholder: `Text ${phone}\u2026`,
          style: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(122,171,130,0.25)", background: "rgba(255,255,255,0.04)", color: "#d4e6ca", fontSize: "0.85rem", fontFamily: "Inter, sans-serif", outline: "none", resize: "vertical", boxSizing: "border-box" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: "0.7rem", color: msg?.startsWith("\u2713") ? "#7dffaa" : msg ? "#ff8080" : "rgba(212,230,202,0.4)" }, children: msg || `${body.length}/320` }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            onClick: send,
            disabled: sending || !body.trim(),
            style: { padding: "7px 16px", borderRadius: 6, border: "none", cursor: sending || !body.trim() ? "not-allowed" : "pointer", background: sending || !body.trim() ? "rgba(125,255,170,0.2)" : "#7dffaa", color: "#0d1a10", fontWeight: 800, fontSize: "0.82rem", fontFamily: "Inter, sans-serif" },
            children: sending ? "Sending\u2026" : "Send SMS"
          }
        )
      ] })
    ] });
  }
  function ApptRow({ b, accent }) {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { padding: "9px 0", borderBottom: "1px solid rgba(122,171,130,0.07)" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: "0.83rem", fontWeight: 800, color: accent }, children: fmtDate(b.startTime) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.4)", whiteSpace: "nowrap" }, children: fmtTime(b.startTime) })
      ] }),
      b.title && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.75rem", color: "rgba(212,230,202,0.5)", marginTop: 2 }, children: b.title })
    ] });
  }
  function AppointmentHistoryPanel({ detail, onSchedule, scheduleBtn }) {
    const upcoming = detail.upcomingBookings?.length ? detail.upcomingBookings : detail.nextBooking ? [detail.nextBooking] : [];
    const past = detail.pastBookings || [];
    const lbl = { fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(212,230,202,0.35)", margin: "16px 0 6px" };
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { paddingTop: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { style: scheduleBtn, onClick: onSchedule, children: "+ Schedule appointment" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: lbl, children: [
        "Upcoming (",
        upcoming.length,
        ")"
      ] }),
      upcoming.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.3)" }, children: "None scheduled" }) : upcoming.map((b, i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ApptRow, { b, accent: "#c9a84c" }, b.id || i)),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: lbl, children: [
        "Past (",
        past.length,
        ")"
      ] }),
      past.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.3)" }, children: "No past visits" }) : past.map((b, i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ApptRow, { b, accent: "#7dffaa" }, b.id || i))
    ] });
  }
  function CustomerPanel({ customer, onClose }) {
    const router = useRouter();
    const [detail, setDetail] = (0, import_react6.useState)(null);
    const [loading, setLoading] = (0, import_react6.useState)(true);
    const [error, setError] = (0, import_react6.useState)(null);
    const [editing, setEditing] = (0, import_react6.useState)(false);
    const [tab, setTab] = (0, import_react6.useState)("details");
    const [editForm, setEditForm] = (0, import_react6.useState)({ name: "", phone: "", address: "", planType: "", systemType: "", trapCount: "", hasTimer: false });
    const [saving, setSaving] = (0, import_react6.useState)(false);
    const [cancelling, setCancelling] = (0, import_react6.useState)(false);
    const [apptDock, setApptDock] = (0, import_react6.useState)(null);
    async function openApptDock(eventId) {
      if (!eventId) return;
      setApptDock({ loading: true, details: null });
      try {
        const res = await fetch(`/api/admin/appointment-details?eventId=${encodeURIComponent(eventId)}`);
        const data = await res.json();
        setApptDock({ loading: false, details: res.ok ? data : { error: data.error || "Failed to load" } });
      } catch {
        setApptDock({ loading: false, details: { error: "Failed to load" } });
      }
    }
    const [messaging, setMessaging] = (0, import_react6.useState)(false);
    const [msgForm, setMsgForm] = (0, import_react6.useState)({ subject: "", body: "" });
    const [msgSending, setMsgSending] = (0, import_react6.useState)(false);
    const [msgResult, setMsgResult] = (0, import_react6.useState)(null);
    const fetchDetail = (0, import_react6.useCallback)(async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = customer.id ? `customerId=${customer.id}` : `email=${encodeURIComponent(customer.email)}`;
        const res = await fetch(`/api/admin/customer-detail?${qs}`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setDetail(data);
        setEditForm({ name: data.name, phone: data.phone, address: data.address, planType: data.planType || "", systemType: data.systemType || "", trapCount: data.trapCount || "", hasTimer: data.hasTimer || false });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, [customer.id, customer.email]);
    const [fetched, setFetched] = (0, import_react6.useState)(false);
    if (!fetched) {
      setFetched(true);
      fetchDetail();
    }
    async function saveEdit() {
      setSaving(true);
      await fetch("/api/admin/update-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, hubspotContactId: detail?.hubspotContactId, ...editForm })
      });
      setSaving(false);
      setEditing(false);
      fetchDetail();
    }
    async function handleCancel() {
      if (!detail?.nextBooking?.calBookingId) return;
      if (!window.confirm("Cancel this appointment?")) return;
      setCancelling(true);
      await fetch("/api/admin/cancel-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: detail.nextBooking.calBookingId })
      });
      setCancelling(false);
      fetchDetail();
    }
    function scheduleForCustomer() {
      const d = detail || customer;
      const params = new URLSearchParams({
        email: d.email || customer.email || "",
        name: d.name || customer.name || "",
        phone: d.phone || customer.phone || "",
        address: d.address || ""
      });
      router.push("/admin/booking?" + params.toString());
    }
    const panel = {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      width: 400,
      background: "#0d1a10",
      borderLeft: "1px solid rgba(122,171,130,0.2)",
      zIndex: 200,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      boxShadow: "-8px 0 32px rgba(0,0,0,0.4)"
    };
    const row = { padding: "14px 0", borderBottom: "1px solid rgba(122,171,130,0.08)" };
    const lbl = { fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(212,230,202,0.35)", marginBottom: 4 };
    const val = { fontSize: "0.88rem", fontWeight: 600, color: "#d4e6ca" };
    const input = {
      width: "100%",
      padding: "8px 10px",
      borderRadius: 6,
      boxSizing: "border-box",
      border: "1px solid rgba(122,171,130,0.3)",
      background: "rgba(255,255,255,0.04)",
      color: "#d4e6ca",
      fontSize: "0.85rem",
      fontFamily: "Inter, sans-serif",
      outline: "none"
    };
    const btn = (variant) => ({
      padding: "7px 14px",
      borderRadius: 4,
      border: "none",
      cursor: "pointer",
      fontWeight: 800,
      fontSize: "0.78rem",
      fontFamily: "Inter, sans-serif",
      ...variant === "gold" ? { background: "#c9a84c", color: "#0d1a10" } : variant === "green" ? { background: "#7dffaa", color: "#0d1a10" } : variant === "red" ? { background: "rgba(255,100,100,0.15)", color: "#ff8080", border: "1px solid rgba(255,100,100,0.25)" } : variant === "ghost" ? { background: "rgba(122,171,130,0.08)", color: "rgba(212,230,202,0.6)", border: "1px solid rgba(122,171,130,0.15)" } : { background: "rgba(122,171,130,0.12)", color: "#7aab82" }
    });
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: panel, className: "docked-panel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { padding: "20px 20px 16px", borderBottom: "1px solid rgba(122,171,130,0.15)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { flex: 1, minWidth: 0 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontWeight: 900, fontSize: "1.1rem", marginBottom: 2 }, children: customer.name || "Customer" }),
          detail?.systemType ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { fontSize: "0.8rem", fontWeight: 700, color: "#c9a84c", marginBottom: 4 }, children: [
            detail.systemType === "Biogents-CO2" ? "Biogents CO\u2082" : detail.systemType === "Biogents-NonCO2" ? "Biogents Non-CO\u2082" : "Mosqitter Grand",
            detail.trapCount ? ` \xB7 ${detail.trapCount} trap${detail.trapCount > 1 ? "s" : ""}` : "",
            detail.planType ? ` \xB7 ${detail.planType}` : ""
          ] }) : customer.plan ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.78rem", color: "rgba(212,230,202,0.4)", marginBottom: 4 }, children: customer.plan }) : null,
          (detail?.phone || customer.phone) && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("a", { href: `tel:${(detail?.phone || customer.phone).replace(/[^\d+]/g, "")}`, style: { fontSize: "0.85rem", fontWeight: 700, color: "#7dffaa", textDecoration: "none", display: "block", marginBottom: 4 }, children: [
            "\u{1F4DE} ",
            detail?.phone || customer.phone
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [
            customer.status && customer.status !== "inactive" && customer.status !== "canceled" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(StatusBadge, { status: customer.status }),
            detail?.nextBooking && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { fontSize: "0.7rem", color: "#7dffaa", fontWeight: 700 }, children: [
              "Next: ",
              fmtDate(detail.nextBooking.startTime)
            ] }),
            detail?.pastBookings?.[0] && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { fontSize: "0.7rem", color: "rgba(212,230,202,0.35)", fontWeight: 600 }, children: [
              "Last: ",
              fmtDate(detail.pastBookings[0].startTime)
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { onClick: onClose, style: { background: "none", border: "none", color: "rgba(212,230,202,0.4)", cursor: "pointer", fontSize: "1.3rem", lineHeight: 1, padding: 4, flexShrink: 0 }, children: "\xD7" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { padding: "12px 20px", borderBottom: "1px solid rgba(122,171,130,0.08)", display: "flex", gap: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { style: btn("gold"), onClick: scheduleForCustomer, children: "+ Schedule" }),
        !editing && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { style: btn("ghost"), onClick: () => setEditing(true), children: "Edit" }),
        editing && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { style: btn("green"), onClick: saveEdit, disabled: saving, children: saving ? "Saving\u2026" : "Save" }),
        editing && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { style: btn("ghost"), onClick: () => setEditing(false), children: "Cancel" }),
        customer.email && !messaging && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { style: btn("ghost"), onClick: () => {
          setMessaging(true);
          setMsgResult(null);
          setMsgForm({ subject: `Hi from ${"GreenGuard USA"}`, body: "" });
        }, children: "\u2709 Email" }),
        (customer.phone || detail?.phone) && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("a", { href: `sms:${(customer.phone || detail?.phone || "").replace(/[^\d+]/g, "")}`, style: { ...btn("ghost"), textDecoration: "none", display: "inline-flex", alignItems: "center" }, children: "\u{1F4AC} Text" })
      ] }),
      messaging && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { padding: "16px 20px", background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(122,171,130,0.08)" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.35)", marginBottom: 10 }, children: [
          "Email to ",
          customer.email
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            value: msgForm.subject,
            onChange: (e) => setMsgForm((f) => ({ ...f, subject: e.target.value })),
            placeholder: "Subject",
            style: { width: "100%", marginBottom: 8, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(122,171,130,0.2)", background: "rgba(0,0,0,0.25)", color: "#d4e6ca", fontFamily: "Inter, sans-serif", fontSize: "0.85rem", boxSizing: "border-box", outline: "none" }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "textarea",
          {
            value: msgForm.body,
            onChange: (e) => setMsgForm((f) => ({ ...f, body: e.target.value })),
            placeholder: `Hi ${customer.name?.split(" ")[0] || "there"},

`,
            rows: 5,
            style: { width: "100%", marginBottom: 8, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(122,171,130,0.2)", background: "rgba(0,0,0,0.25)", color: "#d4e6ca", fontFamily: "Inter, sans-serif", fontSize: "0.85rem", boxSizing: "border-box", outline: "none", resize: "vertical" }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "button",
            {
              disabled: msgSending || !msgForm.subject || !msgForm.body,
              onClick: async () => {
                setMsgSending(true);
                setMsgResult(null);
                try {
                  const res = await fetch("/api/admin/send-message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: customer.email, toName: customer.name, subject: msgForm.subject, body: msgForm.body }) });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error);
                  setMsgResult("sent");
                  setMsgForm({ subject: "", body: "" });
                  setTimeout(() => setMessaging(false), 1500);
                } catch (e) {
                  setMsgResult(e.message);
                } finally {
                  setMsgSending(false);
                }
              },
              style: { ...btn("green"), opacity: msgSending || !msgForm.subject || !msgForm.body ? 0.5 : 1, cursor: msgSending || !msgForm.subject || !msgForm.body ? "not-allowed" : "pointer" },
              children: msgSending ? "Sending\u2026" : "Send Email"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { style: btn("ghost"), onClick: () => setMessaging(false), children: "Cancel" }),
          msgResult === "sent" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: "0.8rem", color: "#7dffaa", fontWeight: 700 }, children: "\u2713 Sent" }),
          msgResult && msgResult !== "sent" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: "0.8rem", color: "#ff8080" }, children: msgResult })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { display: "flex", gap: 6, padding: "10px 20px 0" }, children: [{ k: "details", l: "Details" }, { k: "history", l: "History" }].map((t) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          onClick: () => setTab(t.k),
          style: {
            padding: "6px 16px",
            borderRadius: 4,
            border: "none",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: "0.76rem",
            fontFamily: "Inter, sans-serif",
            background: tab === t.k ? "#c9a84c" : "rgba(201,168,76,0.1)",
            color: tab === t.k ? "#0d1a10" : "rgba(201,168,76,0.7)"
          },
          children: t.l
        },
        t.k
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { padding: "0 20px 32px", flex: 1 }, children: [
        loading && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { color: "rgba(212,230,202,0.4)", marginTop: 24 }, children: "Loading\u2026" }),
        error && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { color: "#ff8080", marginTop: 24 }, children: error }),
        detail && !loading && tab === "history" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          AppointmentHistoryPanel,
          {
            detail,
            onSchedule: scheduleForCustomer,
            scheduleBtn: { ...btn("gold"), width: "100%", padding: "10px 14px", fontSize: "0.85rem" }
          }
        ),
        detail && !loading && tab === "details" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_jsx_runtime5.Fragment, { children: editing ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: row, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: lbl, children: "Edit Info" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { style: input, placeholder: "Full name", value: editForm.name, onChange: (e) => setEditForm((f) => ({ ...f, name: e.target.value })) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { style: input, placeholder: "Phone", value: editForm.phone, onChange: (e) => setEditForm((f) => ({ ...f, phone: e.target.value })) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { style: input, placeholder: "Address", value: editForm.address, onChange: (e) => setEditForm((f) => ({ ...f, address: e.target.value })) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("select", { style: input, value: editForm.planType, onChange: (e) => setEditForm((f) => ({ ...f, planType: e.target.value })), children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: "Plan type\u2026" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "rent", children: "Rent" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "own", children: "Own" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("select", { style: input, value: editForm.systemType, onChange: (e) => setEditForm((f) => ({ ...f, systemType: e.target.value })), children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: "System type\u2026" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "Biogents-CO2", children: "Biogents CO\u2082" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "Biogents-NonCO2", children: "Biogents Non-CO\u2082" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "Mosqitter-Grand", children: "Mosqitter Grand" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { style: input, type: "number", min: "1", placeholder: "Trap count", value: editForm.trapCount, onChange: (e) => setEditForm((f) => ({ ...f, trapCount: e.target.value })) }),
            editForm.systemType === "Biogents-CO2" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem", color: "rgba(212,230,202,0.7)", cursor: "pointer" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { type: "checkbox", checked: !!editForm.hasTimer, onChange: (e) => setEditForm((f) => ({ ...f, hasTimer: e.target.checked })) }),
              "Has Biogents Timer"
            ] })
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: row, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: lbl, children: "Contact" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }, children: [
              detail.phone && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("a", { href: `tel:${detail.phone.replace(/[^\d+]/g, "")}`, style: { fontSize: "0.92rem", fontWeight: 700, color: "#7dffaa", textDecoration: "none" }, children: [
                "\u{1F4DE} ",
                detail.phone
              ] }),
              detail.email && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("a", { href: `mailto:${detail.email}`, style: { fontSize: "0.82rem", color: "rgba(212,230,202,0.6)", textDecoration: "none", wordBreak: "break-all" }, children: [
                "\u2709 ",
                detail.email
              ] }),
              detail.address && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
                "a",
                {
                  href: `https://maps.apple.com/?daddr=${encodeURIComponent(detail.address)}`,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  style: { fontSize: "1rem", fontWeight: 700, color: "#d4e6ca", textDecoration: "none", lineHeight: 1.4 },
                  children: [
                    "\u{1F4CD} ",
                    detail.address
                  ]
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: row, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: lbl, children: "Notes" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NoteComposer, { email: detail.email, hsContactId: detail.hubspotContactId, onSaved: fetchDetail }),
            (() => {
              const adminNotes = (detail.notes || []).filter((n) => /^\[ADMIN-NOTE/.test(n.body || ""));
              if (adminNotes.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.78rem", color: "rgba(212,230,202,0.3)", marginTop: 10 }, children: "No notes yet" });
              return adminNotes.map((note) => {
                const body = (note.body || "").replace(/^\[ADMIN-NOTE[^\]]*\]\s*/, "");
                return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 8, padding: "10px 12px", background: "rgba(201,168,76,0.05)", borderRadius: 6, borderLeft: "2px solid rgba(201,168,76,0.45)" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.82rem", whiteSpace: "pre-wrap", color: "rgba(212,230,202,0.85)", lineHeight: 1.5 }, children: body }),
                  note.timestamp && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.66rem", color: "rgba(212,230,202,0.32)", marginTop: 5 }, children: new Date(note.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ2 }) })
                ] }, note.id);
              });
            })()
          ] }),
          detail.systemType && (() => {
            const img = getTrapImage(detail.systemType, detail.trapCount);
            const label = detail.systemType === "Biogents-CO2" ? "Biogents CO\u2082" : detail.systemType === "Biogents-NonCO2" ? "Biogents Non-CO\u2082" : "Mosqitter Grand";
            return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: row, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: lbl, children: "System" }),
              img && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("img", { src: img, alt: label, style: { width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 8, marginBottom: 6, border: "1px solid rgba(122,171,130,0.15)" } }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { fontSize: "0.82rem", color: "rgba(212,230,202,0.65)" }, children: [
                detail.planType && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { textTransform: "capitalize", marginRight: 8, color: "#c9a84c", fontWeight: 800 }, children: detail.planType }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontWeight: 700 }, children: label }),
                detail.trapCount ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { color: "rgba(212,230,202,0.4)", marginLeft: 6 }, children: [
                  "\xB7 ",
                  detail.trapCount,
                  " trap",
                  detail.trapCount > 1 ? "s" : ""
                ] }) : "",
                detail.hasTimer ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { color: "rgba(212,230,202,0.4)", marginLeft: 6 }, children: "\xB7 Timer" }) : ""
              ] })
            ] });
          })(),
          detail.subscription && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: row, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: lbl, children: "Plan" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { fontSize: "1rem", fontWeight: 900, color: "#c9a84c" }, children: [
              fmtAmt(detail.subscription.amount),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { fontSize: "0.75rem", fontWeight: 500, color: "rgba(212,230,202,0.4)", marginLeft: 4 }, children: [
                "/",
                detail.subscription.interval
              ] })
            ] }),
            detail.subscription.label && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.75rem", color: "rgba(212,230,202,0.35)", marginTop: 2 }, children: detail.subscription.label })
          ] }),
          detail.openInvoices?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: row, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...lbl, color: "#ffb060" }, children: "\u26A0 Outstanding Invoices" }),
            detail.openInvoices.map((inv) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, padding: "8px 10px", background: "rgba(255,160,80,0.06)", borderRadius: 6, border: "1px solid rgba(255,160,80,0.15)" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontWeight: 800, color: "#ffb060" }, children: fmtAmt(inv.amountDue) }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.35)", marginTop: 2 }, children: [
                  inv.number,
                  " \xB7 ",
                  fmtDateShort(inv.created)
                ] })
              ] }),
              inv.hostedUrl && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("a", { href: inv.hostedUrl, target: "_blank", rel: "noopener noreferrer", style: { fontSize: "0.72rem", padding: "5px 12px", borderRadius: 4, background: "#c9a84c", color: "#0d1a10", fontWeight: 800, textDecoration: "none" }, children: "Pay" })
            ] }, inv.id))
          ] }),
          detail.pastBookings?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: row, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: lbl, children: "Last Visit" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 4, padding: "10px 12px", background: "rgba(125,255,170,0.04)", borderRadius: 8, border: "1px solid rgba(125,255,170,0.1)" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontWeight: 800, fontSize: "0.92rem", color: "#7dffaa" }, children: fmtDate(detail.pastBookings[0].startTime) }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.78rem", color: "rgba(212,230,202,0.5)", marginTop: 2 }, children: detail.pastBookings[0].title }),
              detail.pastBookings[0].address && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.35)", marginTop: 2 }, children: detail.pastBookings[0].address })
            ] }),
            detail.pastBookings.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 8 }, children: detail.pastBookings.slice(1).map((b) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(122,171,130,0.07)" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.78rem", fontWeight: 700, color: "rgba(212,230,202,0.55)" }, children: fmtDate(b.startTime) }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.74rem", color: "rgba(212,230,202,0.35)", textAlign: "right", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: b.title })
            ] }, b.id)) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: row, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: lbl, children: "Next Appointment" }),
            detail.nextBooking ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
              "div",
              {
                onClick: () => openApptDock(detail.nextBooking.id),
                style: { marginTop: 4, padding: "10px 12px", background: "rgba(201,168,76,0.06)", borderRadius: 8, border: "1px solid rgba(201,168,76,0.2)", cursor: detail.nextBooking.id ? "pointer" : "default" },
                title: detail.nextBooking.id ? "Click to view appointment details" : void 0,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontWeight: 800, fontSize: "0.92rem", color: "#c9a84c" }, children: fmtDate(detail.nextBooking.startTime) }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.78rem", color: "rgba(212,230,202,0.5)", marginTop: 2 }, children: detail.nextBooking.title }),
                  detail.nextBooking.address && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.35)", marginTop: 2 }, children: detail.nextBooking.address }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 10 }, children: [
                    detail.nextBooking.calBookingId && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { style: btn("red"), onClick: handleCancel, disabled: cancelling, children: cancelling ? "Cancelling\u2026" : "Cancel" }),
                    detail.nextBooking.calBookingUid && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("a", { href: `https://cal.com/reschedule/${detail.nextBooking.calBookingUid}`, target: "_blank", rel: "noopener noreferrer", style: { ...btn("ghost"), textDecoration: "none", display: "inline-block" }, children: "Reschedule" })
                  ] })
                ]
              }
            ) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.85rem", color: "rgba(212,230,202,0.3)", marginTop: 4 }, children: "None scheduled" })
          ] }),
          (detail.phone || customer.phone) && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: row, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: lbl, children: "Send SMS" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SmsComposer, { email: detail.email || customer.email, phone: detail.phone || customer.phone, onSent: fetchDetail })
          ] }),
          (detail.notes || []).some((n) => /^\[SMS-(IN|OUT)/.test(n.body || "")) && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...row, borderBottom: "none" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: lbl, children: "SMS history" }),
            detail.notes.filter((n) => /^\[SMS-(IN|OUT)/.test(n.body || "")).map((note) => {
              const body = note.body || "";
              const isSmsIn = body.startsWith("[SMS-IN");
              const tag = isSmsIn ? "\u2190 Inbound" : "\u2192 Outbound";
              const bg = isSmsIn ? "rgba(91,196,255,0.06)" : "rgba(125,255,170,0.05)";
              const bord = isSmsIn ? "rgba(91,196,255,0.35)" : "rgba(125,255,170,0.35)";
              return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 8, padding: "10px 12px", background: bg, borderRadius: 6, borderLeft: `2px solid ${bord}` }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: isSmsIn ? "#5bc4ff" : "#7dffaa", marginBottom: 4 }, children: tag }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.8rem", whiteSpace: "pre-wrap", color: "rgba(212,230,202,0.75)", lineHeight: 1.5 }, children: body.replace(/^\[SMS-(IN|OUT)[^\]]*\]\s*(\([^)]*\)\s*)?(by [^\n]*:\s*)?/, "").replace(/^From[^\n]*\n/, "") }),
                note.timestamp && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "0.66rem", color: "rgba(212,230,202,0.28)", marginTop: 5 }, children: new Date(note.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ2 }) })
              ] }, note.id);
            })
          ] })
        ] }) })
      ] }),
      apptDock && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "div",
          {
            style: { position: "fixed", inset: 0, zIndex: 299 },
            onClick: () => setApptDock(null)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          DetailDock,
          {
            details: apptDock.details,
            loading: apptDock.loading,
            onClose: () => setApptDock(null)
          }
        )
      ] })
    ] });
  }
  var NAV_LINKS = [
    { href: "/dashboard", label: "My Account" },
    { href: "/dashboard/history", label: "History" },
    { href: "/dashboard/settings", label: "Settings" }
  ];
  var ADMIN_NAV_LINKS = [
    { href: "/admin/home", label: "Home" },
    { href: "/admin/calendar", label: "Calendar" },
    { href: "/admin/clients", label: "Clients" },
    { href: "/admin/rounds", label: "Rounds" },
    { href: "/admin/inventory", label: "Inventory" },
    { href: "/admin/quote", label: "Quote" },
    { href: "/admin/invoice", label: "Invoice" }
  ];
  function PortalLayout({ children, title, isAdmin = false, topPadding, logoHref }) {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = (0, import_react7.useState)(false);
    (0, import_react7.useEffect)(() => setMenuOpen(false), [router.pathname]);
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { minHeight: "100vh", display: "flex", flexDirection: "column" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("nav", { style: {
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "linear-gradient(180deg, rgba(var(--green-rgb),0.06), rgba(13,26,16,0.88))",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "0 1px 0 rgba(var(--gold-rgb),0.06), var(--shadow-sm)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "max(20px, env(safe-area-inset-left))",
        paddingRight: "max(20px, env(safe-area-inset-right))"
      }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: {
        maxWidth: 1100,
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 76,
        position: "relative"
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Link, { href: logoHref || (isAdmin ? "/admin/home" : "/dashboard"), style: { textDecoration: "none", lineHeight: 1.15, flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { display: "block", fontWeight: 900, fontSize: "1.32rem", letterSpacing: "-0.02em", whiteSpace: "nowrap" }, children: "GreenGuard USA" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { display: "block", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }, children: "Smart \xB7 Safe \xB7 Effective" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "button",
          {
            className: "hamburger",
            onClick: () => setMenuOpen((o) => !o),
            "aria-label": "Open navigation",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", {}),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", {}),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", {})
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "nav-links" + (menuOpen ? " open" : ""), style: { overflowX: "auto", WebkitOverflowScrolling: "touch", gap: 6, minWidth: 0 }, children: [
          !isAdmin && NAV_LINKS.map(({ href, label }) => {
            const active = router.pathname === href;
            return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Link, { href, style: { fontSize: "1.05rem", fontWeight: active ? 800 : 700, padding: "9px 16px", borderRadius: "var(--radius-sm)", whiteSpace: "nowrap", flexShrink: 0, transition: "background 0.15s var(--ease), color 0.15s var(--ease)", color: active ? "var(--green)" : "var(--text)", background: active ? "rgba(var(--green-rgb),0.12)" : "transparent", boxShadow: active ? "inset 0 0 0 1px rgba(var(--green-rgb),0.28)" : "none" }, children: label }, href);
          }),
          isAdmin && ADMIN_NAV_LINKS.map(({ href, label }) => {
            const active = router.pathname === href;
            return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Link, { href, style: { fontSize: "1.05rem", fontWeight: active ? 800 : 700, padding: "9px 14px", borderRadius: "var(--radius-sm)", whiteSpace: "nowrap", flexShrink: 0, transition: "background 0.15s var(--ease), color 0.15s var(--ease)", color: active ? "var(--gold)" : "rgba(var(--gold-rgb),0.82)", background: active ? "rgba(var(--gold-rgb),0.13)" : "transparent", boxShadow: active ? "inset 0 0 0 1px rgba(var(--gold-rgb),0.30)" : "none" }, children: label }, href);
          }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: "nav-signout",
              onClick: async () => {
                try {
                  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
                } catch {
                }
                window.location.href = "/login";
              },
              style: { fontSize: "1.05rem", fontWeight: 700, padding: "9px 18px", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.2, background: "transparent", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.15s var(--ease), color 0.15s var(--ease)" },
              children: "Sign out"
            }
          )
        ] })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("main", { className: isAdmin ? "admin-main" : "", style: {
        flex: 1,
        maxWidth: 1100,
        margin: "0 auto",
        width: "100%",
        paddingTop: topPadding ?? "40px",
        paddingBottom: topPadding ?? "40px",
        paddingLeft: "max(20px, env(safe-area-inset-left))",
        paddingRight: "max(20px, env(safe-area-inset-right))"
      }, children: [
        title && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h1", { style: { fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 900, letterSpacing: "-0.02em", marginBottom: 32 }, children: title }),
        children
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("footer", { style: {
        borderTop: "1px solid var(--border)",
        padding: "20px 24px",
        textAlign: "center",
        fontSize: "0.78rem",
        color: "var(--text-dim)"
      }, children: [
        "\xA9 ",
        (/* @__PURE__ */ new Date()).getFullYear(),
        " ",
        "GreenGuard USA",
        " \xB7 ",
        "Austin, TX"
      ] }),
      isAdmin && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(AdminChat, {}),
      isAdmin && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(AdminBottomDock, { pathname: router.pathname })
    ] });
  }
  var DOCK_ITEMS = [
    { href: "/admin/inventory", label: "Inventory", icon: "\u{1F4E6}" },
    { href: "/admin/calendar", label: "Calendar", icon: "\u{1F4C5}" },
    { href: "/admin/clients", label: "Clients", icon: "\u{1F465}" },
    { href: "/admin/rounds", label: "Rounds", icon: "\u{1F690}" },
    { href: "/admin/quote", label: "Quote", icon: "\u{1F4DD}" }
  ];
  function AdminBottomDock({ pathname }) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("nav", { className: "admin-dock", "aria-label": "Admin quick access", style: {
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 90,
      background: "linear-gradient(180deg, rgba(13,26,16,0.92), var(--bg-deep))",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      borderTop: "1px solid rgba(var(--gold-rgb),0.28)",
      display: "flex",
      justifyContent: "space-around",
      alignItems: "stretch",
      padding: "8px 8px env(safe-area-inset-bottom, 8px)",
      boxShadow: "0 -6px 20px rgba(0,0,0,0.30)"
    }, children: DOCK_ITEMS.map(({ href, label, icon }) => {
      const active = pathname === href;
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Link, { href, style: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        padding: "8px 4px",
        borderRadius: "var(--radius-sm)",
        textDecoration: "none",
        minWidth: 0,
        color: active ? "var(--gold)" : "rgba(var(--text-rgb),0.62)",
        background: active ? "rgba(var(--gold-rgb),0.12)" : "transparent",
        boxShadow: active ? "inset 0 0 0 1px rgba(var(--gold-rgb),0.30)" : "none",
        fontWeight: active ? 800 : 700,
        transition: "background 0.15s var(--ease), color 0.15s var(--ease)"
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontSize: "1.2rem", lineHeight: 1 }, children: icon }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontSize: "0.72rem", letterSpacing: "0.03em" }, children: label })
      ] }, href);
    }) });
  }
  function SignaturePad({ onSave, onCancel, label = "Customer signature" }) {
    const canvasRef = (0, import_react8.useRef)(null);
    const drawingRef = (0, import_react8.useRef)(false);
    const lastRef = (0, import_react8.useRef)({ x: 0, y: 0 });
    const [hasInk, setHasInk] = (0, import_react8.useState)(false);
    (0, import_react8.useEffect)(() => {
      const c = canvasRef.current;
      if (!c) return;
      const ratio = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      c.width = rect.width * ratio;
      c.height = rect.height * ratio;
      const ctx = c.getContext("2d");
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0d1a10";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }, []);
    function pos(e) {
      const c = canvasRef.current;
      const r = c.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    }
    function start(e) {
      e.preventDefault();
      drawingRef.current = true;
      lastRef.current = pos(e);
      setHasInk(true);
    }
    function move(e) {
      if (!drawingRef.current) return;
      e.preventDefault();
      const ctx = canvasRef.current.getContext("2d");
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(lastRef.current.x, lastRef.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastRef.current = p;
    }
    function end() {
      drawingRef.current = false;
    }
    function clear() {
      const c = canvasRef.current;
      const ctx = c.getContext("2d");
      const r = c.getBoundingClientRect();
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, r.width, r.height);
      setHasInk(false);
    }
    function save() {
      if (!hasInk) return;
      const url = canvasRef.current.toDataURL("image/png");
      onSave?.(url);
    }
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { background: "#0d1a10", border: "1px solid rgba(122,171,130,0.25)", borderRadius: 10, padding: 14, color: "#d4e6ca" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { style: { fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(212,230,202,0.5)", marginBottom: 8 }, children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "canvas",
        {
          ref: canvasRef,
          style: { display: "block", width: "100%", height: 160, background: "#fff", borderRadius: 6, touchAction: "none", cursor: "crosshair" },
          onMouseDown: start,
          onMouseMove: move,
          onMouseUp: end,
          onMouseLeave: end,
          onTouchStart: start,
          onTouchMove: move,
          onTouchEnd: end
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { style: { fontSize: "0.7rem", color: "rgba(212,230,202,0.4)", margin: "8px 0 12px" }, children: "Sign with finger or stylus to acknowledge service was completed." }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            onClick: clear,
            type: "button",
            style: { flex: "1 1 70px", padding: "9px 12px", borderRadius: 6, border: "1px solid rgba(212,230,202,0.2)", background: "transparent", color: "rgba(212,230,202,0.7)", cursor: "pointer", fontWeight: 700, fontFamily: "Inter, sans-serif" },
            children: "Clear"
          }
        ),
        onCancel && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            onClick: onCancel,
            type: "button",
            style: { flex: "1 1 70px", padding: "9px 12px", borderRadius: 6, border: "1px solid rgba(255,100,100,0.3)", background: "transparent", color: "#ff8080", cursor: "pointer", fontWeight: 700, fontFamily: "Inter, sans-serif" },
            children: "Skip"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            onClick: save,
            type: "button",
            disabled: !hasInk,
            style: { flex: "2 1 140px", padding: "9px 12px", borderRadius: 6, border: "none", background: hasInk ? "#7dffaa" : "rgba(125,255,170,0.2)", color: "#0d1a10", cursor: hasInk ? "pointer" : "not-allowed", fontWeight: 900, fontFamily: "Inter, sans-serif" },
            children: "Save signature"
          }
        )
      ] })
    ] });
  }
  var TZ3 = "America/Chicago";
  function fmtTime2(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ3 });
    } catch {
      return "";
    }
  }
  var actionBtn = {
    flex: "1 1 70px",
    padding: "7px 6px",
    borderRadius: 6,
    justifyContent: "center",
    fontSize: "0.9rem",
    fontWeight: 700,
    textDecoration: "none",
    minHeight: 34,
    display: "inline-flex",
    alignItems: "center",
    fontFamily: "inherit",
    boxSizing: "border-box",
    cursor: "pointer"
  };
  var disabledBtn = {
    ...actionBtn,
    border: "1px solid rgba(122,171,130,0.12)",
    color: "rgba(212,230,202,0.3)",
    background: "transparent",
    cursor: "not-allowed",
    opacity: 0.6
  };
  function StopCard({
    stop,
    number,
    done = false,
    active = false,
    cancelled = false,
    distance,
    onOpenProfile,
    checkIn,
    checkOut,
    headerExtras = null,
    actions = null,
    children = null
  }) {
    const [showPanel, setShowPanel] = (0, import_react9.useState)(false);
    const [eventNotes, setEventNotes] = (0, import_react9.useState)([]);
    const name = stop.customerName || stop.title || "Service Visit";
    (0, import_react9.useEffect)(() => {
      if (!stop.gcalEventId) return;
      fetch(`/api/admin/event-notes?eventId=${encodeURIComponent(stop.gcalEventId)}`).then((r) => r.json()).then((d) => setEventNotes(d.notes || [])).catch(() => {
      });
    }, [stop.gcalEventId]);
    function openProfile() {
      if (!stop.email) return;
      if (onOpenProfile) onOpenProfile({ email: stop.email, name, phone: stop.phone });
      else setShowPanel(true);
    }
    const accent = done ? "125,255,170" : active ? "201,168,76" : "122,171,130";
    const card = {
      background: "var(--bg-card)",
      backgroundImage: "var(--surface-grad)",
      border: `1px solid rgba(${accent}, ${done || active ? 0.32 : 0.16})`,
      borderLeft: `3px solid rgba(${accent}, ${done || active ? 0.7 : 0.4})`,
      borderRadius: "var(--radius)",
      padding: 20,
      marginBottom: 14,
      boxShadow: "var(--shadow-sm)",
      opacity: cancelled ? 0.45 : done ? 0.7 : 1
    };
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
      showPanel && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 199 }, onClick: () => setShowPanel(false) }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(CustomerPanel, { customer: { email: stop.email, name, phone: stop.phone }, onClose: () => setShowPanel(false) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { marginBottom: actions || children ? 12 : 0 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 3, flexWrap: "wrap" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", fontWeight: 900, fontSize: "0.78rem", background: done ? "rgba(125,255,170,0.15)" : active ? "rgba(201,168,76,0.15)" : "rgba(122,171,130,0.1)", color: done ? "#7dffaa" : active ? "#c9a84c" : "rgba(212,230,202,0.5)", flexShrink: 0 }, children: done ? "\u2713" : number }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              "button",
              {
                style: { fontWeight: 900, fontSize: "1rem", color: stop.firstAppointment || /assessment/i.test(stop.serviceType || "") ? "#7dffaa" : "#d4e6ca", background: "none", border: "none", borderBottom: "1px solid rgba(212,230,202,0.2)", padding: 0, cursor: stop.email ? "pointer" : "default", flexShrink: 0, fontFamily: "inherit" },
                onClick: (e) => {
                  e.stopPropagation();
                  openProfile();
                },
                children: name
              }
            ),
            stop.address && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { style: { fontSize: "0.82rem", color: "rgba(212,230,202,0.5)", fontWeight: 400 }, children: [
              "\u{1F4CD} ",
              stop.address
            ] }),
            distance && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { style: { fontWeight: 800, fontSize: "0.88rem", color: parseFloat(distance.miles) <= 5 ? "#7dffaa" : parseFloat(distance.miles) <= 15 ? "#c9a84c" : "rgba(212,230,202,0.45)", whiteSpace: "nowrap" }, children: [
              distance.miles,
              " mi \xB7 ",
              distance.duration
            ] }),
            headerExtras
          ] }),
          eventNotes.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { paddingLeft: 36, marginTop: 4, marginBottom: 2 }, children: eventNotes.map((n) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { fontSize: "0.82rem", color: "#7dffaa", lineHeight: 1.5 }, children: [
            "\u{1F4CB} ",
            n.body
          ] }, n.id)) }),
          (stop.clientNotes || []).map((note, i) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { paddingLeft: 36, fontSize: "0.82rem", color: "rgba(212,230,202,0.75)", lineHeight: 1.5 }, children: note }, i)),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { paddingLeft: 36, display: "flex", flexWrap: "wrap", gap: "3px 12px", fontSize: "0.9rem", marginTop: 4, marginBottom: 2 }, children: [
            stop.startTime && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { style: { color: "#c9a84c", fontWeight: 700 }, children: [
              new Date(stop.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ3 }),
              " \xB7 ",
              fmtTime2(stop.startTime),
              stop.endTime ? ` \u2013 ${fmtTime2(stop.endTime)}` : ""
            ] }),
            stop.serviceType && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: { color: "rgba(212,230,202,0.55)" }, children: stop.serviceType }),
            stop.tanks > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { style: { color: "#7dffaa", fontWeight: 700 }, children: [
              "\u{1FAD9} ",
              stop.tanks,
              " tank",
              stop.tanks > 1 ? "s" : ""
            ] })
          ] }),
          (checkIn || checkOut) && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { paddingLeft: 36, marginBottom: 4, fontSize: "0.75rem", color: "rgba(212,230,202,0.4)", display: "flex", gap: 14 }, children: [
            checkIn && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
              "In: ",
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("strong", { children: checkIn })
            ] }),
            checkOut && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
              "Out: ",
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("strong", { style: { color: "#7dffaa" }, children: checkOut })
            ] })
          ] }),
          actions && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }, children: actions })
        ] }),
        children
      ] })
    ] });
  }
  function TankCalendar({ tankCalendar = {}, scheduleByDate = {}, onDayClick = () => {
  }, today, currentStock = 0, expectedDelivery = 0 }) {
    const [viewDate, setViewDate] = (0, import_react10.useState)(/* @__PURE__ */ new Date());
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const forecastMap = {};
    let runningStock = currentStock;
    const todayObj = /* @__PURE__ */ new Date((today || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) + "T12:00:00");
    for (let d = 0; d < 60; d++) {
      const dt = new Date(todayObj.getTime() + d * 86400 * 1e3);
      const ds = dt.toLocaleDateString("en-CA");
      const isWed = dt.getDay() === 3;
      const dayData = scheduleByDate[ds] || { tanks: 0, appts: 0 };
      if (isWed && d > 0) runningStock += expectedDelivery;
      runningStock -= dayData.tanks;
      forecastMap[ds] = { tanks: dayData.tanks, appts: dayData.appts, forecast: runningStock };
    }
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ d, dateStr, log: tankCalendar[dateStr] || null, sched: forecastMap[dateStr] || null });
    }
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "button",
          {
            onClick: () => setViewDate(new Date(year, month - 1, 1)),
            style: { background: "none", border: "none", color: "rgba(212,230,202,0.6)", cursor: "pointer", fontSize: "1.2rem", fontFamily: "Inter, sans-serif" },
            children: "\u2039"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: { fontWeight: 800, fontSize: "0.9rem" }, children: monthLabel }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "button",
          {
            onClick: () => setViewDate(new Date(year, month + 1, 1)),
            style: { background: "none", border: "none", color: "rgba(212,230,202,0.6)", cursor: "pointer", fontSize: "1.2rem", fontFamily: "Inter, sans-serif" },
            children: "\u203A"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3, marginBottom: 3 }, children: dayLabels.map((l) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { textAlign: "center", fontSize: "0.62rem", fontWeight: 800, color: "rgba(212,230,202,0.35)", letterSpacing: "0.04em", padding: "4px 0" }, children: l }, l)) }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 }, children: cells.map((cell, i) => {
        if (!cell) return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", {}, `e${i}`);
        const { d, dateStr, log, sched } = cell;
        const isToday = dateStr === today;
        const tanks = sched?.tanks || 0;
        const appts = sched?.appts || 0;
        const forecast = sched?.forecast;
        const hasLog = !!log;
        const deficit = forecast != null && tanks > 0 && forecast < 0;
        let bg = "linear-gradient(165deg, rgba(125,255,170,0.05), rgba(201,168,76,0.022))";
        let border = "rgba(122,171,130,0.12)";
        if (tanks > 0) {
          if (deficit) {
            bg = "rgba(255,100,100,0.1)";
            border = "rgba(255,100,100,0.3)";
          } else {
            bg = "rgba(125,255,170,0.06)";
            border = "rgba(125,255,170,0.2)";
          }
        }
        if (hasLog) {
          bg = "rgba(201,168,76,0.07)";
          border = "rgba(201,168,76,0.3)";
        }
        if (isToday) border = "#c9a84c";
        return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "div",
          {
            onClick: () => onDayClick(dateStr, log, tanks),
            style: { borderRadius: 6, border: `1px solid ${border}`, background: bg, padding: "6px 3px", cursor: "pointer", minHeight: 72, minWidth: 0, overflow: "hidden" },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { fontSize: "0.78rem", fontWeight: isToday ? 900 : 600, color: isToday ? "#c9a84c" : "rgba(212,230,202,0.75)", marginBottom: 2, textAlign: "center" }, children: d }),
              tanks > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { fontSize: "0.7rem", fontWeight: 800, color: deficit ? "#ff8080" : "#7dffaa", textAlign: "center", lineHeight: 1.15 }, children: [
                tanks,
                "t"
              ] }),
              appts > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { fontSize: "0.62rem", color: "rgba(212,230,202,0.5)", textAlign: "center", lineHeight: 1.15 }, children: [
                appts,
                "v"
              ] }),
              hasLog && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { fontSize: "0.62rem", color: "#c9a84c", fontWeight: 700, marginTop: 2, textAlign: "center" }, children: "\u2713" })
            ]
          },
          dateStr
        );
      }) }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { display: "flex", gap: 12, marginTop: 10, fontSize: "0.68rem", color: "rgba(212,230,202,0.45)", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: { width: 9, height: 9, borderRadius: 2, background: "rgba(125,255,170,0.15)", border: "1px solid rgba(125,255,170,0.25)", display: "inline-block" } }),
          " On track"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: { width: 9, height: 9, borderRadius: 2, background: "rgba(255,100,100,0.15)", border: "1px solid rgba(255,100,100,0.3)", display: "inline-block" } }),
          " Deficit"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: { width: 9, height: 9, borderRadius: 2, background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)", display: "inline-block" } }),
          " Logged"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: { color: "rgba(212,230,202,0.3)" }, children: "t = tanks \xB7 v = visits" })
      ] })
    ] });
  }
  return __toCommonJS(portal_entry_exports);
})();
window.GreenGuardPortal=GreenGuardPortal.__dsMainNs?Object.assign({},GreenGuardPortal,GreenGuardPortal.__dsMainNs,{__dsMainNs:undefined}):GreenGuardPortal;
