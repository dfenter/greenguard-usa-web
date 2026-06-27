import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import Link from "next/link";
const TZ = "America/Chicago";
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
  return /* @__PURE__ */ jsxs("div", { style: { padding: "9px 0", borderBottom: "1px solid rgba(122,171,130,0.07)" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: "0.83rem", fontWeight: 800, color: accent }, children: fmtDockDate(b.start) }),
      /* @__PURE__ */ jsx("span", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.4)", whiteSpace: "nowrap" }, children: fmtDockTime(b.start) })
    ] }),
    b.summary && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.75rem", color: "rgba(212,230,202,0.5)", marginTop: 2 }, children: b.summary.replace(/\s*\(GreenGuard USA\)\s*$/, "") })
  ] });
}
function CalAppointmentHistory({ d, scheduleHref }) {
  const upcoming = d.upcomingBookings || (d.next ? [d.next] : []);
  const past = d.pastBookings || (d.last ? [d.last] : []);
  const lbl = { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", margin: "16px 0 6px" };
  return /* @__PURE__ */ jsxs("div", { style: { paddingTop: 4 }, children: [
    /* @__PURE__ */ jsx(
      Link,
      {
        href: scheduleHref,
        style: { display: "block", textAlign: "center", padding: "10px 14px", borderRadius: 6, background: "#c9a84c", color: "#0d1a10", fontWeight: 900, fontSize: "0.85rem", textDecoration: "none" },
        children: "+ Schedule appointment"
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: lbl, children: [
      "Upcoming (",
      upcoming.length,
      ")"
    ] }),
    upcoming.length === 0 ? /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.3)" }, children: "None scheduled" }) : upcoming.map((b, i) => /* @__PURE__ */ jsx(CalApptRow, { b, accent: "#c9a84c" }, b.id || i)),
    /* @__PURE__ */ jsxs("div", { style: lbl, children: [
      "Past (",
      past.length,
      ")"
    ] }),
    past.length === 0 ? /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.3)" }, children: "No past visits" }) : past.map((b, i) => /* @__PURE__ */ jsx(CalApptRow, { b, accent: "#7dffaa" }, b.id || i))
  ] });
}
function EventNotesSection({ eventId, customerEmail }) {
  const [notes, setNotes] = useState([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function load() {
    try {
      const res = await fetch(`/api/admin/event-notes?eventId=${encodeURIComponent(eventId)}`);
      const j = await res.json();
      if (res.ok) setNotes(j.notes || []);
    } catch {
    }
  }
  useEffect(() => {
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
  return /* @__PURE__ */ jsxs("div", { style: { marginBottom: 14, padding: 12, background: "rgba(125,255,170,0.04)", border: "1px solid rgba(125,255,170,0.18)", borderRadius: 6 }, children: [
    /* @__PURE__ */ jsx("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7dffaa", marginBottom: 8 }, children: "This appointment's notes" }),
    notes.length > 0 && /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }, children: notes.map((n) => /* @__PURE__ */ jsxs("div", { style: { padding: "7px 10px", background: "rgba(0,0,0,0.2)", borderRadius: 4, fontSize: "0.78rem", color: "rgba(212,230,202,0.85)", position: "relative" }, children: [
      /* @__PURE__ */ jsx("div", { style: { whiteSpace: "pre-wrap", lineHeight: 1.4 }, children: n.body }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }, children: [
        /* @__PURE__ */ jsxs("span", { style: { fontSize: "0.66rem", color: "rgba(212,230,202,0.4)" }, children: [
          n.author_email?.split("@")[0],
          " \xB7 ",
          new Date(n.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ })
        ] }),
        /* @__PURE__ */ jsx(
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
    /* @__PURE__ */ jsx(
      "textarea",
      {
        rows: 2,
        value: body,
        onChange: (e) => setBody(e.target.value),
        placeholder: "Gate code today, side gate only, customer requested AM\u2026",
        style: { width: "100%", padding: "7px 9px", borderRadius: 5, border: "1px solid rgba(122,171,130,0.25)", background: "rgba(255,255,255,0.04)", color: "#d4e6ca", fontSize: "0.82rem", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, marginTop: 6, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: save,
          disabled: busy || !body.trim(),
          style: { padding: "5px 12px", borderRadius: 4, border: "none", background: "#7dffaa", color: "#0d1a10", fontWeight: 800, fontSize: "0.76rem", cursor: busy || !body.trim() ? "not-allowed" : "pointer", opacity: busy || !body.trim() ? 0.5 : 1, fontFamily: "Inter, sans-serif" },
          children: busy ? "Saving\u2026" : "Add"
        }
      ),
      msg && /* @__PURE__ */ jsx("span", { style: { fontSize: "0.74rem", color: msg.ok ? "#7dffaa" : "#ff8080" }, children: msg.text })
    ] })
  ] });
}
function DockNoteComposer({ email, hsContactId }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
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
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(
      "textarea",
      {
        rows: 2,
        value: body,
        onChange: (e) => setBody(e.target.value),
        placeholder: "Add a note to this customer's HubSpot timeline\u2026",
        style: { width: "100%", padding: "7px 9px", borderRadius: 5, border: "1px solid rgba(122,171,130,0.25)", background: "rgba(255,255,255,0.04)", color: "#d4e6ca", fontSize: "0.82rem", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, marginTop: 6, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: save,
          disabled: busy || !body.trim(),
          style: { padding: "5px 12px", borderRadius: 4, border: "none", background: "#7dffaa", color: "#0d1a10", fontWeight: 800, fontSize: "0.76rem", cursor: busy || !body.trim() ? "not-allowed" : "pointer", opacity: busy || !body.trim() ? 0.5 : 1, fontFamily: "Inter, sans-serif" },
          children: busy ? "Saving\u2026" : "Save"
        }
      ),
      msg && /* @__PURE__ */ jsx("span", { style: { fontSize: "0.74rem", color: msg.ok ? "#7dffaa" : "#ff8080" }, children: msg.text })
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
  const [tab, setTab] = useState("details");
  const scheduleHref = "/admin/booking?" + new URLSearchParams({ email: email || "", name: customerName || "", phone: phone || "", address: address || "" }).toString();
  return /* @__PURE__ */ jsxs("div", { style: {
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
    /* @__PURE__ */ jsxs("div", { style: { padding: "14px 18px", borderBottom: "1px solid rgba(122,171,130,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#0d1a10", zIndex: 1 }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(212,230,202,0.45)" }, children: "Appointment Details" }),
      /* @__PURE__ */ jsx("button", { onClick: onClose, style: { background: "none", border: "none", color: "rgba(212,230,202,0.5)", cursor: "pointer", fontSize: "1.4rem", lineHeight: 1, padding: 0 }, children: "\xD7" })
    ] }),
    loading && /* @__PURE__ */ jsx("div", { style: { padding: 20, color: "rgba(212,230,202,0.5)", fontSize: "0.85rem" }, children: "Loading\u2026" }),
    !loading && d.error && /* @__PURE__ */ jsx("div", { style: { padding: 20, color: "#ff8080", fontSize: "0.85rem" }, children: d.error }),
    !loading && !d.error && /* @__PURE__ */ jsxs("div", { style: { padding: "14px 18px" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 2 }, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: "1.1rem", fontWeight: 900 }, children: customerName }),
          billingContact && /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.7rem", color: "#c9a84c", fontWeight: 700, background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", padding: "2px 8px", borderRadius: 4, display: "inline-block", marginTop: 4 }, children: [
            "Bill to: ",
            billingContact
          ] })
        ] }),
        (address || phone) && /* @__PURE__ */ jsxs("div", { style: { textAlign: "right", flexShrink: 0, maxWidth: "55%" }, children: [
          address && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.78rem", marginBottom: 2 }, children: /* @__PURE__ */ jsxs("a", { href: `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`, target: "_blank", rel: "noopener noreferrer", style: { color: "#7dffaa", textDecoration: "none" }, children: [
            "\u{1F4CD} ",
            address
          ] }) }),
          phone && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.78rem" }, children: /* @__PURE__ */ jsxs("a", { href: `tel:${phone}`, style: { color: "#7dffaa", textDecoration: "none" }, children: [
            "\u{1F4DE} ",
            phone
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6, margin: "12px 0 4px" }, children: [{ k: "details", l: "Details" }, { k: "history", l: "History" }].map((t) => /* @__PURE__ */ jsx(
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
      tab === "history" && /* @__PURE__ */ jsx(CalAppointmentHistory, { d, scheduleHref }),
      tab === "details" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { style: { marginTop: 10, marginBottom: 14, padding: "10px 12px", background: "rgba(125,255,170,0.05)", border: "1px solid rgba(125,255,170,0.15)", borderRadius: 6 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", fontWeight: 700, marginBottom: 4 }, children: ev.summary?.replace(/\s*\(GreenGuard USA\)\s*$/, "") || "\u2014" }),
          /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.78rem", color: "#7dffaa", fontWeight: 700 }, children: [
            fmtDockDate(ev.start),
            " \xB7 ",
            fmtDockTime(ev.start),
            ev.end ? ` \u2013 ${fmtDockTime(ev.end)}` : ""
          ] })
        ] }),
        email && /* @__PURE__ */ jsxs("div", { style: { marginBottom: 14 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 6 }, children: "Customer" }),
          /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.85rem", marginBottom: 3 }, children: [
            "\u2709 ",
            /* @__PURE__ */ jsx("a", { href: `mailto:${email}`, style: { color: "#7dffaa", textDecoration: "none" }, children: email })
          ] })
        ] }),
        (p.system_type || p.trap_count || p.tank_count || p.recurring_addons) && /* @__PURE__ */ jsxs("div", { style: { marginBottom: 14 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 6 }, children: "Service Profile" }),
          /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.75)" }, children: [
            p.system_type && /* @__PURE__ */ jsxs("div", { children: [
              "System: ",
              /* @__PURE__ */ jsx("strong", { children: p.system_type })
            ] }),
            p.trap_count && /* @__PURE__ */ jsxs("div", { children: [
              "Traps: ",
              /* @__PURE__ */ jsx("strong", { children: p.trap_count })
            ] }),
            p.tank_count && /* @__PURE__ */ jsxs("div", { children: [
              "Tanks: ",
              /* @__PURE__ */ jsx("strong", { children: p.tank_count })
            ] }),
            p.recurring_addons && /* @__PURE__ */ jsxs("div", { children: [
              "Recurring: ",
              /* @__PURE__ */ jsx("strong", { children: p.recurring_addons })
            ] })
          ] })
        ] }),
        (p.gate_code || p.access_notes || p.pets_on_property || p.special_instructions) && /* @__PURE__ */ jsxs("div", { style: { marginBottom: 14, display: "flex", flexDirection: "column", gap: 6 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 2 }, children: "Property Notes" }),
          p.pets_on_property && /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.78rem", padding: "6px 10px", background: "rgba(255,160,80,0.08)", border: "1px solid rgba(255,160,80,0.3)", borderRadius: 6, color: "#ffb060" }, children: [
            "\u{1F415} ",
            /* @__PURE__ */ jsx("strong", { children: "Pets:" }),
            " ",
            p.pets_on_property
          ] }),
          p.gate_code && /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.78rem", padding: "6px 10px", background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 6, color: "#c9a84c" }, children: [
            "\u{1F511} ",
            /* @__PURE__ */ jsx("strong", { children: "Gate code:" }),
            " ",
            p.gate_code
          ] }),
          p.access_notes && /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.78rem", padding: "6px 10px", background: "rgba(91,196,255,0.07)", border: "1px solid rgba(91,196,255,0.25)", borderRadius: 6, color: "#5bc4ff" }, children: [
            "\u{1F6AA} ",
            /* @__PURE__ */ jsx("strong", { children: "Access:" }),
            " ",
            p.access_notes
          ] }),
          p.special_instructions && /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.78rem", padding: "6px 10px", background: "rgba(125,255,170,0.06)", border: "1px solid rgba(125,255,170,0.25)", borderRadius: 6, color: "#7dffaa" }, children: [
            "\u{1F4DD} ",
            /* @__PURE__ */ jsx("strong", { children: "Notes:" }),
            " ",
            p.special_instructions
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { marginBottom: 14 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 6 }, children: "Appointment History" }),
          /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.65)" }, children: [
            /* @__PURE__ */ jsxs("div", { children: [
              "Last visit: ",
              /* @__PURE__ */ jsx("strong", { style: { color: "#d4e6ca" }, children: d.last ? fmtDockDate(d.last.start) : "\u2014" })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              "Next visit: ",
              /* @__PURE__ */ jsx("strong", { style: { color: "#d4e6ca" }, children: d.next ? fmtDockDate(d.next.start) : "\u2014" })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.4)", marginTop: 2 }, children: [
              "Total appointments: ",
              d.totalAppointments || 0
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx(EventNotesSection, { eventId: ev.id, customerEmail: email }),
        notes && /* @__PURE__ */ jsxs("div", { style: { marginBottom: 14 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 6 }, children: "Notes" }),
          /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.7)", whiteSpace: "pre-wrap" }, children: notes })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { marginBottom: 14 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.4)", marginBottom: 6 }, children: "Customer note (HubSpot timeline)" }),
          /* @__PURE__ */ jsx(DockNoteComposer, { email, hsContactId: d.contact?.id })
        ] })
      ] })
    ] })
  ] });
}
export {
  DetailDock as default
};
