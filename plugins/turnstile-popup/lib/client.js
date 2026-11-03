// Client template. Build replaces the INJECT marker with a data snapshot.
window.__ModuleLoader__.load({
  id: "turnstile-popup",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    exports.inject = ["slots", "layout", "commandUi"];
    exports.apply = function apply(ctx) {
      var React = require("react");
      var h = React.createElement;
      var FALLBACK = {"profile":"<profile>","rows":[]};
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

      // 模块加载时就把 token 抓住：宿主可能在加载后改写 URL（实测会把 ?token= 抹掉），
      // 之后再读 location.search 就空了，写操作会被 401 拒。
      var TOKEN_AT_LOAD = (function () {
        try {
          var m = (location.search.match(/[?&]token=([^&]+)/) || [])[1];
          if (m) { try { sessionStorage.setItem("turnstile-token", m); } catch (e) {} return m; }
          try { return sessionStorage.getItem("turnstile-token") || ""; } catch (e) { return ""; }
        } catch (e) { return ""; }
      })();
      function token() {
        var m = (location.search.match(/[?&]token=([^&]+)/) || [])[1];
        return m || TOKEN_AT_LOAD || "";
      }
      function api(path, init) {
        var t = token();
        var url = "/turnstile/" + path + (t ? (path.indexOf("?") === -1 ? "?" : "&") + "token=" + t : "");
        return fetch(url, Object.assign({ credentials: "include" }, init || {}))
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " · " + path); return r.json(); });
      }
      function visible(list) {
        var known = {};
        return (list || []).filter(function (r) { return r.name.indexOf("@deepseek-ai/") !== 0; }).map(function (r) {
          return { name: r.name, disabled: !!r.disabled, engineSkipped: !!(r.engineSkipped || known[r.name]), row: r.row || "", ui: r.ui || [] };
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
        // 来源由 resolver 判定（公开 snapshot 优先；私有 _core 只算降级）；拿不到就是不可用，不偷偷读私有字段
        var slotsSource = (window.TurnstileSlotsSource && window.TurnstileSlotsSource.resolveSlotsSource)
          ? window.TurnstileSlotsSource.resolveSlotsSource(ctx.slots)
          : { source: 'unavailable', records: null, note: 'resolver 未加载' };
        try { window.__TURNSTILE_SLOTS_SOURCE__ = slotsSource.source; } catch (e) {}
        var recs = slotsSource.source === 'unavailable' ? null : slotsSource.records;
          if (!recs || typeof recs.forEach !== "function") return out;
          recs.forEach(function (node, slot) {
            var ids = [];
            var pickEntryId = function (e) { var o = (e && e.options) || {}; return String(o.id || o.key || (e && (e.id || e.key || e.name)) || "?"); };
            try {
              var es = node && node.entries;
              if (es && typeof es.forEach === "function") es.forEach(function (e) { ids.push(pickEntryId(e)); });
              else if (Array.isArray(es)) es.forEach(function (e) { ids.push(pickEntryId(e)); });
            } catch (e) {}
            // 诊断字段：records 的真实形状（key 名 / entries 形状 / declaredBy 来源）。
            // 只有 DSH_TURNSTILE_DEBUG 打开时才带，正常上报不受影响。
            var diag = null;
            try {
              if (window.__TURNSTILE_DEBUG__) {
                var keys = [];
                try { keys = Object.keys(node || {}); } catch (e) {}
                var es0 = node && node.entries;
                diag = {
                  nodeKeys: keys,
                  entriesType: Object.prototype.toString.call(es0),
                  entriesLen: (es0 && typeof es0.forEach === 'function') ? (function () { var n = 0; es0.forEach(function () { n += 1; }); return n; })() : (Array.isArray(es0) ? es0.length : null),
                  entrySample: (function () {
                    var s = null;
                    try { if (es0 && typeof es0.forEach === 'function') es0.forEach(function (e) { if (!s) s = String(JSON.stringify(e && (e.id ? { id: e.id } : e))).slice(0, 160); }); } catch (e) {}
                    return s;
                  })(),
                };
              }
            } catch (e) {}
            out.push({ slot: String(slot), declaredBy: String((node && node.declaredBy) || ""), count: ids.length, entries: ids.slice(0, 30), diag: diag });
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
        var rr = React.useState(null), runResult = rr[0], setRunResult = rr[1];
        var hlv = React.useState(null), healthVerdict = hlv[0], setHealthVerdict = hlv[1];
        // 档位：mini（灯）→ drawer（抽屉）→ full（完整面板）
        var tr = React.useState("mini"), tier = tr[0], setTier = tr[1];
        var rb = React.useState(""), runBusy = rb[0], setRunBusy = rb[1];
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
          }).catch(function (e) {
            // B11: a failed read must say so; an empty table reads as "no plugins".
            setRows([]);
            setNotice({ kind: "error", text: "插件列表读取失败：" + errorText(e) + "（不是「没有插件」）" });
            throw e;
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
        // 档位一的状态灯：60s 轮询一次 doctor（只读，安全）；收起时也能看到颜色。
        React.useEffect(function () {
          var alive = true;
          function tick() {
            api("run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: "doctor", args: {} }) })
              .then(function (r) { if (alive) setHealthVerdict(r && r.verdict ? r.verdict : "unknown"); })
              .catch(function () { if (alive) setHealthVerdict("unknown"); });
          }
          tick();
          var id = setInterval(tick, 60000);
          return function () { alive = false; clearInterval(id); };
        }, []);
        // 统一入口：面板按钮全部打 /turnstile/run（02 设计 §4）。
        // 读操作直跑；写操作先 dryRun 拿 applyToken，面板上出「确认执行」。
        function runCommandViaRun(name, args, dryRun) {
          setRunBusy(name);
          return api("run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: name, args: args || {}, dryRun: dryRun === true }) })
            .then(function (r) { setRunResult({ name: name, result: r }); return r; })
            .catch(function (e) { setRunResult({ name: name, error: errorText(e) }); })
            .then(function (x) { setRunBusy(""); return x; });
        }
        function runLight(result) {
          if (!result) return C.muted;
          var v = result.verdict;
          if (v === "ok") return "#3fb950";
          if (v === "warn") return "#d29922";
          if (v === "fail") return "#f85149";
          return "#8b949e";
        }
        function runStrip() {
          var buttons = [
            ["doctor", "体检"], ["surfaces", "三查"], ["diagnose", "诊断"], ["slot-report", "槽位"],
          ];
          return h("div", { "data-testid": "run-strip", style: { marginTop: "8px" } },
            h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
              buttons.map(function (b) {
                return h("button", { key: b[0], type: "button", "data-testid": "run-" + b[0], disabled: !!runBusy,
                  onClick: function () { runCommandViaRun(b[0]); }, style: S.button }, runBusy === b[0] ? "…" : b[1]);
              }),
              h("button", { type: "button", "data-testid": "run-snapshot", disabled: !!runBusy,
                onClick: function () { runCommandViaRun("snapshot-take", {}, true); }, style: S.button },
                runBusy === "snapshot-take" ? "…" : "快照")
            ),
            runResult ? h("div", { "data-testid": "run-result", style: { marginTop: "6px", display: "flex", gap: "6px", alignItems: "center", fontSize: "11.5px" } },
              h("span", { style: { width: "8px", height: "8px", borderRadius: "50%", background: runLight(runResult.result) } }),
              h("span", { style: { flex: 1, color: C.muted } }, (runResult.error || (runResult.result && (runResult.result.summary || runResult.result.verdict))) + ""),
              runResult.result && runResult.result.applyToken
                ? h("button", { type: "button", "data-testid": "run-apply", style: S.button,
                    onClick: function () {
                      setRunBusy("apply");
                      api("run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: runResult.name, args: {}, applyToken: runResult.result.applyToken }) })
                        .then(function (r) { setRunResult({ name: runResult.name, result: r }); })
                        .catch(function (e) { setRunResult({ name: runResult.name, error: errorText(e) }); })
                        .then(function () { setRunBusy(""); });
                    } }, "确认执行")
                : null
            ) : null
          );
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

        // 档位二：抽屉（360×420）。六个常用按钮 + 最近 3 条 finding 摘要。
        function drawer() {
          var items = (runResult && runResult.result && runResult.result.findings) || [];
          return h("div", { "data-testid": "drawer", style: { position: "fixed", right: "16px", top: "64px", width: "360px", maxHeight: "420px", overflowY: "auto", zIndex: 2147483000, background: C.bg, color: C.text, border: "1px solid " + C.line, borderRadius: "12px", padding: "12px", boxShadow: "0 18px 60px rgba(0,0,0,.48)" } },
            h("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" } },
              h("span", { "data-testid": "drawer-light", style: { width: "8px", height: "8px", borderRadius: "50%", background: healthVerdict === "ok" ? "#3fb950" : healthVerdict === "warn" ? "#d29922" : healthVerdict === "fail" ? "#f85149" : "#8b949e" } }),
              h("strong", { style: { fontSize: "12.5px", flex: 1 } }, "插件闸门 · " + rows.length),
              h("button", { type: "button", "data-testid": "drawer-close", onClick: function () { setTier("mini"); }, style: S.button }, "收起")
            ),
            // 六个常用按钮（设计 §3 抽屉级）
            h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" } },
              [["doctor", "体检"], ["surfaces", "三查"], ["diagnose", "诊断"], ["slot-report", "槽位"], ["snapshot-take", "快照"], ["doctor", "完整"]].map(function (b, i) {
                var isFull = b[1] === "完整";
                return h("button", { key: b[0] + i, type: "button", "data-testid": "drawer-" + (isFull ? "full" : b[0]), disabled: !isFull && !!runBusy,
                  onClick: function () { if (isFull) { setTier("full"); setOpen(true); } else if (b[0] === "snapshot-take") { runCommandViaRun("snapshot-take", {}, true); } else { runCommandViaRun(b[0]); } },
                  style: Object.assign({}, S.button, { minHeight: "32px" }) }, runBusy === b[0] ? "…" : b[1]);
              })
            ),
            runResult ? h("div", { "data-testid": "drawer-result", style: { marginTop: "8px", fontSize: "11.5px", color: C.muted } },
              (runResult.error || (runResult.result && (runResult.result.summary || runResult.result.verdict)) || "") + "") : null,
            items.length ? h("div", { style: { marginTop: "8px" } },
              h("div", { style: { fontSize: "11px", color: C.muted, marginBottom: "4px" } }, "最近 " + Math.min(3, items.length) + " 条问题"),
              items.slice(0, 3).map(function (f, i) { return h("div", { key: i, "data-testid": "drawer-finding-" + i, style: { fontSize: "11.5px", padding: "4px 0", borderTop: "1px solid " + C.line } }, "· " + (f.title || f.id)); })
            ) : null
          );
        }
        if (tier === "drawer") return drawer();
        if (!open) return h("button", { type: "button", "data-testid": "reopen", onClick: function () { setOpen(true); }, style: Object.assign({}, S.button, { position: "fixed", right: "16px", top: "64px", zIndex: 2147483000, boxShadow: "0 8px 28px rgba(0,0,0,.35)", display: "flex", alignItems: "center", gap: "6px" }) },
          // 档位一：状态下灯（绿/黄/红/灰），颜色来自统一契约的 verdict
          // 点灯进抽屉（档位二），点文字进完整面板（档位三）
          h("span", { "data-testid": "status-light", "data-verdict": healthVerdict || "unknown", role: "button", tabIndex: 0, title: "点这里打开抽屉", onClick: function (e) { e.stopPropagation(); setTier("drawer"); }, style: { width: "8px", height: "8px", borderRadius: "50%", background: runLight(healthVerdict === "ok" ? { verdict: "ok" } : healthVerdict === "warn" ? { verdict: "warn" } : healthVerdict === "fail" ? { verdict: "fail" } : null) } }),
          "插件闸门 · " + rows.length);

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
            h("button", { type: "button", "data-testid": "fs-mode", title: "全屏/专注：把页面铺满（Esc 退出）", "aria-label": "全屏", onClick: function () {
              try {
                if (!document.fullscreenElement) {
                  var req = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
                  if (req && req.catch) req.catch(function () {});
                } else if (document.exitFullscreen) {
                  document.exitFullscreen();
                }
              } catch (e) {}
            }, style: S.button }, "⛶"),
            h("button", { type: "button", "data-testid": "page-open", title: "在宿主内打开搭建好的页面", "aria-label": "页面", onClick: function () {
              var t = (location.search.match(/[?&]token=([^&]+)/) || [])[1] || "";
              var box = document.getElementById("turnstile-page-overlay");
              if (box) { box.remove(); return; }
              box = document.createElement("div");
              box.id = "turnstile-page-overlay";
              box.setAttribute("data-testid", "page-overlay");
              box.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:#0d141c;display:grid;grid-template-rows:38px 1fr";
              var bar = document.createElement("div");
              bar.style.cssText = "display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid #22303d;color:#dce3ea;font:12px ui-sans-serif,system-ui";
              bar.textContent = "页面（搭建器产出·只读）";
              var close = document.createElement("button");
              close.textContent = "关闭";
              close.style.cssText = "margin-left:auto;padding:3px 10px;border:1px solid #2b3a49;border-radius:6px;background:#16212b;color:#dce3ea;cursor:pointer";
              close.onclick = function () { box.remove(); };
              bar.append(close);
              var frame = document.createElement("iframe");
              frame.src = "/turnstile/view" + (t ? "?token=" + encodeURIComponent(t) : "");
              frame.style.cssText = "border:0;width:100%;height:100%;background:#0d141c";
              box.append(bar, frame);
              document.body.append(box);
            }, style: S.button }, "页面"),
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

          runStrip(),

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

      function consoleUrl(view) {
        var t = token();
        return "/turnstile/console" + (t ? "?token=" + encodeURIComponent(t) : "") + "#view=" + (view || "steward");
      }
      function ConsoleFrame(props) {
        return h("iframe", {
          "data-testid": props.testid,
          title: "Turnstile 环境管理控制台",
          src: consoleUrl(props.view),
          style: { display: "block", width: "100%", height: props.main ? "100vh" : "calc(100vh - 170px)", minHeight: props.main ? "560px" : "520px", border: "0", background: "#0b1117" }
        });
      }
      function SidebarIcon(props) {
        var size = props && props.size || 20;
        return h("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" },
          h("path", { d: "M5 4h14v4H5zM5 10h14v10H5zM9 13v4M15 13v4", stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" }));
      }

      // 把观测到的 slot 记录交给宿主存盘（供 tools/ui-atlas.mjs 的运行时列使用）。
      try {
        var t0 = token();
        var sendSlots = function () {
          try {
            fetch("/turnstile/slot-map" + (t0 ? "?token=" + encodeURIComponent(t0) : ""), {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ slots: globalSlotsSnapshot() }),
            }).catch(function () {});
          } catch (e) {}
        };
        sendSlots();
        // 挂载时插件可能还没全部注入，4 秒后再报一次（覆盖晚到的那批）
        setTimeout(sendSlots, 4000);
      } catch (e) {}
      try { window.__DSH_SLOTS_SNAPSHOT__ = globalSlotsSnapshot; } catch (e) {}

      // 四个入口，同一份业务页面：轻量悬浮、设置页、左侧完整页面、斜杠命令。
      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({ name: "shell.overlay", id: "turnstile.plugin-list" }, Card);
      });
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section", id: "turnstile", order: 120,
          label: function () { return "Turnstile 环境管理"; }
        }, function SettingsSection() { return h(ConsoleFrame, { testid: "turnstile-settings", view: "steward" }); });
      });
      ctx.slots.inject("main", function () {
        return ctx.slots.register({ name: "main", key: "turnstile" }, function TurnstileMain() {
          return h(ConsoleFrame, { testid: "turnstile-main", view: "steward", main: true });
        });
      });
      ctx.slots.inject("sidebar.panellist", function () {
        return ctx.slots.register({
          name: "sidebar.panellist", id: "turnstile", order: 60,
          label: function () { return "Turnstile 环境管理"; }
        }, SidebarIcon);
      });
      ctx.effect(function () {
        return ctx.commandUi.register({
          name: "turnstile",
          label: function () { return "打开 Turnstile 环境管理"; },
          description: function () { return "检查插件、切换主 DSH / mini、管理实验环境"; },
          available: function () { return true; },
          ui: { kind: "action", run: function () { ctx.layout.selectPanel("turnstile"); } }
        });
      }, "turnstile: /turnstile command");
    };
    return module.exports;
  },
});
