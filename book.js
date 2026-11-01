// 只记住本机阅读状态，不将浏览进度当作掌握程度。
const key = `graphic-reading-v2-${chapter}`;
const byTag = tag => Bokeh.documents[0].roots().flatMap(root => [...root.references()]).find(model => model.tags.includes(tag));
const focus = byTag('book-focus'), tabs = byTag('book-reading-tabs');
let restoring = true, scheduled = false;
const store = () => {
    try { localStorage.setItem(key, JSON.stringify({y: scrollY, focus: focus.active, tab: tabs.active, reference: byTag('book-reference')?.value})); } catch (_) {}
};
const save = () => {
    if (restoring || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { store(); scheduled = false; });
};
try {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    if (state && !location.hash && !new URLSearchParams(location.search).has('view') && !new URLSearchParams(location.search).has('reference')) {
        focus.active = state.focus === true;
        tabs.active = [0, 1, 2, 3].includes(state.tab) ? state.tab : 0;
        // 等待 Python 处理收起实验和动态页签引起的布局变化。
        setTimeout(() => {
            const reference = byTag('book-reference');
            if (reference && reference.options.some(option => (Array.isArray(option) ? option[0] : option) === state.reference)) reference.value = state.reference;
            setTimeout(() => {
                if (Number.isFinite(state.y)) window.scrollTo({top: Math.max(0, state.y), behavior: 'instant'});
                restoring = false;
            }, 300);
        }, 400);
    } else restoring = false;
} catch (_) { restoring = false; }
window.addEventListener('scroll', save, {passive: true});
window.addEventListener('pagehide', () => { if (!restoring) store(); });
focus.properties.active.change.connect(save);
tabs.properties.active.change.connect(save);
