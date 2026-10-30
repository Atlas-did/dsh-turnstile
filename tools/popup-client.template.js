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
      // Compact topology: plugins on the left, UI surfaces on the right, one line per membership.
      // Contended surfaces (2+ plugins, at least one hardcoded) are drawn red.
      function Topology(props) {
        var occ = props.occ;
        if (!occ || !occ.surfaces || !occ.surfaces.length) return null;
        var top = occ.surfaces.slice(0, 6);
        var names = [];
        top.forEach(function (s) { s.plugins.forEach(function (p) { if (names.indexOf(p) === -1) names.push(p); }); });
        names = names.slice(0, 8);
        var rowH = 18, pad = 6;
        var height = Math.max(top.length, names.length) * rowH + pad * 2;
        var nodes = [];
        names.forEach(function (n, i) {
          nodes.push(h("text", { key: "p" + i, x: 2, y: pad + i * rowH + 12, fill: "#b8c2cf", fontSize: "9.5px", fontFamily: "ui-monospace,monospace" }, n.length > 16 ? n.slice(0, 15) + "…" : n));
        });
        top.forEach(function (s, i) {
          var y = pad + i * rowH + 12;
          nodes.push(h("text", { key: "s" + i, x: 190, y: y, fill: s.contested ? "#f85149" : "#8b96a5", fontSize: "9.5px", fontFamily: "ui-monospace,monospace" }, s.surface.length > 18 ? s.surface.slice(0, 17) + "…" : s.surface));
          s.plugins.forEach(function (p) {
            var pi = names.indexOf(p);
            if (pi === -1) return;
            nodes.push(h("line", { key: "l" + i + p, x1: 128, y1: pad + pi * rowH + 8, x2: 188, y2: y - 3,
              stroke: s.contested ? "rgba(248,81,73,0.55)" : "rgba(88,166,255,0.35)", strokeWidth: 1 }));
          });
        });
        return h("div", { style: { order: -1, marginBottom: "8px", borderBottom: "1px solid #30363d", paddingBottom: "8px" } },
          h("div", { style: { color: "#d7dee8", fontSize: "11.5px", marginBottom: "2px" } }, "拓扑 · 插件 → UI 面"),
          h("svg", { width: "100%", height: height, viewBox: "0 0 306 " + height }, nodes));
      }

      function SettingsSection() {
        var tab = React.useState("概览"), active = tab[0], setActive = tab[1];
        var data = React.useState({ rows: [], occ: null, err: "", delta: null }), d = data[0], setData = data[1];
        var selRow = React.useState(null), chosen = selRow[0], setChosen = selRow[1];
        var qv = React.useState(""), q = qv[0], setQ = qv[1];
        function hit(text) { return !q || String(text || "").toLowerCase().indexOf(q.toLowerCase()) !== -1; }
        var act = React.useState(null), activity = act[0], setActivity = act[1];
        React.useEffect(function () {
          Promise.all([api("plugins").catch(function () { return null; }), api("occupancy").catch(function () { return null; }), api("activity").catch(function () { return null; })])
            .then(function (res) {
              setData({ rows: (res[0] && res[0].rows) || [], occ: res[1], err: "", delta: res[0] ? res[0].delta : null });
              setActivity(res[2] || null);
            })
            .catch(function (e) { setData({ rows: [], occ: null, err: String(e && e.message || e) }); });
        }, []);
        var delta = d.delta || null;
        var deltaLine = "";
        if (delta && !delta.firstRun) {
          var parts = [];
          if (delta.added.length) parts.push("+" + delta.added.length + " 新装");
          if (delta.removed.length) parts.push("-" + delta.removed.length + " 卸载");
          if (delta.toggled.length) parts.push(delta.toggled.length + " 状态变更");
          deltaLine = parts.length ? ("自上次查看: " + parts.join(" · ")) : "自上次查看: 无变化";
        } else if (delta && delta.firstRun) {
          deltaLine = "首次查看，已记下基线";
        }
        function deltaMark(name) {
          if (!delta || delta.firstRun) return "";
          if (delta.added.indexOf(name) !== -1) return "＋";
          if (delta.toggled.some(function (t) { return t.name === name; })) return "⟳";
          return "";
        }
        var pages = ["概览", "架构图", "占用", "插件", "控制台"];
        var rows = d.rows || [];
        var surfaces = (d.occ && d.occ.surfaces) || [];
        function table(cols, body) {
          return h("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "12.5px" } },
            h("thead", null, h("tr", null, cols.map(function (c, i) {
              return h("th", { key: i, style: { textAlign: c.num ? "right" : "left", padding: "6px 10px", borderBottom: "1px solid #d8dee4", color: "#57606a", fontWeight: 600, whiteSpace: "nowrap" } }, c.title);
            }))),
            h("tbody", null, body));
        }
        function cell(text, style) {
          return h("td", { style: Object.assign({ padding: "5px 10px", borderBottom: "1px solid #eef1f4", whiteSpace: "nowrap" }, style || {}) }, text);
        }
        var content = null;
        if (active === "插件") {
          content = table([{ title: "插件" }, { title: "状态" }, { title: "UI 面", num: true }, { title: "位置" }],
            rows.filter(function (r) { return hit(r.name) || hit(r.row) || (r.ui || []).some(hit); }).map(function (r) {
              return h("tr", { key: r.name, "data-testid": "srow-" + r.name, onClick: function () { setChosen(chosen && chosen.name === r.name ? null : r); }, style: { cursor: "pointer", background: chosen && chosen.name === r.name ? "#eff6ff" : "transparent" } },
                cell(h("span", null, deltaMark(r.name) + (r.disabled ? "× " : "· ") + r.name), { fontFamily: "ui-monospace,monospace", color: deltaMark(r.name) === "＋" ? "#0969da" : undefined }),
                cell(r.disabled ? "停用" : (r.engineSkipped ? "引擎跳过" : "启用"), { color: r.disabled ? "#cf222e" : (r.engineSkipped ? "#9a6700" : "#1a7f37") }),
                cell(((r.ui && r.ui.length) || 0), { textAlign: "right", fontFamily: "ui-monospace,monospace" }),
                (function () {
                  var anchor = null;
                  surfaces.forEach(function (s) { if (s.anchors && s.anchors[r.name]) anchor = s.anchors[r.name]; });
                  return cell(anchor ? anchor : "硬编码", { color: anchor ? "#1f6feb" : "#9a6700", fontFamily: anchor ? "ui-monospace,monospace" : undefined });
                })());
            }));
        } else if (active === "占用") {
          content = table([{ title: "UI 面" }, { title: "插件数", num: true }, { title: "硬编码", num: true }, { title: "插件" }],
            surfaces.filter(function (s) { return hit(s.surface) || (s.plugins || []).some(hit); }).map(function (s) {
              return h("tr", { key: s.surface },
                cell(s.surface, { fontFamily: "ui-monospace,monospace" }),
                cell(s.count, { textAlign: "right" }),
                cell((s.hardcoded && s.hardcoded.length) || 0, { textAlign: "right", color: (s.hardcoded && s.hardcoded.length) ? "#9a6700" : "#57606a" }),
                cell((s.plugins || []).join(", "), { maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", color: "#57606a", fontSize: "11.5px" }));
            }));
        } else if (active === "控制台") {
          content = h("div", { "data-testid": "console-view" },
            h("div", { style: { color: "#57606a", marginBottom: "8px" } }, activity
              ? "面板请求: " + Object.keys(activity.calls || {}).map(function (k) { return k + "×" + activity.calls[k]; }).join("   ")
              : "读取中…"),
            activity && activity.note ? h("div", { style: { color: "#9a6700", marginBottom: "8px" } }, activity.note) : null,
            (activity && activity.tail || []).length
              ? h("div", { style: { fontFamily: "ui-monospace,monospace", fontSize: "11.5px", lineHeight: "1.7" } }, activity.tail.map(function (l, i) { return h("div", { key: i, style: { color: /error|fatal|fail/i.test(l) ? "#cf222e" : "#57606a" } }, l); }))
              : h("div", { style: { color: "#8b96a5" } }, "最近 40 行没有异常或激活记录。"));
        } else if (active === "架构图") {
          var tk = "";
          try { tk = new URLSearchParams(window.location.search).get("token") || ""; } catch (e) { tk = ""; }
          content = h("div", null,
            h("div", { style: { marginBottom: "8px", display: "flex", gap: "8px", alignItems: "center" } },
              h("a", { href: "/turnstile/arch?token=" + encodeURIComponent(tk), target: "_blank", rel: "noopener", style: { fontSize: "12px", whiteSpace: "nowrap" } }, "在新窗口打开"),
              h("span", { style: { color: "#8b96a5", fontSize: "11.5px" } }, "由 occupancy 数据生成；没有图时先跑 tools/arch-graph.mjs")),
            h("iframe", { src: "/turnstile/arch?token=" + encodeURIComponent(tk), style: { width: "100%", height: "56vh", border: "1px solid #d8dee4", borderRadius: "8px", background: "#fff" } }));
        } else {
          content = h("div", { "data-testid": "settings-stub" }, active === "概览"
            ? "共 " + rows.length + " 个插件，" + surfaces.length + " 个 UI 面（" + surfaces.filter(function (s) { return s.contested; }).length + " 处争用）"
            : "骨架阶段：这一页还没有接数据。");
        }
        var detail = null;
        if (chosen) {
          var anchorVal = null;
          surfaces.forEach(function (s) { if (s.anchors && s.anchors[chosen.name]) anchorVal = s.anchors[chosen.name]; });
          detail = h("div", { "data-testid": "sp-detail", style: { marginTop: "10px", padding: "10px 12px", background: "#f6f8fa", borderRadius: "8px", fontSize: "12px" } },
            h("div", { style: { fontWeight: "600", marginBottom: "6px", fontFamily: "ui-monospace,monospace" } }, chosen.name),
            h("div", { style: { display: "grid", gridTemplateColumns: "90px 1fr", rowGap: "2px" } },
              h("span", { style: { color: "#57606a" } }, "行 id"), h("span", null, chosen.row || "(未声明)"),
              h("span", { style: { color: "#57606a" } }, "状态"), h("span", null, chosen.disabled ? "停用" : (chosen.engineSkipped ? "引擎跳过" : "启用")),
              h("span", { style: { color: "#57606a" } }, "UI 面"), h("span", null, ((chosen.ui && chosen.ui.length) || 0) + " 个"),
              h("span", { style: { color: "#57606a" } }, "位置"), h("span", null, anchorVal || "硬编码（改配置无效）")));
        }
        return h("div", { "data-testid": "settings-shell", style: { display: "grid", gridTemplateColumns: "150px 1fr", minHeight: "440px" } },
          h("div", { style: { borderRight: "1px solid #e5e7eb", padding: "8px 0" } },
            pages.map(function (p) {
              return h("div", { key: p, "data-testid": "page-" + p, onClick: function () { setActive(p); }, style: { padding: "6px 14px", fontSize: "13px", cursor: "pointer", color: active === p ? "#1f6feb" : "#374151", fontWeight: active === p ? "600" : "400", background: active === p ? "#eff6ff" : "transparent" } }, p);
            })),
          h("div", { "data-testid": "settings-body", style: { padding: "14px 18px", fontSize: "13px", color: "#374151", overflow: "auto", maxHeight: "62vh" } },
            h("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" } },
              h("span", { style: { fontSize: "14px", fontWeight: "600" } }, active),
              h("a", { "data-testid": "open-console", href: "/turnstile/?token=" + encodeURIComponent((function () { try { return new URLSearchParams(window.location.search).get("token") || ""; } catch (e) { return ""; } })()), target: "_blank", rel: "noopener", style: { fontSize: "12px", marginLeft: "12px", whiteSpace: "nowrap" } }, "新窗口打开"),
              h("input", { "data-testid": "settings-filter", value: q, placeholder: "筛选插件 / UI 面", onChange: function (e) { setQ(e.target.value); },
                style: { marginLeft: "auto", width: "200px", padding: "3px 8px", borderRadius: "6px", border: "1px solid #d0d7de", fontSize: "12px" } })),
            d.err ? h("div", { style: { color: "#cf222e" } }, "读取失败: " + d.err) : null,
            deltaLine ? h("div", { "data-testid": "delta-line", style: { fontSize: "12px", color: "#57606a", marginBottom: "8px" } }, deltaLine) : null,
            detail,
            content));
      }

      function Card() {
        var st = React.useState(true), open = st[0], setOpen = st[1];
        var rs = React.useState(visible(FALLBACK.rows)), rows = rs[0], setRows = rs[1];
        var bs = React.useState(""), busy = bs[0], setBusy = bs[1];
        var rp = React.useState(null), report = rp[0], setReport = rp[1];
        var sel = React.useState(null), picked = sel[0], setPicked = sel[1];
        var sl = React.useState([]), slots = sl[0], setSlots = sl[1];
        var oc = React.useState(null), occ = oc[0], setOcc = oc[1];
        // Four sections do not fit one screen: collapse the two least urgent by default.
        var sx = React.useState({ topo: true, occ: true, slots: false, list: false }), secs = sx[0], setSecs = sx[1];
        var fx = React.useState(""), fuseMsg = fx[0], setFuseMsg = fx[1];
        // Drag-to-corner: rows become draggable, corner zones accept the drop, and we never
        // pretend a plugin can move when it does not declare a position.
        var dm = React.useState(false), dragMode = dm[0], setDragMode = dm[1];
        var im = React.useState(false), inspectMode = im[0], setInspectMode = im[1];
        var ir = React.useState(""), inspectMsg = ir[0], setInspectMsg = ir[1];
        var av = React.useState(null), activity = av[0], setActivity = av[1];
        // One filter box, filtering as you type: the list is always the answer to the query (Everything's model).
        var fv = React.useState(""), filter = fv[0], setFilter = fv[1];
        function keep(text) {
          if (!filter) return true;
          return String(text || "").toLowerCase().indexOf(filter.toLowerCase()) !== -1;
        }
        // Crosshair: like Process Explorer's target, but the "window handle" here is the React
        // fiber. Every slot entry renders through RootEntry, whose props carry slotKey + options.id.
        function ownerAtPoint(x, y) {
          var el = document.elementFromPoint(x, y);
          if (!el) return null;
          var key = Object.keys(el).filter(function (k) { return k.indexOf("__reactFiber$") === 0; })[0];
          if (!key) return { slotKey: "", entryId: "", note: "该节点不在 React 树里" };
          var f = el[key];
          var found = null;
          var comp = "";
          for (var i = 0; i < 100 && f; i++) {
            var t = f.type;
            var name = typeof t === "function" ? (t.displayName || t.name || "") : "";
            if ((!comp || /^[A-Z][a-z]?[_$]?$/.test(comp)) && name && name !== "RootEntry" && !/^(div|span|img|svg|button|input|path|g|rect|p|a|ul|li|section|header|main|aside|form|textarea|label)$/.test(name)) comp = name;
            if (name === "RootEntry") {
              var pr = f.memoizedProps || {};
              var e = pr.entry || {};
              var id = e.options && e.options.id ? String(e.options.id) : "";
              // Keep the DEEPEST entry that actually carries an id: the outer RootEntry is often
              // a whole page region ("main"), which tells the user nothing.
              var cand = { slotKey: String(pr.slotKey || ""), entryId: id };
              if (!found) found = cand;
              if (id) found = cand;
            }
            f = f.return;
          }
          if (found) { found.component = found.entryId ? "" : comp; return found; }
          return { slotKey: "", entryId: "", note: "没有找到 slot 边界" };
        }
        // Element inspection: the DOM tags plugins with data-plugin, so a click names the owner.
        React.useEffect(function () {
          if (!inspectMode) return undefined;
          function onPick(e) {
            try {
              var el = document.elementFromPoint(e.clientX, e.clientY);
              var owner = el && el.closest ? el.closest("[data-plugin]") : null;
              var pkg = owner ? owner.getAttribute("data-plugin") : "";
              var tid = el && el.getAttribute ? (el.getAttribute("data-testid") || "") : "";
              var surf = null;
              (occ && occ.surfaces || []).forEach(function (s) {
                if (pkg && s.plugins && s.plugins.indexOf(pkg) !== -1) surf = s;
              });
              var anchor = surf && surf.anchors ? surf.anchors[pkg] : null;
              var cls = el && el.className ? String(el.className).split(" ").slice(0, 2).join(".") : "";
              var where = el ? el.tagName.toLowerCase() + (cls ? "." + cls : "") : "?";
              var own = ownerAtPoint(e.clientX, e.clientY);
              if (own && own.slotKey) {
                setInspectMsg("slot " + own.slotKey + (own.entryId ? "  ·  " + own.entryId : (own.component ? "  ·  <" + own.component + ">" : "")) + (own.note ? "  (" + own.note + ")" : ""));
                e.preventDefault(); e.stopPropagation(); return;
              }
              setInspectMsg(pkg
                ? pkg + (tid ? " · " + tid : "") + (surf ? "  →  " + surf.surface + "  位置=" + (anchor || "硬编码") : "")
                : "<" + where + ">" + (tid ? " · " + tid : "") + "（宿主未给该渲染节点打插件标记）");
              e.preventDefault();
              e.stopPropagation();
            } catch (err) { /* never break the page */ }
          }
          document.addEventListener("click", onPick, true);
          return function () { document.removeEventListener("click", onPick, true); };
        }, [inspectMode, occ]);
        var dg = React.useState(null), dragging = dg[0], setDragging = dg[1];
        function dropOn(zone) {
          var name = dragging;
          setDragging(null);
          if (!name) return;
          api("anchor-support?package=" + encodeURIComponent(name)).then(function (s) {
            if (!s.configurable) {
              setFuseMsg(name + " 未暴露 slot/anchor/order —— 拖不动，需要作者支持");
              return null;
            }
            if (s.values.length && s.values.indexOf(zone) === -1) {
              setFuseMsg(name + " 支持的位置: " + s.values.join(" / ") + "（不含 " + zone + "）");
              return null;
            }
            return api("anchor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ package: name, anchor: zone }) })
              .then(function () { setFuseMsg(name + " → " + zone + "（重启后生效）"); return api("occupancy"); })
              .then(setOcc);
          }).catch(function (e) { setFuseMsg("落位失败: " + String(e.message || e).slice(0, 60)); });
        }
        var ZONES = [["top-left", "左上"], ["top-right", "右上"], ["bottom-left", "左下"], ["bottom-right", "右下"]];
        function zones() {
          if (!dragMode) return null;
          return h("div", { style: { position: "fixed", inset: 0, zIndex: 2147482900, pointerEvents: "none" } },
            ZONES.map(function (z, i) {
              var pos = i === 0 ? { left: 24, top: 90 } : i === 1 ? { right: 24, top: 90 } : i === 2 ? { left: 24, bottom: 90 } : { right: 24, bottom: 90 };
              return h("div", {
                key: z[0], "data-testid": "zone-" + z[0],
                onDragOver: function (e) { e.preventDefault(); },
                onDrop: function (e) { e.preventDefault(); dropOn(z[0]); },
                style: Object.assign({ position: "fixed", width: "150px", height: "110px", border: "1px dashed #58a6ff", borderRadius: "10px", color: "#58a6ff", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(88,166,255,0.06)", pointerEvents: "auto" }, pos)
              }, "拖到" + z[1]);
            }));
        }
        // Drag mode: the panel itself moves (users want the tool out of the way); the position
        // is remembered per browser. Plugin overlays are a different problem - see below.
        var ps = React.useState(function () {
          try { var v = JSON.parse(localStorage.getItem("turnstile.panelPos") || "null"); if (v && typeof v.x === "number") return v; } catch (e) {}
          return null;
        }), pos = ps[0], setPos = ps[1];
        var dragRef = React.useRef(null);
        function beginDrag(e) {
          e.preventDefault();
          var startX = e.clientX, startY = e.clientY;
          var box = document.querySelector('[data-testid="panel"]').getBoundingClientRect();
          var baseX = box.left, baseY = box.top;
          dragRef.current = true;
          function move(ev) {
            if (!dragRef.current) return;
            setPos({ x: Math.max(0, baseX + ev.clientX - startX), y: Math.max(0, baseY + ev.clientY - startY) });
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
          if (!body) return null;
          var isOpen = !!secs[key];
          return h("div", { style: { marginBottom: "6px", borderBottom: "1px solid #30363d", paddingBottom: "6px" } },
            h("button", {
              "data-testid": "sec-" + key,
              onClick: function () { var n = Object.assign({}, secs); n[key] = !isOpen; setSecs(n); },
              style: { width: "100%", textAlign: "left", background: "none", border: 0, color: "#d7dee8", cursor: "pointer", fontSize: "11.5px", padding: 0 }
            }, (isOpen ? "▾ " : "▸ ") + title),
            isOpen ? h("div", { style: { marginTop: "4px", fontSize: "11.5px", color: "#b8c2cf" } }, body) : null);
        }
        React.useEffect(function () {
          // peek: the floating panel must not consume the settings page's "since last look" baseline.
          api("plugins?update=0").then(function (d) { setRows(visible(d.rows)); }).catch(function () {});
          api("report").then(setReport).catch(function () {});
          setSlots(globalSlotsSnapshot());
          api("occupancy").then(setOcc).catch(function () {});
          api("activity").then(setActivity).catch(function () {});
        }, []);
        function reload() {
          return api("plugins?update=0").then(function (d) {
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
        function loadAnchorOptions(row) {
          api("anchor-options?package=" + encodeURIComponent(row.name)).then(function (d) {
            setPicked(function (cur) { return cur && cur.name === row.name ? Object.assign({}, cur, { anchorOptions: d.suggestions || [] }) : cur; });
          }).catch(function () {});
        }
        function fuseSurface(surface) {
          setBusy(surface);
          api("fuse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ surface: surface }) })
            .then(function (r) {
              var first = String(r.output || "").split("\n").filter(function (l) { return l.trim(); });
              setFuseMsg(r.ok ? "已错开" : (first[0] || "无法在配置层解决"));
              return api("occupancy");
            })
            .then(setOcc)
            .catch(function (e) { console.warn("turnstile fuse failed", e); })
            .then(function () { setBusy(""); });
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
        return h("div", { "data-testid": "panel", style: { position: "fixed", left: pos ? pos.x : undefined, top: pos ? pos.y : "64px", right: pos ? "auto" : "18px", zIndex: 2147483000, width: "360px", maxHeight: "calc(100vh - 140px)", overflow: "auto", display: "flex", flexDirection: "column", background: "#0e1116", color: "#d7dee8", border: "1px solid #30363d", borderRadius: "10px", padding: "12px 14px", fontFamily: "ui-sans-serif,system-ui" } },
          zones(),
          h("div", { style: { order: -3, display: "flex", justifyContent: "space-between", marginBottom: "6px" } },
            h("span", { "data-testid": "drag-handle", onMouseDown: beginDrag, title: "拖动面板", style: { cursor: "grab", userSelect: "none" } },
              h("strong", { style: { fontSize: "13px" } }, "mini · 插件 " + rows.length)),
            h("button", { "data-testid": "drag-mode", onClick: function () { setDragMode(!dragMode); },
              style: { marginLeft: "6px", padding: "0 6px", borderRadius: "6px", border: "1px solid " + (dragMode ? "#58a6ff" : "#30363d"), background: dragMode ? "rgba(88,166,255,0.15)" : "transparent", color: dragMode ? "#58a6ff" : "#8b96a5", cursor: "pointer", fontSize: "11px" } }, dragMode ? "拖动中" : "拖动"),
            h("input", { "data-testid": "filter", value: filter, placeholder: "筛选插件…", onChange: function (e) { setFilter(e.target.value); },
              style: { marginLeft: "6px", width: "96px", padding: "1px 6px", borderRadius: "6px", border: "1px solid #30363d", background: "#0b0e13", color: "#d7dee8", fontSize: "11px" } }),
            h("button", { "data-testid": "inspect", onClick: function () { setInspectMode(!inspectMode); setInspectMsg(""); },
              style: { marginLeft: "4px", padding: "0 6px", borderRadius: "6px", border: "1px solid " + (inspectMode ? "#d29922" : "#30363d"), background: inspectMode ? "rgba(210,153,34,0.15)" : "transparent", color: inspectMode ? "#d29922" : "#8b96a5", cursor: "pointer", fontSize: "11px" } }, inspectMode ? "检查中" : "检查"),
            h("button", { onClick: function () { setOpen(false); }, style: { background: "none", border: 0, color: "#8b96a5", cursor: "pointer" } }, "×")),
          h("div", { style: { order: -2, color: "#8b96a5", fontSize: "11.5px", marginBottom: "6px" } }, "停用 " + off + " · 引擎跳过 " + sk + " · 挤爆的 UI 面 " + crowded + " · 点一行切换"),
          report ? h("div", { style: { order: -1, fontSize: "11.5px", marginBottom: "8px", color: "#8b96a5" } },
            "闸门 " + (report.checks || []).length + " 项 · 阻塞 " + ((report.blocking || []).length) + " · " + (report.result || "?")
            + (function () {
                var p = (report.checks || []).filter(function (c) { return c.name === "ui-placement"; })[0];
                return p ? " · 硬编码位置 " + (p.findings || []).length : "";
              })()) : null,
          section("list", "插件列表 · " + rows.filter(function (r) { return keep(r.id) || keep(r.name); }).length + " / " + rows.length, rows.filter(function (r) { return keep(r.id) || keep(r.name); }).map(function (r) {
            return h("div", { key: r.name, "data-testid": "row-" + r.name, draggable: dragMode, onDragStart: function () { setDragging(r.name); }, onClick: function () { var same = picked && picked.name === r.name; setPicked(same ? null : r); if (!same) loadAnchorOptions(r); var el = document.querySelector('[data-testid=\"panel\"]'); if (el) el.scrollTop = 0; }, style: { display: "flex", gap: "8px", fontSize: "12.5px", padding: "3px 0", cursor: "pointer", opacity: busy === r.name ? 0.5 : 1 } },
              h("span", { style: { width: "12px", color: r.disabled ? "#f85149" : "#3fb950" } }, r.disabled ? "×" : "·"),
              h("span", { style: { flex: 1, fontFamily: "ui-monospace,monospace" } }, r.name),
              (r.ui && r.ui.length) ? h("span", { title: (r.ui || []).join(", "), style: { color: "#58a6ff", fontSize: "11px" } }, "ui" + r.ui.length) : null,
              r.engineSkipped ? h("span", { style: { color: "#d29922", fontSize: "11px" } }, "skip") : null);
          })),
          section("slots", "slot 树 · " + slots.length + " 个注册", slots && slots.length ? [
            (function () {
              var bySlot = {};
              slots.forEach(function (s) { bySlot[s.slot] = s.count; });
              return Object.keys(bySlot).sort().slice(0, 12).map(function (k) {
                return h("div", { key: k, style: { display: "flex", gap: "6px", whiteSpace: "nowrap", overflow: "hidden", lineHeight: "1.5" } },
                  h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontFamily: "ui-monospace,monospace", fontSize: "11px" } }, k),
                  h("span", { style: { color: "#8b96a5", fontSize: "11px" } }, bySlot[k]));
              });
            })()] : null),
          inspectMsg ? h("div", { "data-testid": "inspect-result", style: { order: -1, fontSize: "11px", color: "#58a6ff", marginBottom: "4px", wordBreak: "break-all" } }, inspectMsg) : null,
          fuseMsg ? h("div", { style: { order: -1, fontSize: "11px", color: "#d29922", marginBottom: "4px" } }, fuseMsg) : null,
          section("console", "控制台 · 最近 " + ((activity && activity.tail && activity.tail.length) || 0) + " 条",
            activity ? h("div", null,
              h("div", { style: { color: "#8b96a5", fontSize: "11px" } }, "面板请求: " + Object.keys(activity.calls || {}).map(function (k) { return k + "×" + activity.calls[k]; }).join("  ")),
              activity.note ? h("div", { style: { color: "#8b96a5", fontSize: "11px" } }, activity.note) : null,
              (activity.tail || []).map(function (l, i) {
                return h("div", { key: i, style: { fontFamily: "ui-monospace,monospace", fontSize: "10.5px", color: /error|fatal|fail/i.test(l) ? "#f85149" : "#b8c2cf", wordBreak: "break-all" } }, l);
              })) : null),
          occ && occ.surfaces ? h("div", { "data-testid": "topo-summary", style: { order: -1, marginBottom: "6px", color: "#8b96a5", fontSize: "11px" } },
            occ.surfaces.length + " 个 UI 面 · 争用 " + occ.surfaces.filter(function (s) { return s.contested; }).length + " 处 · 拓扑见设置页（未裁切，可缩放）") : null,
          occ && occ.surfaces && occ.surfaces.length ? h("div", { style: { order: -1, marginBottom: "8px", borderBottom: "1px solid #30363d", paddingBottom: "8px", fontSize: "11.5px", color: "#b8c2cf" } },
            h("div", { style: { color: "#d7dee8" } }, "角落占用 · " + occ.findings.length + " 处争用"),
            occ.surfaces.filter(function (s) { return keep(s.surface) || (s.plugins || []).some(keep); }).slice(0, 8).map(function (s) {
              return h("div", { key: s.surface, style: { display: "flex", gap: "6px", whiteSpace: "nowrap", overflow: "hidden" } },
                h("span", { style: { color: "#f85149" } }, "!"),
                h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontFamily: "ui-monospace,monospace", fontSize: "11px" } }, s.surface),
                h("button", { "data-testid": "fuse-" + s.surface, onClick: function (e) { e.stopPropagation(); fuseSurface(s.surface); },
                  style: { padding: "0 5px", borderRadius: "5px", border: "1px solid #30363d", background: "#161b22", color: "#d7dee8", cursor: "pointer", fontSize: "10.5px", whiteSpace: "nowrap" } }, "错开"),
                h("span", { style: { color: "#8b96a5", fontSize: "11px", whiteSpace: "nowrap" } }, s.count + " · 硬编" + s.hardcoded.length));
            })) : null,
          picked ? h("div", { "data-testid": "detail", style: { order: -1, marginBottom: "8px", borderBottom: "1px solid #30363d", paddingBottom: "8px", fontSize: "11.5px", lineHeight: "1.7", color: "#b8c2cf" } },
            h("div", { style: { fontFamily: "ui-monospace,monospace", color: "#d7dee8" } }, picked.name),
            h("div", { "data-testid": "detail-grid", style: { display: "grid", gridTemplateColumns: "72px 1fr", columnGap: "10px", rowGap: "1px", marginTop: "4px" } },
              h("span", { style: { color: "#8b96a5" } }, "行 id"),
              h("span", { style: { fontFamily: "ui-monospace,monospace" } }, picked.row || "(未声明)"),
              h("span", { style: { color: "#8b96a5" } }, "状态"),
              h("span", null, (picked.disabled ? "已停用" : "启用") + (picked.engineSkipped ? " · 引擎跳过" : "")),
              h("span", { style: { color: "#8b96a5" } }, "UI 面"),
              h("span", null, (picked.ui && picked.ui.length) ? picked.ui.length + " 个: " + picked.ui.join(", ") : "无（宿主侧或自绘）")),
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
                  list: "anchor-opts-" + picked.name.replace(/[^\w-]/g, "_"),
                  placeholder: "例如 bottom-right",
                  disabled: Boolean(busy),
                  onKeyDown: function (e) { if (e.key === "Enter") setAnchor(picked, e.target.value.trim()); },
                  style: { flex: 1, minWidth: 0, background: "#161b22", color: "#d7dee8", border: "1px solid #30363d", borderRadius: "6px", fontSize: "11.5px", padding: "1px 5px" }
                }),
                h("datalist", { id: "anchor-opts-" + picked.name.replace(/[^\w-]/g, "_") },
                  (picked.anchorOptions || []).map(function (a) { return h("option", { key: a, value: a }); })),
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

      // M1: a real settings page, not a floating panel. Registered the same way
      // dsh-better-sidebar registers its 侧边卡片 section.
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "turnstile",
          order: 120,
          label: function () { return "插件体检"; },
        }, SettingsSection);
      });
    };
    return module.exports;
  },
});