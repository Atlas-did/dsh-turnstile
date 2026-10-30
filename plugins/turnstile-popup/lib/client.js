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
      var FALLBACK = {"profile":"<profile>","generatedAt":"2026-10-30T08:12:06.071Z","rows":[{"name":"turnstile-probe","disabled":false,"engineSkipped":false},{"name":"dsh-better-sidebar","disabled":false,"engineSkipped":false},{"name":"dsh-context","disabled":true,"engineSkipped":false},{"name":"dsh-genui","disabled":false,"engineSkipped":false},{"name":"dsh-token-diet","disabled":true,"engineSkipped":false},{"name":"@changfenhuang/dsh-annotation","disabled":false,"engineSkipped":false},{"name":"@liustack/modlens","disabled":false,"engineSkipped":false},{"name":"dsh-free-search","disabled":false,"engineSkipped":false},{"name":"dsh-meme","disabled":false,"engineSkipped":false},{"name":"dsh-mimir","disabled":false,"engineSkipped":false},{"name":"dsh-ops","disabled":false,"engineSkipped":false},{"name":"dsh-soul-md","disabled":false,"engineSkipped":false},{"name":"dsh-talk","disabled":false,"engineSkipped":true},{"name":"dsh-tool-call-guard","disabled":false,"engineSkipped":false},{"name":"dsh-univer-office","disabled":false,"engineSkipped":false},{"name":"dsh-unlag","disabled":false,"engineSkipped":false},{"name":"dshmarket","disabled":false,"engineSkipped":false},{"name":"dsh-quicktest","disabled":false,"engineSkipped":false},{"name":"dsh-vibe-math","disabled":false,"engineSkipped":false},{"name":"dsh-ultramath","disabled":false,"engineSkipped":false},{"name":"@mars-sea/dsh-commandcode-provider","disabled":false,"engineSkipped":false},{"name":"dsh-api-dashboard","disabled":false,"engineSkipped":false},{"name":"dsh-voice","disabled":false,"engineSkipped":false},{"name":"dsh-whale-musume","disabled":false,"engineSkipped":false},{"name":"turnstile-popup","disabled":false,"engineSkipped":false}]};
      FALLBACK = FALLBACK || { profile: "mini", rows: [] };
      FALLBACK.rows = FALLBACK.rows || [];

      var C = {
        bg: "#0c1219", panel: "#121b25", raised: "#182431", line: "#283746",
        text: "#e6edf5", muted: "#91a1b2", blue: "#69b7ff", green: "#56d364",
        red: "#ff7b72", amber: "#e3b341"
      };
      var S = {
        button: { minHeight: "30px", padding: "4px 9px", borderRadius: "7px", border: "1px solid " + C.line, background: C.raised, color: C.text, cursor: "pointer", fontSize: "12px" },
        quiet: { minHeight: "30px", padding: "4px 8px", borderRadius: "7px", border: "1px solid transparent", background: "transparent", color: C.muted, cursor: "pointer", fontSize: "12px" },
        input: { width: "100%", boxSizing: "border-box", minHeight: "32px", padding: "5px 9px", borderRadius: "7px", border: "1px solid " + C.line, background: "#0d151e", color: C.text, fontSize: "12px", outline: "none" },
        mono: { fontFamily: "ui-monospace,SFMono-Regular,Consolas,monospace" }
      };

      function api(path, init) {
        var t = (location.search.match(/[?&]token=([^&]+)/) || [])[1] || "";
        var url = "/turnstile/" + path + (t ? (path.indexOf("?") === -1 ? "?" : "&") + "token=" + t : "");
        return fetch(url, Object.assign({ credentials: "include" }, init || {}))
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " · " + path); return r.json(); });
      }
      function visible(list) {
        var known = {};
        FALLBACK.rows.forEach(function (r) { known[r.name] = r.engineSkipped; });
        return (list || []).filter(function (r) { return r.name.indexOf("@deepseek-ai/") !== 0; }).map(function (r) {
          return { name: r.name, disabled: !!r.disabled, engineSkipped: known[r.name] || false, row: r.row || "", ui: r.ui || [] };
        });
      }
      function shortProfile() {
        var p = String(FALLBACK.profile || "mini").replace(/[\\/]+$/, "");
        return p.split(/[\\/]/).pop() || "mini";
      }
      function errorText(err) { return String((err && err.message) || err || "未知错误").slice(0, 140); }
      function badge(text, color) {
        return h("span", { style: { display: "inline-flex", alignItems: "center", minHeight: "20px", padding: "1px 7px", borderRadius: "999px", border: "1px solid " + color, color: color, fontSize: "10.5px", whiteSpace: "nowrap" } }, text);
      }
      function globalSlotsSnapshot() {
        var out = [];
        try {
          var recs = ctx.slots && ctx.slots._core && ctx.slots._core.records;
          if (!recs || typeof recs.forEach !== "function") return out;
          recs.forEach(function (node, slot) {
            var ids = [];
            try {
              var es = node && node.entries;
              if (es && typeof es.forEach === "function") es.forEach(function (e) { ids.push(String((e && (e.id || e.key || e.name)) || "?")); });
              else if (Array.isArray(es)) es.forEach(function (e) { ids.push(String((e && (e.id || e.key || e.name)) || "?")); });
            } catch (e) {}
            out.push({ slot: String(slot), declaredBy: String((node && node.declaredBy) || ""), count: ids.length, entries: ids.slice(0, 30) });
          });
        } catch (e) {}
        return out.sort(function (a, b) { return b.count - a.count || a.slot.localeCompare(b.slot); });
      }

      function Topology(props) {
        var occ = props.occ;
        if (!occ || !occ.surfaces || !occ.surfaces.length) return h("div", { style: { color: C.muted } }, "没有 UI 占用数据。");
        var top = occ.surfaces.slice(0, 6), names = [];
        top.forEach(function (s) { (s.plugins || []).forEach(function (p) { if (names.indexOf(p) === -1) names.push(p); }); });
        names = names.slice(0, 7);
        var rowH = 20, pad = 8, height = Math.max(top.length, names.length) * rowH + pad * 2;
        var nodes = [];
        names.forEach(function (n, i) {
          nodes.push(h("text", { key: "p" + i, x: 2, y: pad + i * rowH + 13, fill: C.text, fontSize: "10px", fontFamily: "ui-monospace,monospace" }, n.length > 17 ? n.slice(0, 16) + "…" : n));
        });
        top.forEach(function (s, i) {
          var y = pad + i * rowH + 13;
          nodes.push(h("text", { key: "s" + i, x: 220, y: y, fill: s.contested ? C.red : C.muted, fontSize: "10px", fontFamily: "ui-monospace,monospace" }, s.surface.length > 17 ? s.surface.slice(0, 16) + "…" : s.surface));
          (s.plugins || []).forEach(function (p) {
            var pi = names.indexOf(p);
            if (pi === -1) return;
            nodes.push(h("line", { key: "l" + i + p, x1: 142, y1: pad + pi * rowH + 9, x2: 214, y2: y - 4, stroke: s.contested ? "rgba(255,123,114,.55)" : "rgba(105,183,255,.35)", strokeWidth: 1 }));
          });
        });
        return h("svg", { "data-testid": "topology", width: "100%", height: height, viewBox: "0 0 340 " + height, role: "img", "aria-label": "插件到 UI 面的连接图" }, nodes);
      }

      function Card() {
        var st = React.useState(true), open = st[0], setOpen = st[1];
        var rs = React.useState(visible(FALLBACK.rows)), rows = rs[0], setRows = rs[1];
        var bs = React.useState(""), busy = bs[0], setBusy = bs[1];
        var pd = React.useState(null), pending = pd[0], setPending = pd[1];
        var rp = React.useState(null), report = rp[0], setReport = rp[1];
        var sel = React.useState(null), picked = sel[0], setPicked = sel[1];
        var sl = React.useState([]), slots = sl[0], setSlots = sl[1];
        var oc = React.useState(null), occ = oc[0], setOcc = oc[1];
        var sx = React.useState({ list: true, checks: false, topology: false, occupancy: false, slots: false }), secs = sx[0], setSecs = sx[1];
        var qs = React.useState(""), query = qs[0], setQuery = qs[1];
        var ns = React.useState(null), notice = ns[0], setNotice = ns[1];
        var im = React.useState(false), inspectMode = im[0], setInspectMode = im[1];
        var ir = React.useState(null), inspectResult = ir[0], setInspectResult = ir[1];
        var ih = React.useState(null), inspectRect = ih[0], setInspectRect = ih[1];
        var ps = React.useState(function () {
          try { var v = JSON.parse(localStorage.getItem("turnstile.panelPos") || "null"); if (v && typeof v.x === "number") return v; } catch (e) {}
          return null;
        }), pos = ps[0], setPos = ps[1];
        var dragRef = React.useRef(null);

        function reloadRows() {
          return api("plugins").then(function (d) {
            var next = visible(d.rows);
            setRows(next);
            setPicked(function (cur) {
              if (!cur) return null;
              for (var i = 0; i < next.length; i++) if (next[i].name === cur.name) return Object.assign({}, next[i], { anchorOptions: cur.anchorOptions || [] });
              return null;
            });
          });
        }
        function refresh() {
          setBusy("refresh");
          var errors = [];
          function capture(label) { return function (e) { errors.push(label + ": " + errorText(e)); }; }
          return Promise.all([
            reloadRows().catch(capture("插件")),
            api("report").then(setReport).catch(capture("报告")),
            api("occupancy").then(setOcc).catch(capture("占用"))
          ]).then(function () {
            setNotice(errors.length ? { kind: "error", text: errors.join("；") } : { kind: "ok", text: "数据已刷新" });
            setBusy("");
          });
        }
        React.useEffect(function () {
          setSlots(globalSlotsSnapshot());
          refresh();
        }, []);
        function ownerAtPoint(x, y) {
          var el = document.elementFromPoint(x, y);
          if (!el) return null;
          var key = Object.keys(el).filter(function (k) { return k.indexOf("__reactFiber$") === 0; })[0];
          var where = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "");
          if (!key) return { slotKey: "", entryId: "", where: where, note: "该节点不在 React 树里" };
          var f = el[key], found = null, component = "";
          for (var i = 0; i < 100 && f; i++) {
            var t = f.type;
            var name = typeof t === "function" ? (t.displayName || t.name || "") : "";
            if (!component && name && name !== "RootEntry") component = name;
            if (name === "RootEntry") {
              var pr = f.memoizedProps || {}, entry = pr.entry || {};
              var id = entry.options && entry.options.id ? String(entry.options.id) : "";
              var candidate = { slotKey: String(pr.slotKey || ""), entryId: id, where: where };
              if (!found || id) found = candidate;
            }
            f = f.return;
          }
          if (found) { found.component = found.entryId ? "" : component; return found; }
          return { slotKey: "", entryId: "", where: where, note: "没有找到 slot 边界" };
        }
        React.useEffect(function () {
          if (!inspectMode) return undefined;
          function onMove(e) {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            if (el) { var r = el.getBoundingClientRect(); setInspectRect({ left: r.left, top: r.top, width: r.width, height: r.height }); }
          }
          function onPick(e) {
            e.preventDefault(); e.stopPropagation();
            var own = ownerAtPoint(e.clientX, e.clientY);
            setInspectResult(own || { note: "没有可取点的元素" });
            setInspectMode(false); setInspectRect(null);
          }
          function onKey(e) { if (e.key === "Escape") { setInspectMode(false); setInspectRect(null); } }
          document.addEventListener("mousemove", onMove, true);
          document.addEventListener("click", onPick, true);
          document.addEventListener("keydown", onKey, true);
          return function () {
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("click", onPick, true);
            document.removeEventListener("keydown", onKey, true);
          };
        }, [inspectMode]);
        function loadAnchorOptions(row) {
          api("anchor-options?package=" + encodeURIComponent(row.name)).then(function (d) {
            setPicked(function (cur) { return cur && cur.name === row.name ? Object.assign({}, cur, { anchorOptions: d.suggestions || [] }) : cur; });
          }).catch(function (e) { setNotice({ kind: "error", text: "位置建议读取失败：" + errorText(e) }); });
        }
        function setAnchor(row, anchor) {
          setBusy(row.name);
          setNotice(null);
          postPlan("anchor", { package: row.name, anchor: anchor })
            .catch(function (e) { setNotice({ kind: "error", text: "位置更新失败：" + errorText(e) }); })
            .then(function () { setBusy(""); });
        }
        // Every write is two-step: the host answers with a plan and a confirmation token; nothing is
        // written until that token comes back. The panel shows the diff instead of writing silently.
        function postPlan(endpoint, payload) {
          return api(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
            .then(function (r) {
              if (r && r.needsConfirm && r.plan) { setPending({ endpoint, payload, plan: r.plan }); setNotice(null); return null; }
              return r;
            });
        }
        function confirmPending() {
          if (!pending) return;
          var p = pending;
          setBusy(p.payload.package || "");
          api(p.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({}, p.payload, { confirm: p.plan.confirm })) })
            .then(function (r) {
              setPending(null);
              if (r && r.ok === false) throw new Error((r.evidence && r.evidence.problems && r.evidence.problems.join(", ")) || "未写入");
              return reloadRows();
            })
            .then(function () { setNotice({ kind: "ok", text: "已写入，重启后生效。" }); })
            .catch(function (e) { setNotice({ kind: "error", text: "写入失败：" + errorText(e) }); })
            .then(function () { setBusy(""); });
        }
        function flip(row) {
          setBusy(row.name);
          setNotice(null);
          postPlan("toggle", { package: row.name, disable: !row.disabled })
            .catch(function (e) { setNotice({ kind: "error", text: "状态切换失败：" + errorText(e) }); })
            .then(function () { setBusy(""); });
        }
        function beginDrag(e) {
          e.preventDefault();
          var panel = document.querySelector('[data-testid="panel"]');
          if (!panel) return;
          var box = panel.getBoundingClientRect(), startX = e.clientX, startY = e.clientY;
          dragRef.current = true;
          function move(ev) {
            if (!dragRef.current) return;
            setPos({
              x: Math.min(window.innerWidth - 80, Math.max(0, box.left + ev.clientX - startX)),
              y: Math.min(window.innerHeight - 40, Math.max(0, box.top + ev.clientY - startY))
            });
          }
          function up() {
            dragRef.current = false;
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            setPos(function (p) { try { if (p) localStorage.setItem("turnstile.panelPos", JSON.stringify(p)); } catch (e) {} return p; });
          }
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
        }
        function section(key, title, body) {
          var isOpen = !!secs[key];
          return h("section", { style: { marginTop: "8px", border: "1px solid " + C.line, borderRadius: "9px", background: C.panel, overflow: "hidden" } },
            h("button", {
              type: "button", "data-testid": "sec-" + key, "aria-expanded": isOpen,
              onClick: function () { var n = Object.assign({}, secs); n[key] = !isOpen; setSecs(n); },
              style: { width: "100%", minHeight: "36px", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", background: "transparent", border: 0, color: C.text, cursor: "pointer", fontSize: "12px", padding: "7px 10px" }
            }, h("span", null, title), h("span", { style: { color: C.muted } }, isOpen ? "▾" : "▸")),
            isOpen ? h("div", { style: { padding: "0 10px 10px", fontSize: "11.5px", color: C.muted } }, body) : null);
        }
        function currentAnchor(row) {
          var cur = "";
          (occ && occ.surfaces || []).forEach(function (s) { if (s.anchors && s.anchors[row.name]) cur = s.anchors[row.name]; });
          return cur;
        }

        if (!open) return h("button", { type: "button", "data-testid": "reopen", onClick: function () { setOpen(true); }, style: Object.assign({}, S.button, { position: "fixed", right: "16px", top: "64px", zIndex: 2147483000, boxShadow: "0 8px 28px rgba(0,0,0,.35)" }) }, "插件闸门 · " + rows.length);

        var off = rows.filter(function (r) { return r.disabled; }).length;
        var skipped = rows.filter(function (r) { return r.engineSkipped; }).length;
        var contested = occ && occ.findings ? occ.findings.length : 0;
        var blocking = report ? (report.blocking || []).length : 0;
        var gateColor = !report ? C.muted : blocking ? C.red : C.green;
        var gateText = !report ? "报告不可用" : blocking ? "发现 " + blocking + " 项阻塞" : "检查通过";
        var q = query.trim().toLowerCase();
        var filtered = rows.filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) !== -1; });
        var anchor = picked ? currentAnchor(picked) : "";

        return h("div", {
          "data-testid": "panel",
          style: { position: "fixed", left: pos ? pos.x : undefined, top: pos ? pos.y : "56px", right: pos ? "auto" : "16px", zIndex: 2147483000, width: "min(390px, calc(100vw - 24px))", maxHeight: "min(80vh, 780px)", overflowY: "auto", boxSizing: "border-box", background: C.bg, color: C.text, border: "1px solid " + C.line, borderRadius: "14px", padding: "14px", boxShadow: "0 18px 60px rgba(0,0,0,.48)", fontFamily: "ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif", fontSize: "12px" }
        },
          inspectMode && inspectRect ? h("div", { "data-testid": "inspect-highlight", style: { position: "fixed", left: inspectRect.left, top: inspectRect.top, width: inspectRect.width, height: inspectRect.height, border: "2px solid " + C.amber, background: "rgba(227,179,65,.10)", boxSizing: "border-box", pointerEvents: "none", zIndex: 2147483001 } }) : null,
          h("header", { style: { display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "12px" } },
            h("div", { "data-testid": "drag-handle", title: "拖动面板", onMouseDown: beginDrag, style: { flex: 1, cursor: "grab", userSelect: "none" } },
              h("div", { style: { fontSize: "16px", fontWeight: 650, letterSpacing: ".01em" } }, "插件闸门"),
              h("div", { style: { color: C.muted, fontSize: "11px", marginTop: "2px" } }, shortProfile() + " · 安装前检查与界面占用")),
            h("button", { type: "button", "data-testid": "inspect", title: "准星：点选页面元素，解析 slot 与条目归属", "aria-label": "准星定位", "aria-pressed": inspectMode, onClick: function () { setInspectMode(!inspectMode); setInspectRect(null); }, style: Object.assign({}, S.button, { borderColor: inspectMode ? C.amber : C.line, color: inspectMode ? C.amber : C.text }) }, inspectMode ? "点选目标" : "准星"),
            h("button", { type: "button", "data-testid": "console-open", title: "在浏览器中打开完整控制台", "aria-label": "打开完整控制台", onClick: function () { var t = (location.search.match(/[?&]token=([^&]+)/) || [])[1] || ""; window.open("/turnstile/console" + (t ? "?token=" + encodeURIComponent(t) : ""), "_blank", "noopener"); }, style: S.button }, "全窗口"),
            h("button", { type: "button", "data-testid": "refresh", title: "重新读取面板数据", "aria-label": "刷新", disabled: Boolean(busy), onClick: refresh, style: Object.assign({}, S.quiet, { opacity: busy ? .5 : 1 }) }, busy === "refresh" ? "…" : "↻"),
            h("button", { type: "button", "data-testid": "close", title: "收起面板", "aria-label": "收起", onClick: function () { setOpen(false); }, style: S.quiet }, "×")),

          h("button", { type: "button", "data-testid": "gate-badge", onClick: function () { var n = Object.assign({}, secs); n.checks = !n.checks; setSecs(n); }, style: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", padding: "11px 12px", borderRadius: "10px", border: "1px solid " + gateColor, background: blocking ? "rgba(255,123,114,.07)" : "rgba(86,211,100,.05)", color: gateColor, cursor: "pointer" } },
            h("span", null, h("strong", { style: { fontSize: "13px" } }, gateText), h("span", { style: { display: "block", color: C.muted, fontSize: "10.5px", marginTop: "3px" } }, report ? (report.checks || []).length + " 项检查 · 点击查看明细" : "缺少报告时不会假定检查通过")),
            h("span", { style: { fontSize: "18px" } }, blocking ? "!" : report ? "✓" : "?")),

          h("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginTop: "8px" } },
            [[rows.length, "插件"], [off, "停用"], [skipped, "引擎跳过"], [contested, "UI 争用"]].map(function (m) {
              return h("div", { key: m[1], style: { padding: "8px 4px", textAlign: "center", borderRadius: "8px", background: C.panel, border: "1px solid " + C.line } },
                h("div", { style: { fontSize: "16px", fontWeight: 650 } }, m[0]), h("div", { style: { color: C.muted, fontSize: "10px", marginTop: "2px" } }, m[1]));
            })),

          pending ? h("div", { "data-testid": "confirm", style: { marginTop: "8px", padding: "8px 10px", borderRadius: "8px", border: "1px solid " + C.amber, background: C.panel, fontSize: "11px", lineHeight: 1.5 } },
            h("div", { style: { color: C.muted } }, "将写入 " + String(pending.plan.file || "").split(/[\\/]/).pop() + " · " + String(pending.plan.beforeSha || "新建").slice(0, 8) + " → " + String(pending.plan.afterSha || "").slice(0, 8)),
            h("div", { style: { display: "flex", gap: "6px", marginTop: "6px", alignItems: "center" } },
              h("code", { "data-testid": "confirm-token", style: { color: C.amber } }, pending.plan.confirm),
              h("button", { type: "button", "data-testid": "confirm-apply", onClick: confirmPending, style: Object.assign({}, S.button, { marginLeft: "auto", borderColor: C.amber }) }, "确认写入"),
              h("button", { type: "button", "data-testid": "confirm-cancel", onClick: function () { setPending(null); }, style: S.button }, "取消"))) : null,
          notice ? h("div", { "data-testid": "notice", role: "status", style: { marginTop: "8px", padding: "8px 10px", borderRadius: "8px", border: "1px solid " + (notice.kind === "error" ? C.red : C.line), color: notice.kind === "error" ? C.red : C.muted, background: C.panel, fontSize: "11px", lineHeight: 1.5, wordBreak: "break-word" } }, notice.text) : null,

          inspectResult ? h("div", { "data-testid": "inspect-result", style: { marginTop: "8px", padding: "9px 10px", borderRadius: "8px", border: "1px solid " + C.blue, background: C.panel, fontSize: "11px", lineHeight: 1.55 } },
            h("strong", null, "像素归属"),
            h("div", { style: S.mono }, inspectResult.slotKey ? "slot: " + inspectResult.slotKey : inspectResult.where || "未识别"),
            inspectResult.entryId ? h("div", { style: S.mono }, "entry: " + inspectResult.entryId) : null,
            inspectResult.component ? h("div", { style: S.mono }, "组件: " + inspectResult.component) : null,
            h("div", { style: { color: C.muted } }, inspectResult.note || "已定位到 slot 条目；RootEntry 未提供可靠插件包名，不做猜测。")) : null,

          picked ? h("div", { "data-testid": "detail", style: { marginTop: "8px", padding: "11px", borderRadius: "10px", border: "1px solid " + C.blue, background: C.panel } },
            h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
              h("strong", { style: Object.assign({ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }, S.mono) }, picked.name),
              picked.disabled ? badge("已停用", C.red) : badge("启用", C.green)),
            h("div", { "data-testid": "row-id", style: { marginTop: "8px", color: C.muted, fontSize: "11px" } }, "行 id："),
            h("div", { style: Object.assign({ color: C.text, fontSize: "11.5px", wordBreak: "break-all" }, S.mono) }, picked.row || "（未声明）"),
            h("div", { style: { marginTop: "6px", color: C.muted, fontSize: "11px", lineHeight: 1.5 } }, "UI 面：" + ((picked.ui && picked.ui.length) ? picked.ui.join(", ") : "无（宿主侧或自绘）")),
            h("label", { style: { display: "block", marginTop: "10px", color: C.muted, fontSize: "11px" } }, "位置"),
            h("div", { style: { display: "flex", gap: "6px", marginTop: "4px" } },
              h("input", { key: picked.name + ":" + anchor, "data-testid": "anchor-input", defaultValue: anchor, list: "anchor-opts-" + picked.name.replace(/[^\w-]/g, "_"), placeholder: "例如 bottom-right", disabled: Boolean(busy), onKeyDown: function (e) { if (e.key === "Enter") setAnchor(picked, e.target.value.trim()); }, style: Object.assign({}, S.input, { flex: 1, minWidth: 0 }) }),
              h("datalist", { id: "anchor-opts-" + picked.name.replace(/[^\w-]/g, "_") }, (picked.anchorOptions || []).map(function (a) { return h("option", { key: a, value: a }); })),
              h("button", { type: "button", "data-testid": "anchor-apply", disabled: Boolean(busy), onClick: function (e) { var input = e.currentTarget.parentNode.querySelector("input"); setAnchor(picked, input.value.trim()); }, style: S.button }, "设置"),
              h("button", { type: "button", "data-testid": "anchor-clear", disabled: Boolean(busy), onClick: function () { setAnchor(picked, ""); }, style: S.quiet }, "清除")),
            h("div", { style: { display: "flex", gap: "6px", marginTop: "10px" } },
              h("button", { type: "button", "data-testid": "toggle", disabled: Boolean(busy), onClick: function () { flip(picked); }, style: Object.assign({}, S.button, { borderColor: picked.disabled ? C.green : C.red }) }, picked.disabled ? "启用插件" : "停用插件"),
              h("button", { type: "button", "data-testid": "detail-close", onClick: function () { setPicked(null); }, style: S.quiet }, "收起"))) : null,

          h("div", { style: { marginTop: "10px" } },
            h("input", { "data-testid": "search", value: query, onChange: function (e) { setQuery(e.target.value); }, placeholder: "搜索插件…", "aria-label": "搜索插件", style: S.input })),

          section("list", "插件列表 · " + filtered.length + " / " + rows.length,
            filtered.length ? h("div", { style: { display: "grid", gap: "4px" } }, filtered.map(function (r) {
              return h("button", {
                type: "button", key: r.name, "data-testid": "row-" + r.name, "aria-pressed": Boolean(picked && picked.name === r.name),
                onClick: function () { var same = picked && picked.name === r.name; setPicked(same ? null : r); if (!same) loadAnchorOptions(r); },
                style: { width: "100%", minHeight: "38px", display: "flex", alignItems: "center", gap: "8px", textAlign: "left", padding: "6px 8px", borderRadius: "7px", border: "1px solid " + (picked && picked.name === r.name ? C.blue : "transparent"), background: picked && picked.name === r.name ? C.raised : "transparent", color: C.text, cursor: "pointer", opacity: busy === r.name ? .5 : 1 }
              },
                h("span", { style: Object.assign({ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontSize: "11.5px" }, S.mono) }, r.name),
                r.ui && r.ui.length ? badge("UI " + r.ui.length, C.blue) : null,
                r.engineSkipped ? badge("跳过", C.amber) : badge(r.disabled ? "停用" : "运行", r.disabled ? C.red : C.green));
            })) : h("div", { "data-testid": "empty-list", style: { padding: "12px 4px", textAlign: "center" } }, "没有匹配“" + query + "”的插件。")),

          section("checks", "检查明细 · " + (report ? (report.checks || []).length : 0),
            report ? h("div", { style: { display: "grid", gap: "5px" } }, (report.checks || []).map(function (c) {
              return h("div", { key: c.name, style: { display: "flex", gap: "8px", alignItems: "center" } },
                h("span", { style: Object.assign({ flex: 1 }, S.mono) }, c.name),
                h("span", { style: { color: c.ok ? C.green : C.amber } }, c.ok ? "PASS" : "CHECK"),
                h("span", null, (c.findings || []).length + " 项"));
            })) : "未读取到报告。请先运行 preflight，并确认报告目录配置一致。"),

          section("topology", "UI 拓扑", h(Topology, { occ: occ })),

          section("occupancy", "UI 占用 · " + contested + " 处争用",
            occ && occ.surfaces && occ.surfaces.length ? h("div", { style: { display: "grid", gap: "6px" } }, occ.surfaces.map(function (s) {
              return h("div", { key: s.surface, style: { paddingBottom: "5px", borderBottom: "1px solid " + C.line } },
                h("div", { style: { display: "flex", gap: "6px" } },
                  h("span", { style: Object.assign({ flex: 1, color: s.contested ? C.red : C.text }, S.mono) }, s.surface),
                  h("span", null, s.count + " 个插件")),
                h("div", { style: { marginTop: "3px", fontSize: "10.5px" } }, s.contested ? "存在争用；硬编码 " + (s.hardcoded || []).length + " 个。请用 CLI 的 fuse/anchor 审查调整。" : "未发现争用。"));
            })) : "没有 UI 占用数据。"),

          section("slots", "slot 树 · " + slots.length,
            slots.length ? h("div", { style: { display: "grid", gap: "4px" } }, slots.slice(0, 20).map(function (s) {
              return h("div", { key: s.slot, style: { display: "flex", gap: "8px" } }, h("span", { style: Object.assign({ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }, S.mono) }, s.slot), h("span", null, s.count));
            })) : "宿主没有暴露全局 slot 数据。"),

          h("footer", { style: { marginTop: "10px", color: C.muted, fontSize: "10.5px", lineHeight: 1.5 } }, "写操作会保留备份；插件状态与位置变更需重启 DSH 后生效。"));
      }

      try { window.__DSH_SLOTS_SNAPSHOT__ = globalSlotsSnapshot; } catch (e) {}
      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({ name: "shell.overlay", id: "turnstile.plugin-list" }, Card);
      });
    };
    return module.exports;
  },
});
