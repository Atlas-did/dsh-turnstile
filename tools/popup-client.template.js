// Client template. Build replaces the INJECT marker with a data snapshot.
window.__ModuleLoader__.load({
  id: "turnstile-popup",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    exports.inject = ["slots"];
    exports.apply = function apply(ctx) {
      var React = require("react");
      var h = React.createElement;
      var FALLBACK = /*__TURNSTILE_DATA__*/null;

      function api(path, init) {
        var t = (location.search.match(/[?&]token=([^&]+)/) || [])[1] || "";
        var url = "/turnstile/" + path + (t ? "?token=" + t : "");
        return fetch(url, Object.assign({ credentials: "include" }, init || {}))
          .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
      }
      function visible(list) {
        // The host route does not compute engine compatibility; merge it from the snapshot.
        var known = {};
        FALLBACK.rows.forEach(function (r) { known[r.name] = r.engineSkipped; });
        return list
          .filter(function (r) { return r.name.indexOf("@deepseek-ai/") !== 0; })
          .map(function (r) {
            return { name: r.name, disabled: !!r.disabled, engineSkipped: known[r.name] || false, row: r.row || "", ui: r.ui || [] };
          });
      }
      // Real slot tree: SlotRegistry.entries() is exposed at runtime (discovered experimentally).
      function slotTree() {
        try {
          var s = ctx.slots;
          var list = (s && typeof s.entries === "function") ? s.entries() : [];
          var arr = Array.isArray(list) ? list : Array.from(list || []);
          return arr.slice(0, 400).map(function (e) {
            return {
              slot: String((e && (e.name || e.slot || e.slotName)) || "?"),
              id: String((e && (e.id || e.key || e.path)) || "?")
            };
          });
        } catch (err) { return []; }
      }
      function Card() {
        var st = React.useState(true), open = st[0], setOpen = st[1];
        var rs = React.useState(visible(FALLBACK.rows)), rows = rs[0], setRows = rs[1];
        var bs = React.useState(""), busy = bs[0], setBusy = bs[1];
        var rp = React.useState(null), report = rp[0], setReport = rp[1];
        var sel = React.useState(null), picked = sel[0], setPicked = sel[1];
        var sl = React.useState([]), slots = sl[0], setSlots = sl[1];
        var oc = React.useState(null), occ = oc[0], setOcc = oc[1];
        React.useEffect(function () {
          api("plugins").then(function (d) { setRows(visible(d.rows)); }).catch(function () {});
          api("report").then(setReport).catch(function () {});
          setSlots(globalSlotsSnapshot());
          api("occupancy").then(setOcc).catch(function () {});
        }, []);
        function reload() {
          return api("plugins").then(function (d) {
            var next = visible(d.rows);
            setRows(next);
            // The property panel holds a snapshot row: refresh it, or the toggle keeps sending
            // the same direction because it reads a stale `disabled`.
            setPicked(function (cur) {
              if (!cur) return null;
              for (var i = 0; i < next.length; i++) if (next[i].name === cur.name) return next[i];
              return null;
            });
          });
        }
        function setAnchor(row, anchor) {
          setBusy(row.name);
          api("anchor", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ package: row.name, anchor: anchor })
          }).then(function () { return api("occupancy"); }).then(setOcc).catch(function (e) {
            console.warn("turnstile anchor failed", e);
          }).then(function () { setBusy(""); });
        }
        function flip(row) {
          setBusy(row.name);
          api("toggle", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ package: row.name, disable: !row.disabled })
          }).then(reload).catch(function (e) { console.warn("turnstile toggle failed", e); })
            .then(function () { setBusy(""); });
        }
        if (!open) return h("button", { onClick: function () { setOpen(true); }, style: { position: "fixed", right: "18px", top: "64px", zIndex: 2147483000, padding: "6px 10px", borderRadius: "8px", border: "1px solid #30363d", background: "#161b22", color: "#d7dee8", cursor: "pointer", fontSize: "12px" } }, "插件 " + rows.length);
        var off = rows.filter(function (r) { return r.disabled; }).length;
        var sk = rows.filter(function (r) { return r.engineSkipped; }).length;
        var hot = {};
        rows.forEach(function (r) { (r.ui || []).forEach(function (u) { hot[u] = (hot[u] || 0) + 1; }); });
        var crowded = Object.keys(hot).filter(function (u) { return hot[u] >= 3; }).length;
        return h("div", { "data-testid": "panel", style: { position: "fixed", right: "18px", top: "64px", zIndex: 2147483000, width: "330px", maxHeight: "50vh", overflow: "auto", display: "flex", flexDirection: "column", background: "#0e1116", color: "#d7dee8", border: "1px solid #30363d", borderRadius: "10px", padding: "12px 14px", fontFamily: "ui-sans-serif,system-ui" } },
          h("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "6px" } },
            h("strong", { style: { fontSize: "13px" } }, "mini · 插件 " + rows.length),
            h("button", { onClick: function () { setOpen(false); }, style: { background: "none", border: 0, color: "#8b96a5", cursor: "pointer" } }, "×")),
          h("div", { style: { color: "#8b96a5", fontSize: "11.5px", marginBottom: "6px" } }, "停用 " + off + " · 引擎跳过 " + sk + " · 挤爆的 UI 面 " + crowded + " · 点一行切换"),
          report ? h("div", { style: { fontSize: "11.5px", marginBottom: "8px", color: "#8b96a5" } },
            "闸门 " + (report.checks || []).length + " 项 · 阻塞 " + ((report.blocking || []).length) + " · " + (report.result || "?")
            + (function () {
                var p = (report.checks || []).filter(function (c) { return c.name === "ui-placement"; })[0];
                return p ? " · 硬编码位置 " + (p.findings || []).length : "";
              })()) : null,
          rows.map(function (r) {
            return h("div", { key: r.name, "data-testid": "row-" + r.name, onClick: function () { setPicked(picked && picked.name === r.name ? null : r); var el = document.querySelector('[data-testid=\"panel\"]'); if (el) el.scrollTop = 0; }, style: { display: "flex", gap: "8px", fontSize: "12.5px", padding: "3px 0", cursor: "pointer", opacity: busy === r.name ? 0.5 : 1 } },
              h("span", { style: { width: "12px", color: r.disabled ? "#f85149" : "#3fb950" } }, r.disabled ? "×" : "·"),
              h("span", { style: { flex: 1, fontFamily: "ui-monospace,monospace" } }, r.name),
              (r.ui && r.ui.length) ? h("span", { title: (r.ui || []).join(", "), style: { color: "#58a6ff", fontSize: "11px" } }, "ui" + r.ui.length) : null,
              r.engineSkipped ? h("span", { style: { color: "#d29922", fontSize: "11px" } }, "skip") : null);
          }),
          slots && slots.length ? h("div", { style: { order: -1, marginBottom: "8px", borderBottom: "1px solid #30363d", paddingBottom: "8px", fontSize: "11.5px", color: "#b8c2cf" } },
            h("div", { style: { color: "#d7dee8" } }, "slot 树 · " + slots.length + " 个注册"),
            (function () {
              var bySlot = {};
              slots.forEach(function (s) { bySlot[s.slot] = s.count; });
              return Object.keys(bySlot).sort().slice(0, 12).map(function (k) {
                return h("div", { key: k, style: { display: "flex", gap: "6px", whiteSpace: "nowrap", overflow: "hidden", lineHeight: "1.5" } },
                  h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontFamily: "ui-monospace,monospace", fontSize: "11px" } }, k),
                  h("span", { style: { color: "#8b96a5", fontSize: "11px" } }, bySlot[k]));
              });
            })()) : null,
          occ && occ.surfaces && occ.surfaces.length ? h("div", { style: { order: -1, marginBottom: "8px", borderBottom: "1px solid #30363d", paddingBottom: "8px", fontSize: "11.5px", color: "#b8c2cf" } },
            h("div", { style: { color: "#d7dee8" } }, "角落占用 · " + occ.findings.length + " 处争用"),
            occ.surfaces.filter(function (s) { return s.contested; }).slice(0, 5).map(function (s) {
              return h("div", { key: s.surface, style: { display: "flex", gap: "6px", whiteSpace: "nowrap", overflow: "hidden" } },
                h("span", { style: { color: "#f85149" } }, "!"),
                h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontFamily: "ui-monospace,monospace", fontSize: "11px" } }, s.surface),
                h("span", { style: { color: "#8b96a5", fontSize: "11px" } }, s.count + " 个 · 硬编码 " + s.hardcoded.length));
            })) : null,
          picked ? h("div", { "data-testid": "detail", style: { order: -1, marginBottom: "8px", borderBottom: "1px solid #30363d", paddingBottom: "8px", fontSize: "11.5px", lineHeight: "1.7", color: "#b8c2cf" } },
            h("div", { style: { fontFamily: "ui-monospace,monospace", color: "#d7dee8" } }, picked.name),
            h("div", null, "行 id: " + (picked.row || "(未声明)")),
            h("div", null, "状态: " + (picked.disabled ? "已停用" : "启用") + (picked.engineSkipped ? " · 引擎跳过" : "")),
            h("div", null, "UI 面: " + ((picked.ui && picked.ui.length) ? picked.ui.join(", ") : "无（宿主侧或自绘）")),
            (function () {
              var cur = null;
              try {
                (occ && occ.surfaces || []).forEach(function (s) {
                  if (s.anchors && s.anchors[picked.name]) cur = s.anchors[picked.name];
                });
              } catch (e) { /* ignore */ }
              // Free-form: the plugin owns the value space, we only refuse YAML-breaking text.
              return h("div", { style: { display: "flex", gap: "4px", alignItems: "center", marginTop: "2px" } },
                h("span", null, "位置:"),
                h("input", {
                  defaultValue: cur || "",
                  placeholder: "例如 bottom-right",
                  disabled: Boolean(busy),
                  onKeyDown: function (e) { if (e.key === "Enter") setAnchor(picked, e.target.value.trim()); },
                  style: { flex: 1, minWidth: 0, background: "#161b22", color: "#d7dee8", border: "1px solid #30363d", borderRadius: "6px", fontSize: "11.5px", padding: "1px 5px" }
                }),
                h("button", { onClick: function (e) { var v = e.target.parentNode.querySelector("input"); setAnchor(picked, v.value.trim()); },
                  style: { padding: "1px 6px", borderRadius: "6px", border: "1px solid #30363d", background: "#161b22", color: "#d7dee8", cursor: "pointer", fontSize: "11.5px" } }, "设"),
                h("button", { onClick: function () { setAnchor(picked, ""); },
                  style: { padding: "1px 6px", borderRadius: "6px", border: "1px solid #30363d", background: "transparent", color: "#8b96a5", cursor: "pointer", fontSize: "11.5px" } }, "清"));
            })(),
            h("div", { style: { marginTop: "6px", display: "flex", gap: "8px" } },
              h("button", { "data-testid": "toggle", onClick: function () { if (!busy) flip(picked); }, style: { padding: "2px 8px", borderRadius: "6px", border: "1px solid #30363d", background: "#161b22", color: "#d7dee8", cursor: "pointer", fontSize: "11.5px" } }, picked.disabled ? "启用" : "停用"),
              h("button", { onClick: function () { setPicked(null); }, style: { padding: "2px 8px", borderRadius: "6px", border: "1px solid #30363d", background: "transparent", color: "#8b96a5", cursor: "pointer", fontSize: "11.5px" } }, "收起"))
          ) : null);
      }

      // Global slots snapshot.
      // SlotRegistry.entries() is scoped to the calling plugin, but the shared store behind every
      // scope (_core.records) holds the whole tree: slot node -> { declaredBy, entries, ... }.
      // This polyfills the API we are proposing upstream (see docs/34-proposal-*).
      function globalSlotsSnapshot() {
        var out = [];
        try {
          var recs = ctx.slots && ctx.slots._core && ctx.slots._core.records;
          if (!recs || typeof recs.forEach !== "function") return out;
          recs.forEach(function (node, slot) {
            var ids = [];
            try {
              var es = node && node.entries;
              if (es && typeof es.forEach === "function") {
                es.forEach(function (e) { ids.push(String((e && (e.id || e.key || e.name)) || "?")); });
              } else if (Array.isArray(es)) {
                es.forEach(function (e) { ids.push(String((e && (e.id || e.key || e.name)) || "?")); });
              }
            } catch (e) { /* ignore */ }
            out.push({
              slot: String(slot),
              declaredBy: String((node && node.declaredBy) || ""),
              count: ids.length,
              entries: ids.slice(0, 30)
            });
          });
        } catch (e) { /* never break the panel */ }
        return out.sort(function (a, b) { return b.count - a.count || a.slot.localeCompare(b.slot); });
      }
      try { window.__DSH_SLOTS_SNAPSHOT__ = globalSlotsSnapshot; } catch (e) { /* ignore */ }

      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({ name: "shell.overlay", id: "turnstile.plugin-list" }, Card);
      });
    };
    return module.exports;
  },
});
