window.__ModuleLoader__.load({
  id: 'demo-anchor-widget',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    exports.inject = ['slots'];
    exports.apply = function apply(ctx) {
      var React = require('react');
      var h = React.createElement;
      function Badge() {
        var st = React.useState('');
        var anchor = st[0], setAnchor = st[1];
        React.useEffect(function () {
          var t = (location.search.match(/[?&]token=([^&]+)/) || [])[1] || '';
          fetch('/demo-anchor/config' + (t ? '?token=' + t : '')).then(function (r) { return r.json(); })
            .then(function (d) { setAnchor(String(d.anchor || '')); }).catch(function () {});
        }, []);
        var map = {
          'top-left': { left: 16, top: 16 }, 'top-right': { right: 16, top: 16 },
          'bottom-left': { left: 16, bottom: 16 }, 'bottom-right': { right: 16, bottom: 16 }
        };
        var pos = map[anchor] || { right: 16, bottom: 16 };
        var style = Object.assign({ position: 'fixed', width: '92px', height: '52px', zIndex: 2147482000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(88,166,255,0.15)', border: '1px solid #58a6ff', borderRadius: '10px',
          color: '#58a6ff', fontSize: '11px', fontFamily: 'ui-monospace,monospace', pointerEvents: 'none' }, pos);
        return h('div', { 'data-testid': 'demo-anchor-widget', style: style }, anchor || '(no anchor)');
      }
      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register({ name: 'shell.overlay', id: 'demo.anchor-widget' }, Badge);
      });
    };
    return module.exports;
  },
});
