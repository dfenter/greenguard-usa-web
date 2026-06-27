import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import Link from "next/link";
import CustomerPanel from "./CustomerPanel";
const TZ_DISPLAY = "America/Chicago";
const TZ = "America/Chicago";
function fmtTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ });
  } catch {
    return "";
  }
}
const actionBtn = {
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
const disabledBtn = {
  ...actionBtn,
  border: "1px solid rgba(122,171,130,0.12)",
  color: "rgba(212,230,202,0.3)",
  background: "transparent",
  cursor: "not-allowed",
  opacity: 0.6
};
function StopRow({ stop, index, dateStr, distance }) {
  const roundsUrl = `/admin/rounds?date=${dateStr}&email=${encodeURIComponent(stop.email || "")}`;
  const mapsUrl = stop.address ? `https://maps.apple.com/?daddr=${encodeURIComponent(stop.address)}` : null;
  const canNotify = !!(stop.email || stop.phone);
  async function sendOnMyWay() {
    const eta = window.prompt('ETA in minutes (leave blank for "shortly"):', "15");
    if (eta === null) return;
    const send = (force) => fetch("/api/admin/notify-eta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerEmail: stop.email, customerPhone: stop.phone, customerName: stop.title || stop.customerName, etaMinutes: eta ? parseInt(eta, 10) : null, force })
    });
    let r = await send(false);
    let d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.duplicate) {
      if (!window.confirm(d.error + "\n\nSend again anyway?")) return;
      r = await send(true);
      d = await r.json().catch(() => ({}));
    }
    if (r.ok) alert("\u2713 SMS sent");
    else alert("Failed: " + (d.error || r.status));
  }
  return /* @__PURE__ */ jsx(StopCard, { stop, number: index + 1, distance, actions: /* @__PURE__ */ jsxs(Fragment, { children: [
    mapsUrl ? /* @__PURE__ */ jsx("a", { href: mapsUrl, target: "_blank", rel: "noopener noreferrer", style: { ...actionBtn, border: "1px solid rgba(122,171,130,0.25)", color: "#7aab82" }, children: "Navigate" }) : /* @__PURE__ */ jsx("span", { style: disabledBtn, "aria-disabled": "true", children: "Navigate" }),
    /* @__PURE__ */ jsx(
      "button",
      {
        disabled: !canNotify,
        title: canNotify ? "Send arrival SMS" : "No phone or email on file",
        onClick: sendOnMyWay,
        style: {
          ...actionBtn,
          border: canNotify ? "1px solid rgba(125,255,170,0.35)" : "1px solid rgba(125,255,170,0.15)",
          background: canNotify ? "rgba(125,255,170,0.08)" : "transparent",
          color: canNotify ? "#7dffaa" : "rgba(125,255,170,0.4)",
          cursor: canNotify ? "pointer" : "not-allowed"
        },
        children: "\u{1F4F2} On My Way"
      }
    ),
    stop.email ? /* @__PURE__ */ jsx(Link, { href: roundsUrl, style: { ...actionBtn, background: "#c9a84c", color: "#0d1a10", border: "none", fontWeight: 800 }, children: "Finalize Visit" }) : /* @__PURE__ */ jsx("span", { style: { ...disabledBtn, fontWeight: 800 }, "aria-disabled": "true", children: "Finalize Visit" })
  ] }) });
}
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
  const [showPanel, setShowPanel] = useState(false);
  const [eventNotes, setEventNotes] = useState([]);
  const name = stop.customerName || stop.title || "Service Visit";
  useEffect(() => {
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
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    showPanel && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 199 }, onClick: () => setShowPanel(false) }),
      /* @__PURE__ */ jsx(CustomerPanel, { customer: { email: stop.email, name, phone: stop.phone }, onClose: () => setShowPanel(false) })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsxs("div", { style: { marginBottom: actions || children ? 12 : 0 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 3, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx("span", { style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", fontWeight: 900, fontSize: "0.78rem", background: done ? "rgba(125,255,170,0.15)" : active ? "rgba(201,168,76,0.15)" : "rgba(122,171,130,0.1)", color: done ? "#7dffaa" : active ? "#c9a84c" : "rgba(212,230,202,0.5)", flexShrink: 0 }, children: done ? "\u2713" : number }),
          /* @__PURE__ */ jsx(
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
          stop.address && /* @__PURE__ */ jsxs("span", { style: { fontSize: "0.82rem", color: "rgba(212,230,202,0.5)", fontWeight: 400 }, children: [
            "\u{1F4CD} ",
            stop.address
          ] }),
          distance && /* @__PURE__ */ jsxs("span", { style: { fontWeight: 800, fontSize: "0.88rem", color: parseFloat(distance.miles) <= 5 ? "#7dffaa" : parseFloat(distance.miles) <= 15 ? "#c9a84c" : "rgba(212,230,202,0.45)", whiteSpace: "nowrap" }, children: [
            distance.miles,
            " mi \xB7 ",
            distance.duration
          ] }),
          headerExtras
        ] }),
        eventNotes.length > 0 && /* @__PURE__ */ jsx("div", { style: { paddingLeft: 36, marginTop: 4, marginBottom: 2 }, children: eventNotes.map((n) => /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.82rem", color: "#7dffaa", lineHeight: 1.5 }, children: [
          "\u{1F4CB} ",
          n.body
        ] }, n.id)) }),
        (stop.clientNotes || []).map((note, i) => /* @__PURE__ */ jsx("div", { style: { paddingLeft: 36, fontSize: "0.82rem", color: "rgba(212,230,202,0.75)", lineHeight: 1.5 }, children: note }, i)),
        /* @__PURE__ */ jsxs("div", { style: { paddingLeft: 36, display: "flex", flexWrap: "wrap", gap: "3px 12px", fontSize: "0.9rem", marginTop: 4, marginBottom: 2 }, children: [
          stop.startTime && /* @__PURE__ */ jsxs("span", { style: { color: "#c9a84c", fontWeight: 700 }, children: [
            new Date(stop.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ }),
            " \xB7 ",
            fmtTime(stop.startTime),
            stop.endTime ? ` \u2013 ${fmtTime(stop.endTime)}` : ""
          ] }),
          stop.serviceType && /* @__PURE__ */ jsx("span", { style: { color: "rgba(212,230,202,0.55)" }, children: stop.serviceType }),
          stop.tanks > 0 && /* @__PURE__ */ jsxs("span", { style: { color: "#7dffaa", fontWeight: 700 }, children: [
            "\u{1FAD9} ",
            stop.tanks,
            " tank",
            stop.tanks > 1 ? "s" : ""
          ] })
        ] }),
        (checkIn || checkOut) && /* @__PURE__ */ jsxs("div", { style: { paddingLeft: 36, marginBottom: 4, fontSize: "0.75rem", color: "rgba(212,230,202,0.4)", display: "flex", gap: 14 }, children: [
          checkIn && /* @__PURE__ */ jsxs("span", { children: [
            "In: ",
            /* @__PURE__ */ jsx("strong", { children: checkIn })
          ] }),
          checkOut && /* @__PURE__ */ jsxs("span", { children: [
            "Out: ",
            /* @__PURE__ */ jsx("strong", { style: { color: "#7dffaa" }, children: checkOut })
          ] })
        ] }),
        actions && /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }, children: actions })
      ] }),
      children
    ] })
  ] });
}
export {
  StopRow,
  actionBtn,
  StopCard as default,
  disabledBtn
};
