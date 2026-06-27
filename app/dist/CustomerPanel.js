import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useCallback } from "react";
import { useRouter } from "next/router";
import DetailDock from "./AppointmentDetailDock";
const TZ = "America/Chicago";
const CUST_STATUS = {
  active: { bg: "rgba(125,255,170,0.12)", color: "#7dffaa", label: "Active" },
  trialing: { bg: "rgba(125,255,170,0.08)", color: "#7dffaa", label: "Trialing" },
  past_due: { bg: "rgba(255,130,80,0.12)", color: "#ff8050", label: "Past Due" },
  inactive: { bg: "rgba(212,230,202,0.06)", color: "rgba(212,230,202,0.4)", label: "No Sub" },
  canceled: { bg: "rgba(212,230,202,0.06)", color: "rgba(212,230,202,0.4)", label: "Canceled" },
  prospect: { bg: "rgba(201,168,76,0.12)", color: "#c9a84c", label: "Prospect" }
};
function getTrapImage(systemType, trapCount) {
  const images = JSON.parse(process.env.NEXT_PUBLIC_BIZ_SYSTEM_IMAGES || "null");
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
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
}
function fmtTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
}
function fmtDateShort(unix) {
  return new Date(unix * 1e3).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ });
}
function fmtAmt(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}
function StatusBadge({ status }) {
  const s = CUST_STATUS[status] || CUST_STATUS.inactive;
  return /* @__PURE__ */ jsx("span", { style: { display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.06em", background: s.bg, color: s.color }, children: s.label });
}
function NoteComposer({ email, hsContactId, onSaved }) {
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
      onSaved?.();
      setTimeout(() => setMsg(null), 2500);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsxs("div", { style: { marginTop: 4 }, children: [
    /* @__PURE__ */ jsx(
      "textarea",
      {
        rows: 3,
        value: body,
        onChange: (e) => setBody(e.target.value),
        placeholder: "What did you observe / arrange / promise?",
        style: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(122,171,130,0.25)", background: "rgba(255,255,255,0.04)", color: "#d4e6ca", fontSize: "0.85rem", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, marginTop: 6, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: save,
          disabled: busy || !body.trim(),
          style: { padding: "6px 14px", borderRadius: 5, border: "none", background: "#7dffaa", color: "#0d1a10", fontWeight: 800, fontSize: "0.78rem", cursor: busy || !body.trim() ? "not-allowed" : "pointer", opacity: busy || !body.trim() ? 0.5 : 1, fontFamily: "Inter, sans-serif" },
          children: busy ? "Saving\u2026" : "Save note"
        }
      ),
      msg && /* @__PURE__ */ jsx("span", { style: { fontSize: "0.78rem", color: msg.ok ? "#7dffaa" : "#ff8080" }, children: msg.text })
    ] })
  ] });
}
function SmsComposer({ email, phone, onSent }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
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
  return /* @__PURE__ */ jsxs("div", { style: { marginTop: 6 }, children: [
    /* @__PURE__ */ jsx(
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
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8 }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: "0.7rem", color: msg?.startsWith("\u2713") ? "#7dffaa" : msg ? "#ff8080" : "rgba(212,230,202,0.4)" }, children: msg || `${body.length}/320` }),
      /* @__PURE__ */ jsx(
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
  return /* @__PURE__ */ jsxs("div", { style: { padding: "9px 0", borderBottom: "1px solid rgba(122,171,130,0.07)" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: "0.83rem", fontWeight: 800, color: accent }, children: fmtDate(b.startTime) }),
      /* @__PURE__ */ jsx("span", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.4)", whiteSpace: "nowrap" }, children: fmtTime(b.startTime) })
    ] }),
    b.title && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.75rem", color: "rgba(212,230,202,0.5)", marginTop: 2 }, children: b.title })
  ] });
}
function AppointmentHistoryPanel({ detail, onSchedule, scheduleBtn }) {
  const upcoming = detail.upcomingBookings?.length ? detail.upcomingBookings : detail.nextBooking ? [detail.nextBooking] : [];
  const past = detail.pastBookings || [];
  const lbl = { fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(212,230,202,0.35)", margin: "16px 0 6px" };
  return /* @__PURE__ */ jsxs("div", { style: { paddingTop: 8 }, children: [
    /* @__PURE__ */ jsx("button", { style: scheduleBtn, onClick: onSchedule, children: "+ Schedule appointment" }),
    /* @__PURE__ */ jsxs("div", { style: lbl, children: [
      "Upcoming (",
      upcoming.length,
      ")"
    ] }),
    upcoming.length === 0 ? /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.3)" }, children: "None scheduled" }) : upcoming.map((b, i) => /* @__PURE__ */ jsx(ApptRow, { b, accent: "#c9a84c" }, b.id || i)),
    /* @__PURE__ */ jsxs("div", { style: lbl, children: [
      "Past (",
      past.length,
      ")"
    ] }),
    past.length === 0 ? /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", color: "rgba(212,230,202,0.3)" }, children: "No past visits" }) : past.map((b, i) => /* @__PURE__ */ jsx(ApptRow, { b, accent: "#7dffaa" }, b.id || i))
  ] });
}
function CustomerPanel({ customer, onClose }) {
  const router = useRouter();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState("details");
  const [editForm, setEditForm] = useState({ name: "", phone: "", address: "", planType: "", systemType: "", trapCount: "", hasTimer: false });
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [apptDock, setApptDock] = useState(null);
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
  const [messaging, setMessaging] = useState(false);
  const [msgForm, setMsgForm] = useState({ subject: "", body: "" });
  const [msgSending, setMsgSending] = useState(false);
  const [msgResult, setMsgResult] = useState(null);
  const fetchDetail = useCallback(async () => {
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
  const [fetched, setFetched] = useState(false);
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
  return /* @__PURE__ */ jsxs("div", { style: panel, className: "docked-panel", children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "20px 20px 16px", borderBottom: "1px solid rgba(122,171,130,0.15)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontWeight: 900, fontSize: "1.1rem", marginBottom: 2 }, children: customer.name || "Customer" }),
        detail?.systemType ? /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.8rem", fontWeight: 700, color: "#c9a84c", marginBottom: 4 }, children: [
          detail.systemType === "Biogents-CO2" ? "Biogents CO\u2082" : detail.systemType === "Biogents-NonCO2" ? "Biogents Non-CO\u2082" : "Mosqitter Grand",
          detail.trapCount ? ` \xB7 ${detail.trapCount} trap${detail.trapCount > 1 ? "s" : ""}` : "",
          detail.planType ? ` \xB7 ${detail.planType}` : ""
        ] }) : customer.plan ? /* @__PURE__ */ jsx("div", { style: { fontSize: "0.78rem", color: "rgba(212,230,202,0.4)", marginBottom: 4 }, children: customer.plan }) : null,
        (detail?.phone || customer.phone) && /* @__PURE__ */ jsxs("a", { href: `tel:${(detail?.phone || customer.phone).replace(/[^\d+]/g, "")}`, style: { fontSize: "0.85rem", fontWeight: 700, color: "#7dffaa", textDecoration: "none", display: "block", marginBottom: 4 }, children: [
          "\u{1F4DE} ",
          detail?.phone || customer.phone
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [
          customer.status && customer.status !== "inactive" && customer.status !== "canceled" && /* @__PURE__ */ jsx(StatusBadge, { status: customer.status }),
          detail?.nextBooking && /* @__PURE__ */ jsxs("span", { style: { fontSize: "0.7rem", color: "#7dffaa", fontWeight: 700 }, children: [
            "Next: ",
            fmtDate(detail.nextBooking.startTime)
          ] }),
          detail?.pastBookings?.[0] && /* @__PURE__ */ jsxs("span", { style: { fontSize: "0.7rem", color: "rgba(212,230,202,0.35)", fontWeight: 600 }, children: [
            "Last: ",
            fmtDate(detail.pastBookings[0].startTime)
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { onClick: onClose, style: { background: "none", border: "none", color: "rgba(212,230,202,0.4)", cursor: "pointer", fontSize: "1.3rem", lineHeight: 1, padding: 4, flexShrink: 0 }, children: "\xD7" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { padding: "12px 20px", borderBottom: "1px solid rgba(122,171,130,0.08)", display: "flex", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("button", { style: btn("gold"), onClick: scheduleForCustomer, children: "+ Schedule" }),
      !editing && /* @__PURE__ */ jsx("button", { style: btn("ghost"), onClick: () => setEditing(true), children: "Edit" }),
      editing && /* @__PURE__ */ jsx("button", { style: btn("green"), onClick: saveEdit, disabled: saving, children: saving ? "Saving\u2026" : "Save" }),
      editing && /* @__PURE__ */ jsx("button", { style: btn("ghost"), onClick: () => setEditing(false), children: "Cancel" }),
      customer.email && !messaging && /* @__PURE__ */ jsx("button", { style: btn("ghost"), onClick: () => {
        setMessaging(true);
        setMsgResult(null);
        setMsgForm({ subject: `Hi from ${process.env.NEXT_PUBLIC_BIZ_NAME || "GreenGuard USA"}`, body: "" });
      }, children: "\u2709 Email" }),
      (customer.phone || detail?.phone) && /* @__PURE__ */ jsx("a", { href: `sms:${(customer.phone || detail?.phone || "").replace(/[^\d+]/g, "")}`, style: { ...btn("ghost"), textDecoration: "none", display: "inline-flex", alignItems: "center" }, children: "\u{1F4AC} Text" })
    ] }),
    messaging && /* @__PURE__ */ jsxs("div", { style: { padding: "16px 20px", background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(122,171,130,0.08)" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(212,230,202,0.35)", marginBottom: 10 }, children: [
        "Email to ",
        customer.email
      ] }),
      /* @__PURE__ */ jsx(
        "input",
        {
          value: msgForm.subject,
          onChange: (e) => setMsgForm((f) => ({ ...f, subject: e.target.value })),
          placeholder: "Subject",
          style: { width: "100%", marginBottom: 8, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(122,171,130,0.2)", background: "rgba(0,0,0,0.25)", color: "#d4e6ca", fontFamily: "Inter, sans-serif", fontSize: "0.85rem", boxSizing: "border-box", outline: "none" }
        }
      ),
      /* @__PURE__ */ jsx(
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
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ jsx(
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
        /* @__PURE__ */ jsx("button", { style: btn("ghost"), onClick: () => setMessaging(false), children: "Cancel" }),
        msgResult === "sent" && /* @__PURE__ */ jsx("span", { style: { fontSize: "0.8rem", color: "#7dffaa", fontWeight: 700 }, children: "\u2713 Sent" }),
        msgResult && msgResult !== "sent" && /* @__PURE__ */ jsx("span", { style: { fontSize: "0.8rem", color: "#ff8080" }, children: msgResult })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6, padding: "10px 20px 0" }, children: [{ k: "details", l: "Details" }, { k: "history", l: "History" }].map((t) => /* @__PURE__ */ jsx(
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
    /* @__PURE__ */ jsxs("div", { style: { padding: "0 20px 32px", flex: 1 }, children: [
      loading && /* @__PURE__ */ jsx("p", { style: { color: "rgba(212,230,202,0.4)", marginTop: 24 }, children: "Loading\u2026" }),
      error && /* @__PURE__ */ jsx("p", { style: { color: "#ff8080", marginTop: 24 }, children: error }),
      detail && !loading && tab === "history" && /* @__PURE__ */ jsx(
        AppointmentHistoryPanel,
        {
          detail,
          onSchedule: scheduleForCustomer,
          scheduleBtn: { ...btn("gold"), width: "100%", padding: "10px 14px", fontSize: "0.85rem" }
        }
      ),
      detail && !loading && tab === "details" && /* @__PURE__ */ jsx(Fragment, { children: editing ? /* @__PURE__ */ jsxs("div", { style: row, children: [
        /* @__PURE__ */ jsx("div", { style: lbl, children: "Edit Info" }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }, children: [
          /* @__PURE__ */ jsx("input", { style: input, placeholder: "Full name", value: editForm.name, onChange: (e) => setEditForm((f) => ({ ...f, name: e.target.value })) }),
          /* @__PURE__ */ jsx("input", { style: input, placeholder: "Phone", value: editForm.phone, onChange: (e) => setEditForm((f) => ({ ...f, phone: e.target.value })) }),
          /* @__PURE__ */ jsx("input", { style: input, placeholder: "Address", value: editForm.address, onChange: (e) => setEditForm((f) => ({ ...f, address: e.target.value })) }),
          /* @__PURE__ */ jsxs("select", { style: input, value: editForm.planType, onChange: (e) => setEditForm((f) => ({ ...f, planType: e.target.value })), children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "Plan type\u2026" }),
            /* @__PURE__ */ jsx("option", { value: "rent", children: "Rent" }),
            /* @__PURE__ */ jsx("option", { value: "own", children: "Own" })
          ] }),
          /* @__PURE__ */ jsxs("select", { style: input, value: editForm.systemType, onChange: (e) => setEditForm((f) => ({ ...f, systemType: e.target.value })), children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "System type\u2026" }),
            /* @__PURE__ */ jsx("option", { value: "Biogents-CO2", children: "Biogents CO\u2082" }),
            /* @__PURE__ */ jsx("option", { value: "Biogents-NonCO2", children: "Biogents Non-CO\u2082" }),
            /* @__PURE__ */ jsx("option", { value: "Mosqitter-Grand", children: "Mosqitter Grand" })
          ] }),
          /* @__PURE__ */ jsx("input", { style: input, type: "number", min: "1", placeholder: "Trap count", value: editForm.trapCount, onChange: (e) => setEditForm((f) => ({ ...f, trapCount: e.target.value })) }),
          editForm.systemType === "Biogents-CO2" && /* @__PURE__ */ jsxs("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem", color: "rgba(212,230,202,0.7)", cursor: "pointer" }, children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: !!editForm.hasTimer, onChange: (e) => setEditForm((f) => ({ ...f, hasTimer: e.target.checked })) }),
            "Has Biogents Timer"
          ] })
        ] })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { style: row, children: [
          /* @__PURE__ */ jsx("div", { style: lbl, children: "Contact" }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }, children: [
            detail.phone && /* @__PURE__ */ jsxs("a", { href: `tel:${detail.phone.replace(/[^\d+]/g, "")}`, style: { fontSize: "0.92rem", fontWeight: 700, color: "#7dffaa", textDecoration: "none" }, children: [
              "\u{1F4DE} ",
              detail.phone
            ] }),
            detail.email && /* @__PURE__ */ jsxs("a", { href: `mailto:${detail.email}`, style: { fontSize: "0.82rem", color: "rgba(212,230,202,0.6)", textDecoration: "none", wordBreak: "break-all" }, children: [
              "\u2709 ",
              detail.email
            ] }),
            detail.address && /* @__PURE__ */ jsxs(
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
        /* @__PURE__ */ jsxs("div", { style: row, children: [
          /* @__PURE__ */ jsx("div", { style: lbl, children: "Notes" }),
          /* @__PURE__ */ jsx(NoteComposer, { email: detail.email, hsContactId: detail.hubspotContactId, onSaved: fetchDetail }),
          (() => {
            const adminNotes = (detail.notes || []).filter((n) => /^\[ADMIN-NOTE/.test(n.body || ""));
            if (adminNotes.length === 0) return /* @__PURE__ */ jsx("div", { style: { fontSize: "0.78rem", color: "rgba(212,230,202,0.3)", marginTop: 10 }, children: "No notes yet" });
            return adminNotes.map((note) => {
              const body = (note.body || "").replace(/^\[ADMIN-NOTE[^\]]*\]\s*/, "");
              return /* @__PURE__ */ jsxs("div", { style: { marginTop: 8, padding: "10px 12px", background: "rgba(201,168,76,0.05)", borderRadius: 6, borderLeft: "2px solid rgba(201,168,76,0.45)" }, children: [
                /* @__PURE__ */ jsx("div", { style: { fontSize: "0.82rem", whiteSpace: "pre-wrap", color: "rgba(212,230,202,0.85)", lineHeight: 1.5 }, children: body }),
                note.timestamp && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.66rem", color: "rgba(212,230,202,0.32)", marginTop: 5 }, children: new Date(note.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ }) })
              ] }, note.id);
            });
          })()
        ] }),
        detail.systemType && (() => {
          const img = getTrapImage(detail.systemType, detail.trapCount);
          const label = detail.systemType === "Biogents-CO2" ? "Biogents CO\u2082" : detail.systemType === "Biogents-NonCO2" ? "Biogents Non-CO\u2082" : "Mosqitter Grand";
          return /* @__PURE__ */ jsxs("div", { style: row, children: [
            /* @__PURE__ */ jsx("div", { style: lbl, children: "System" }),
            img && /* @__PURE__ */ jsx("img", { src: img, alt: label, style: { width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 8, marginBottom: 6, border: "1px solid rgba(122,171,130,0.15)" } }),
            /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.82rem", color: "rgba(212,230,202,0.65)" }, children: [
              detail.planType && /* @__PURE__ */ jsx("span", { style: { textTransform: "capitalize", marginRight: 8, color: "#c9a84c", fontWeight: 800 }, children: detail.planType }),
              /* @__PURE__ */ jsx("span", { style: { fontWeight: 700 }, children: label }),
              detail.trapCount ? /* @__PURE__ */ jsxs("span", { style: { color: "rgba(212,230,202,0.4)", marginLeft: 6 }, children: [
                "\xB7 ",
                detail.trapCount,
                " trap",
                detail.trapCount > 1 ? "s" : ""
              ] }) : "",
              detail.hasTimer ? /* @__PURE__ */ jsx("span", { style: { color: "rgba(212,230,202,0.4)", marginLeft: 6 }, children: "\xB7 Timer" }) : ""
            ] })
          ] });
        })(),
        detail.subscription && /* @__PURE__ */ jsxs("div", { style: row, children: [
          /* @__PURE__ */ jsx("div", { style: lbl, children: "Plan" }),
          /* @__PURE__ */ jsxs("div", { style: { fontSize: "1rem", fontWeight: 900, color: "#c9a84c" }, children: [
            fmtAmt(detail.subscription.amount),
            /* @__PURE__ */ jsxs("span", { style: { fontSize: "0.75rem", fontWeight: 500, color: "rgba(212,230,202,0.4)", marginLeft: 4 }, children: [
              "/",
              detail.subscription.interval
            ] })
          ] }),
          detail.subscription.label && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.75rem", color: "rgba(212,230,202,0.35)", marginTop: 2 }, children: detail.subscription.label })
        ] }),
        detail.openInvoices?.length > 0 && /* @__PURE__ */ jsxs("div", { style: row, children: [
          /* @__PURE__ */ jsx("div", { style: { ...lbl, color: "#ffb060" }, children: "\u26A0 Outstanding Invoices" }),
          detail.openInvoices.map((inv) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, padding: "8px 10px", background: "rgba(255,160,80,0.06)", borderRadius: 6, border: "1px solid rgba(255,160,80,0.15)" }, children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("div", { style: { fontWeight: 800, color: "#ffb060" }, children: fmtAmt(inv.amountDue) }),
              /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.35)", marginTop: 2 }, children: [
                inv.number,
                " \xB7 ",
                fmtDateShort(inv.created)
              ] })
            ] }),
            inv.hostedUrl && /* @__PURE__ */ jsx("a", { href: inv.hostedUrl, target: "_blank", rel: "noopener noreferrer", style: { fontSize: "0.72rem", padding: "5px 12px", borderRadius: 4, background: "#c9a84c", color: "#0d1a10", fontWeight: 800, textDecoration: "none" }, children: "Pay" })
          ] }, inv.id))
        ] }),
        detail.pastBookings?.length > 0 && /* @__PURE__ */ jsxs("div", { style: row, children: [
          /* @__PURE__ */ jsx("div", { style: lbl, children: "Last Visit" }),
          /* @__PURE__ */ jsxs("div", { style: { marginTop: 4, padding: "10px 12px", background: "rgba(125,255,170,0.04)", borderRadius: 8, border: "1px solid rgba(125,255,170,0.1)" }, children: [
            /* @__PURE__ */ jsx("div", { style: { fontWeight: 800, fontSize: "0.92rem", color: "#7dffaa" }, children: fmtDate(detail.pastBookings[0].startTime) }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: "0.78rem", color: "rgba(212,230,202,0.5)", marginTop: 2 }, children: detail.pastBookings[0].title }),
            detail.pastBookings[0].address && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.35)", marginTop: 2 }, children: detail.pastBookings[0].address })
          ] }),
          detail.pastBookings.length > 1 && /* @__PURE__ */ jsx("div", { style: { marginTop: 8 }, children: detail.pastBookings.slice(1).map((b) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(122,171,130,0.07)" }, children: [
            /* @__PURE__ */ jsx("div", { style: { fontSize: "0.78rem", fontWeight: 700, color: "rgba(212,230,202,0.55)" }, children: fmtDate(b.startTime) }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: "0.74rem", color: "rgba(212,230,202,0.35)", textAlign: "right", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: b.title })
          ] }, b.id)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: row, children: [
          /* @__PURE__ */ jsx("div", { style: lbl, children: "Next Appointment" }),
          detail.nextBooking ? /* @__PURE__ */ jsxs(
            "div",
            {
              onClick: () => openApptDock(detail.nextBooking.id),
              style: { marginTop: 4, padding: "10px 12px", background: "rgba(201,168,76,0.06)", borderRadius: 8, border: "1px solid rgba(201,168,76,0.2)", cursor: detail.nextBooking.id ? "pointer" : "default" },
              title: detail.nextBooking.id ? "Click to view appointment details" : void 0,
              children: [
                /* @__PURE__ */ jsx("div", { style: { fontWeight: 800, fontSize: "0.92rem", color: "#c9a84c" }, children: fmtDate(detail.nextBooking.startTime) }),
                /* @__PURE__ */ jsx("div", { style: { fontSize: "0.78rem", color: "rgba(212,230,202,0.5)", marginTop: 2 }, children: detail.nextBooking.title }),
                detail.nextBooking.address && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.72rem", color: "rgba(212,230,202,0.35)", marginTop: 2 }, children: detail.nextBooking.address }),
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, marginTop: 10 }, children: [
                  detail.nextBooking.calBookingId && /* @__PURE__ */ jsx("button", { style: btn("red"), onClick: handleCancel, disabled: cancelling, children: cancelling ? "Cancelling\u2026" : "Cancel" }),
                  detail.nextBooking.calBookingUid && /* @__PURE__ */ jsx("a", { href: `https://cal.com/reschedule/${detail.nextBooking.calBookingUid}`, target: "_blank", rel: "noopener noreferrer", style: { ...btn("ghost"), textDecoration: "none", display: "inline-block" }, children: "Reschedule" })
                ] })
              ]
            }
          ) : /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", color: "rgba(212,230,202,0.3)", marginTop: 4 }, children: "None scheduled" })
        ] }),
        (detail.phone || customer.phone) && /* @__PURE__ */ jsxs("div", { style: row, children: [
          /* @__PURE__ */ jsx("div", { style: lbl, children: "Send SMS" }),
          /* @__PURE__ */ jsx(SmsComposer, { email: detail.email || customer.email, phone: detail.phone || customer.phone, onSent: fetchDetail })
        ] }),
        (detail.notes || []).some((n) => /^\[SMS-(IN|OUT)/.test(n.body || "")) && /* @__PURE__ */ jsxs("div", { style: { ...row, borderBottom: "none" }, children: [
          /* @__PURE__ */ jsx("div", { style: lbl, children: "SMS history" }),
          detail.notes.filter((n) => /^\[SMS-(IN|OUT)/.test(n.body || "")).map((note) => {
            const body = note.body || "";
            const isSmsIn = body.startsWith("[SMS-IN");
            const tag = isSmsIn ? "\u2190 Inbound" : "\u2192 Outbound";
            const bg = isSmsIn ? "rgba(91,196,255,0.06)" : "rgba(125,255,170,0.05)";
            const bord = isSmsIn ? "rgba(91,196,255,0.35)" : "rgba(125,255,170,0.35)";
            return /* @__PURE__ */ jsxs("div", { style: { marginTop: 8, padding: "10px 12px", background: bg, borderRadius: 6, borderLeft: `2px solid ${bord}` }, children: [
              /* @__PURE__ */ jsx("div", { style: { fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: isSmsIn ? "#5bc4ff" : "#7dffaa", marginBottom: 4 }, children: tag }),
              /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", whiteSpace: "pre-wrap", color: "rgba(212,230,202,0.75)", lineHeight: 1.5 }, children: body.replace(/^\[SMS-(IN|OUT)[^\]]*\]\s*(\([^)]*\)\s*)?(by [^\n]*:\s*)?/, "").replace(/^From[^\n]*\n/, "") }),
              note.timestamp && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.66rem", color: "rgba(212,230,202,0.28)", marginTop: 5 }, children: new Date(note.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ }) })
            ] }, note.id);
          })
        ] })
      ] }) })
    ] }),
    apptDock && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(
        "div",
        {
          style: { position: "fixed", inset: 0, zIndex: 299 },
          onClick: () => setApptDock(null)
        }
      ),
      /* @__PURE__ */ jsx(
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
export {
  CustomerPanel as default
};
