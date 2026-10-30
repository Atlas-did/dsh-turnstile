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
        var sl = React.useState(null), slots = sl[0], setSlots = sl[1];
        React.useEffect(function () {
          api("plugins").then(function (d) { setRows(visible(d.rows)); }).catch(function () {});
          api("report").then(setReport).catch(function () {});
          setSlots(slotTree());
        }, []);
        function reload() { return api("plugins").then(function (d) { setRows(visible(d.rows)); }); }
        function flip(row) {
          setBusy(row.name);
          api("toggle", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ package: row.name, disable: !row.disabled })
          }).then(reload).catch(function (e) { console.warn("turnstile toggle failed", e); })
            .then(function () { setBusy(""); });
        }
        if (!open) return h("button", { onClick: function () { setOpen(true); }, style: { position: "fixed", right: "18px", bottom: "18px", zIndex: 9999, padding: "6px 10px", borderRadius: "8px", border: "1px solid #30363d", background: "#161b22", color: "#d7dee8", cursor: "pointer", fontSize: "12px" } }, "插件 " + rows.length);
        var off = rows.filter(function (r) { return r.disabled; }).length;
        var sk = rows.filter(function (r) { return r.engineSkipped; }).length;
        var hot = {};
        rows.forEach(function (r) { (r.ui || []).forEach(function (u) { hot[u] = (hot[u] || 0) + 1; }); });
        var crowded = Object.keys(hot).filter(function (u) { return hot[u] >= 3; }).length;
        return h("div", { style: { position: "fixed", right: "18px", bottom: "18px", zIndex: 9999, width: "330px", maxHeight: "50vh", overflow: "auto", display: "flex", flexDirection: "column", background: "#0e1116", color: "#d7dee8", border: "1px solid #30363d", borderRadius: "10px", padding: "12px 14px", fontFamily: "ui-sans-serif,system-ui" } },
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
            return h("div", { key: r.name, onClick: function () { setPicked(picked && picked.name === r.name ? null : r); }, style: { display: "flex", gap: "8px", fontSize: "12.5px", padding: "3px 0", cursor: "pointer", opacity: busy === r.name ? 0.5 : 1 } },
              h("span", { style: { width: "12px", color: r.disabled ? "#f85149" : "#3fb950" } }, r.disabled ? "×" : "·"),
              h("span", { style: { flex: 1, fontFamily: "ui-monospace,monospace" } }, r.name),
              (r.ui && r.ui.length) ? h("span", { title: (r.ui || []).join(", "), style: { color: "#58a6ff", fontSize: "11px" } }, "ui" + r.ui.length) : null,
              r.engineSkipped ? h("span", { style: { color: "#d29922", fontSize: "11px" } }, "skip") : null);
          }),
          slots && slots.length ? h("div", { style: { order: -1, marginBottom: "8px", borderBottom: "1px solid #30363d", paddingBottom: "8px", fontSize: "11.5px", color: "#b8c2cf" } },
            h("div", { style: { color: "#d7dee8" } }, "slot 树 · " + slots.length + " 个注册"),
            (function () {
              var bySlot = {};
              slots.forEach(function (s) { bySlot[s.slot] = (bySlot[s.slot] || 0) + 1; });
              return Object.keys(bySlot).sort().slice(0, 12).map(function (k) {
                return h("div", { key: k, style: { display: "flex", gap: "6px" } },
                  h("span", { style: { flex: 1, fontFamily: "ui-monospace,monospace" } }, k),
                  h("span", { style: { color: "#8b96a5" } }, bySlot[k]));
              });
            })()) : null,
          picked ? h("div", { style: { order: -1, marginBottom: "8px", borderBottom: "1px solid #30363d", paddingBottom: "8px", fontSize: "11.5px", lineHeight: "1.7", color: "#b8c2cf" } },
            h("div", { style: { fontFamily: "ui-monospace,monospace", color: "#d7dee8" } }, picked.name),
            h("div", null, "行 id: " + (picked.row || "(未声明)")),
            h("div", null, "状态: " + (picked.disabled ? "已停用" : "启用") + (picked.engineSkipped ? " · 引擎跳过" : "")),
            h("div", null, "UI 面: " + ((picked.ui && picked.ui.length) ? picked.ui.join(", ") : "无（宿主侧或自绘）")),
            h("div", { style: { marginTop: "6px", display: "flex", gap: "8px" } },
              h("button", { onClick: function () { if (!busy) flip(picked); }, style: { padding: "2px 8px", borderRadius: "6px", border: "1px solid #30363d", background: "#161b22", color: "#d7dee8", cursor: "pointer", fontSize: "11.5px" } }, picked.disabled ? "启用" : "停用"),
              h("button", { onClick: function () { setPicked(null); }, style: { padding: "2px 8px", borderRadius: "6px", border: "1px solid #30363d", background: "transparent", color: "#8b96a5", cursor: "pointer", fontSize: "11.5px" } }, "收起"))
          ) : null);
      }

      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({ name: "shell.overlay", id: "turnstile.plugin-list" }, Card);
      });
    };
    return module.exports;
  },
});
