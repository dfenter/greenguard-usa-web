import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
function TankCalendar({ tankCalendar = {}, scheduleByDate = {}, onDayClick = () => {
}, today, currentStock = 0, expectedDelivery = 0 }) {
  const [viewDate, setViewDate] = useState(/* @__PURE__ */ new Date());
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
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setViewDate(new Date(year, month - 1, 1)),
          style: { background: "none", border: "none", color: "rgba(212,230,202,0.6)", cursor: "pointer", fontSize: "1.2rem", fontFamily: "Inter, sans-serif" },
          children: "\u2039"
        }
      ),
      /* @__PURE__ */ jsx("span", { style: { fontWeight: 800, fontSize: "0.9rem" }, children: monthLabel }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setViewDate(new Date(year, month + 1, 1)),
          style: { background: "none", border: "none", color: "rgba(212,230,202,0.6)", cursor: "pointer", fontSize: "1.2rem", fontFamily: "Inter, sans-serif" },
          children: "\u203A"
        }
      )
    ] }),
    /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3, marginBottom: 3 }, children: dayLabels.map((l) => /* @__PURE__ */ jsx("div", { style: { textAlign: "center", fontSize: "0.62rem", fontWeight: 800, color: "rgba(212,230,202,0.35)", letterSpacing: "0.04em", padding: "4px 0" }, children: l }, l)) }),
    /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 }, children: cells.map((cell, i) => {
      if (!cell) return /* @__PURE__ */ jsx("div", {}, `e${i}`);
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
      return /* @__PURE__ */ jsxs(
        "div",
        {
          onClick: () => onDayClick(dateStr, log, tanks),
          style: { borderRadius: 6, border: `1px solid ${border}`, background: bg, padding: "6px 3px", cursor: "pointer", minHeight: 72, minWidth: 0, overflow: "hidden" },
          children: [
            /* @__PURE__ */ jsx("div", { style: { fontSize: "0.78rem", fontWeight: isToday ? 900 : 600, color: isToday ? "#c9a84c" : "rgba(212,230,202,0.75)", marginBottom: 2, textAlign: "center" }, children: d }),
            tanks > 0 && /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.7rem", fontWeight: 800, color: deficit ? "#ff8080" : "#7dffaa", textAlign: "center", lineHeight: 1.15 }, children: [
              tanks,
              "t"
            ] }),
            appts > 0 && /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.62rem", color: "rgba(212,230,202,0.5)", textAlign: "center", lineHeight: 1.15 }, children: [
              appts,
              "v"
            ] }),
            hasLog && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.62rem", color: "#c9a84c", fontWeight: 700, marginTop: 2, textAlign: "center" }, children: "\u2713" })
          ]
        },
        dateStr
      );
    }) }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 12, marginTop: 10, fontSize: "0.68rem", color: "rgba(212,230,202,0.45)", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
        /* @__PURE__ */ jsx("span", { style: { width: 9, height: 9, borderRadius: 2, background: "rgba(125,255,170,0.15)", border: "1px solid rgba(125,255,170,0.25)", display: "inline-block" } }),
        " On track"
      ] }),
      /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
        /* @__PURE__ */ jsx("span", { style: { width: 9, height: 9, borderRadius: 2, background: "rgba(255,100,100,0.15)", border: "1px solid rgba(255,100,100,0.3)", display: "inline-block" } }),
        " Deficit"
      ] }),
      /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
        /* @__PURE__ */ jsx("span", { style: { width: 9, height: 9, borderRadius: 2, background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)", display: "inline-block" } }),
        " Logged"
      ] }),
      /* @__PURE__ */ jsx("span", { style: { color: "rgba(212,230,202,0.3)" }, children: "t = tanks \xB7 v = visits" })
    ] })
  ] });
}
export {
  TankCalendar as default
};
