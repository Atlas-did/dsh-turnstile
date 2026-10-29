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
            return { name: r.name, disabled: !!r.disabled, engineSkipped: known[r.name] || false, row: r.row || "" };
          });
      }
      function Card() {
        var st = React.useState(true), open = st[0], setOpen = st[1];
        var rs = React.useState(visible(FALLBACK.rows)), rows = rs[0], setRows = rs[1];
        var bs = React.useState(""), busy = bs[0], setBusy = bs[1];
        React.useEffect(function () {
          api("plugins").then(function (d) { setRows(visible(d.rows)); }).catch(function () {});
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
        return h("div", { style: { position: "fixed", right: "18px", bottom: "18px", zIndex: 9999, width: "330px", maxHeight: "50vh", overflow: "auto", background: "#0e1116", color: "#d7dee8", border: "1px solid #30363d", borderRadius: "10px", padding: "12px 14px", fontFamily: "ui-sans-serif,system-ui" } },
          h("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "6px" } },
            h("strong", { style: { fontSize: "13px" } }, "mini · 插件 " + rows.length),
            h("button", { onClick: function () { setOpen(false); }, style: { background: "none", border: 0, color: "#8b96a5", cursor: "pointer" } }, "×")),
          h("div", { style: { color: "#8b96a5", fontSize: "11.5px", marginBottom: "8px" } }, "停用 " + off + " · 引擎跳过 " + sk + " · 点一行切换"),
          rows.map(function (r) {
            return h("div", { key: r.name, onClick: function () { if (!busy) flip(r); }, style: { display: "flex", gap: "8px", fontSize: "12.5px", padding: "3px 0", cursor: "pointer", opacity: busy === r.name ? 0.5 : 1 } },
              h("span", { style: { width: "12px", color: r.disabled ? "#f85149" : "#3fb950" } }, r.disabled ? "×" : "·"),
              h("span", { style: { flex: 1, fontFamily: "ui-monospace,monospace" } }, r.name),
              r.engineSkipped ? h("span", { style: { color: "#d29922", fontSize: "11px" } }, "skip") : null);
          }));
      }
      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({ name: "shell.overlay", id: "turnstile.plugin-list" }, Card);
      });
    };
    return module.exports;
  },
});
