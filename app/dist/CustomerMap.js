import { jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
const STATUS_COLORS = {
  active: "#7dffaa",
  trialing: "#7dffaa",
  past_due: "#ffb060",
  unpaid: "#ff8080",
  canceled: "rgba(212,230,202,0.3)",
  inactive: "rgba(212,230,202,0.3)"
};
function CustomerMap({ customers = [], mapsKey, height = 400, compact = false }) {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
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
  useEffect(() => {
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
  useEffect(() => {
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
    return /* @__PURE__ */ jsx("div", { style: { padding: 12, borderRadius: 8, background: "linear-gradient(165deg, rgba(125,255,170,0.05), rgba(201,168,76,0.022))", color: "rgba(212,230,202,0.5)", fontSize: "0.85rem" }, children: "Map unavailable (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set)" });
  }
  return /* @__PURE__ */ jsx("div", { ref: mapRef, style: { height, width: "100%", borderRadius: 12, border: "1px solid rgba(122,171,130,0.2)", overflow: "hidden", background: "#0d1a10" }, children: !loaded && /* @__PURE__ */ jsx("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(212,230,202,0.3)", fontSize: "0.88rem" }, children: "Loading map\u2026" }) });
}
export {
  CustomerMap as default
};
