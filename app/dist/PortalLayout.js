import { jsx, jsxs } from "react/jsx-runtime";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import AdminChat from "./AdminChat";
const NAV_LINKS = [
  { href: "/dashboard", label: "My Account" },
  { href: "/dashboard/history", label: "History" },
  { href: "/dashboard/settings", label: "Settings" }
];
const ADMIN_NAV_LINKS = [
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
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [router.pathname]);
  return /* @__PURE__ */ jsxs("div", { style: { minHeight: "100vh", display: "flex", flexDirection: "column" }, children: [
    /* @__PURE__ */ jsx("nav", { style: {
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
    }, children: /* @__PURE__ */ jsxs("div", { style: {
      maxWidth: 1100,
      margin: "0 auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 76,
      position: "relative"
    }, children: [
      /* @__PURE__ */ jsx(Link, { href: logoHref || (isAdmin ? "/admin/home" : "/dashboard"), style: { textDecoration: "none", lineHeight: 1.15, flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }, children: /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("span", { style: { display: "block", fontWeight: 900, fontSize: "1.32rem", letterSpacing: "-0.02em", whiteSpace: "nowrap" }, children: process.env.NEXT_PUBLIC_BIZ_NAME || "GreenGuard USA" }),
        /* @__PURE__ */ jsx("span", { style: { display: "block", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }, children: process.env.NEXT_PUBLIC_BIZ_TAGLINE || "Smart \xB7 Safe \xB7 Effective" })
      ] }) }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          className: "hamburger",
          onClick: () => setMenuOpen((o) => !o),
          "aria-label": "Open navigation",
          children: [
            /* @__PURE__ */ jsx("span", {}),
            /* @__PURE__ */ jsx("span", {}),
            /* @__PURE__ */ jsx("span", {})
          ]
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "nav-links" + (menuOpen ? " open" : ""), style: { overflowX: "auto", WebkitOverflowScrolling: "touch", gap: 6, minWidth: 0 }, children: [
        !isAdmin && NAV_LINKS.map(({ href, label }) => {
          const active = router.pathname === href;
          return /* @__PURE__ */ jsx(Link, { href, style: { fontSize: "1.05rem", fontWeight: active ? 800 : 700, padding: "9px 16px", borderRadius: "var(--radius-sm)", whiteSpace: "nowrap", flexShrink: 0, transition: "background 0.15s var(--ease), color 0.15s var(--ease)", color: active ? "var(--green)" : "var(--text)", background: active ? "rgba(var(--green-rgb),0.12)" : "transparent", boxShadow: active ? "inset 0 0 0 1px rgba(var(--green-rgb),0.28)" : "none" }, children: label }, href);
        }),
        isAdmin && ADMIN_NAV_LINKS.map(({ href, label }) => {
          const active = router.pathname === href;
          return /* @__PURE__ */ jsx(Link, { href, style: { fontSize: "1.05rem", fontWeight: active ? 800 : 700, padding: "9px 14px", borderRadius: "var(--radius-sm)", whiteSpace: "nowrap", flexShrink: 0, transition: "background 0.15s var(--ease), color 0.15s var(--ease)", color: active ? "var(--gold)" : "rgba(var(--gold-rgb),0.82)", background: active ? "rgba(var(--gold-rgb),0.13)" : "transparent", boxShadow: active ? "inset 0 0 0 1px rgba(var(--gold-rgb),0.30)" : "none" }, children: label }, href);
        }),
        /* @__PURE__ */ jsx(
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
    /* @__PURE__ */ jsxs("main", { className: isAdmin ? "admin-main" : "", style: {
      flex: 1,
      maxWidth: 1100,
      margin: "0 auto",
      width: "100%",
      paddingTop: topPadding ?? "40px",
      paddingBottom: topPadding ?? "40px",
      paddingLeft: "max(20px, env(safe-area-inset-left))",
      paddingRight: "max(20px, env(safe-area-inset-right))"
    }, children: [
      title && /* @__PURE__ */ jsx("h1", { style: { fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 900, letterSpacing: "-0.02em", marginBottom: 32 }, children: title }),
      children
    ] }),
    /* @__PURE__ */ jsxs("footer", { style: {
      borderTop: "1px solid var(--border)",
      padding: "20px 24px",
      textAlign: "center",
      fontSize: "0.78rem",
      color: "var(--text-dim)"
    }, children: [
      "\xA9 ",
      (/* @__PURE__ */ new Date()).getFullYear(),
      " ",
      process.env.NEXT_PUBLIC_BIZ_NAME || "GreenGuard USA",
      " \xB7 ",
      process.env.NEXT_PUBLIC_BIZ_CITY || "Austin, TX"
    ] }),
    isAdmin && /* @__PURE__ */ jsx(AdminChat, {}),
    isAdmin && /* @__PURE__ */ jsx(AdminBottomDock, { pathname: router.pathname })
  ] });
}
const DOCK_ITEMS = [
  { href: "/admin/inventory", label: "Inventory", icon: "\u{1F4E6}" },
  { href: "/admin/calendar", label: "Calendar", icon: "\u{1F4C5}" },
  { href: "/admin/clients", label: "Clients", icon: "\u{1F465}" },
  { href: "/admin/rounds", label: "Rounds", icon: "\u{1F690}" },
  { href: "/admin/quote", label: "Quote", icon: "\u{1F4DD}" }
];
function AdminBottomDock({ pathname }) {
  return /* @__PURE__ */ jsx("nav", { className: "admin-dock", "aria-label": "Admin quick access", style: {
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
    return /* @__PURE__ */ jsxs(Link, { href, style: {
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
      /* @__PURE__ */ jsx("span", { style: { fontSize: "1.2rem", lineHeight: 1 }, children: icon }),
      /* @__PURE__ */ jsx("span", { style: { fontSize: "0.72rem", letterSpacing: "0.03em" }, children: label })
    ] }, href);
  }) });
}
export {
  PortalLayout as default
};
