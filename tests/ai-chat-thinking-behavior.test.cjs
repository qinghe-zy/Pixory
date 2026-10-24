const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const slots = [];
  const frames = new Map();
  let cursor = 0;
  let frameId = 0;
  let dirty = false;
  let effects = [];
  let tree;
  let props;
  let clock = Date.parse('2026-10-14T00:00:06Z');
  let headerY = 200;
  const pendingMeasurements = [];
  let deferMeasurement = false;
  const react = {
    useRef(value) {
      const index = cursor++;
      return slots[index] ??= { current: value };
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => {
        const next = typeof value === 'function' ? value(slots[index]) : value;
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
      }];
    },
    useMemo(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, value: fn() };
      }
      return slots[index].value;
    },
  };
  function effect(fn, deps) {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      effects.push(() => {
        previous?.cleanup?.();
        slots[index] = { deps, cleanup: fn() };
      });
    }
  }
  react.useEffect = effect;
  react.useLayoutEffect = effect;
  const colors = { mutedReadable: '#636366', muted: '#8E8E93' };
  const mocks = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    '../../design/tokens': { rhythm: { microGap: 2 }, spacing: { 1: 4, 1.5: 6, 2: 8, 3: 12 },
      typography: { textStyles: { body: { fontSize: 14 }, caption: { fontSize: 12 } } } },
    './aiLightTheme': { aiLightColors: colors },
  };
  class Clock extends Date {
    constructor(value) { super(value ?? clock); }
    static now() { return clock; }
  }
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiThinkingBlock.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports, require: name => {
      assert.ok(mocks[name], `unexpected dependency ${name}`);
      return mocks[name];
    }, Date: Clock,
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  function render(nextProps = props) {
    props = nextProps;
    let passes = 0;
    do {
      assert.ok(++passes < 10, 'render settles without an effect loop');
      dirty = false;
      cursor = 0;
      effects = [];
      tree = module.exports.AiThinkingBlock(props);
      for (const node of flatten(tree)) {
        if (node.type === 'Pressable' && node.props.ref) {
          node.props.ref.current = { measureInWindow: callback => {
            const y = headerY;
            const measure = () => callback(0, y, 240, 36);
            if (deferMeasurement) pendingMeasurements.push(measure);
            else measure();
          } };
        }
      }
      effects.forEach(run => run());
    } while (dirty);
    return tree;
  }
  return { render, setClock: value => { clock = Date.parse(value); },
    setHeaderY: value => { headerY = value; },
    deferMeasurement() { deferMeasurement = true; },
    flushMeasurements() { pendingMeasurements.splice(0).forEach(fn => fn()); },
    flushFrames() { const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn()); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

function flatten(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  return [node, ...flatten(node.props?.children)];
}
function style(value) { return Object.assign({}, ...[value].flat(Infinity).filter(Boolean)); }
function button(tree) { return flatten(tree).find(node => node.type === 'Pressable'); }
function content(tree) { return flatten(tree).find(node => style(node.props.style).transform); }
function measure(tree, height, lineHeight = 18) {
  const lines = Number.isFinite(height) && height > 0
    ? Array.from({ length: Math.ceil(height / lineHeight) }, (_, i) => ({ y: i * lineHeight, height: Math.min(lineHeight, height - i * lineHeight) }))
    : [{ y: 0, height }];
  flatten(tree).find(node => node.props.onTextLayout).props.onTextLayout({ nativeEvent: { lines } });
}
function offset(tree) { return style(content(tree).props.style).transform[0].translateY; }
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return text(node.props?.children);
}
const base = { createdAt: '2026-10-14T00:00:00Z', status: 'generating', reasoningText: '一行思考', thinkingActive: true };

test('thinking header has body typography, no chrome or left icon, and no live seconds', () => {
  const f = fixture();
  const tree = f.render(base);
  const header = button(tree);
  const nodes = flatten(header);
  assert.equal(style(header.props.style({ pressed: false })).backgroundColor, undefined);
  assert.equal(nodes.filter(node => node.type === 'Text').length, 1);
  assert.equal(style(nodes.find(node => node.type === 'Text').props.style).fontSize, 15);
  assert.equal(nodes.filter(node => node.type === 'Ionicons').length, 1);
  assert.equal(nodes.find(node => node.type === 'Ionicons').props.name, 'chevron-down');
  assert.equal(text(header).includes('秒'), false);
  const preview = flatten(tree).find(node => style(node.props.style).maxHeight != null);
  assert.equal(style(preview.props.style).height, undefined);
  assert.equal(style(preview.props.style).maxHeight, 161);
  assert.equal(style(preview.props.style).justifyContent, undefined);
  assert.equal(flatten(tree).filter(node => node.type === 'ScrollView').length, 0);
});

test('completed thinking shows frozen duration, opens fully, and never uses internal scrolling', () => {
  const f = fixture();
  const props = { ...base, status: 'completed', completedAt: '2026-10-14T00:00:04Z' };
  let tree = f.render(props);
  assert.equal(text(button(tree)), '已深度思考（用时 4.0 秒）');
  button(tree).props.onPress();
  tree = f.render();
  assert.equal(button(tree).props.accessibilityState.expanded, true);
  assert.equal(flatten(tree).filter(node => node.type === 'ScrollView').length, 0);
  assert.ok(flatten(tree).some(node => node.type === 'Text' && text(node) === base.reasoningText));
  assert.equal(flatten(tree).some(node => style(node.props.style).maxHeight != null), false);
  f.setClock('2026-10-14T00:05:00Z');
  assert.equal(text(button(f.render())), '已深度思考（用时 4.0 秒）');
});

test('compact thinking follows new lines internally without allowing manual scrolling', () => {
  const f = fixture();
  let tree = f.render({ ...base, reasoningText: '一行\n二行\n三行\n四行\n五行\n六行\n七行\n八行\n九行' });
  measure(tree, 162);
  tree = f.render();
  assert.equal(offset(tree), -36, 'nine native lines expose the newest seven');
  tree = f.render({ ...base, reasoningText: `${base.reasoningText}\n${'继续输出\n'.repeat(20)}` });
  measure(tree, 378);
  tree = f.render();
  assert.equal(offset(tree), -252, 'subsequent native layout advances the tail instead of freezing at seven lines');
  assert.equal(378 + offset(tree), 126, 'the newest text edge stays at the bottom of the fixed viewport');
  assert.equal(style(content(tree).props.style).flexShrink, 0, 'measure the full content rather than the clipped viewport');
  assert.equal(flatten(tree).some(node => node.type === 'ScrollView' || node.props.onTouchMove || node.props.onScroll), false);
  assert.equal(style(flatten(tree).find(node => style(node.props.style).maxHeight).props.style).maxHeight, 126);
});

test('short thinking has natural height with no early fades, and wrapping or shrinking recalculates its tail', () => {
  const f = fixture();
  let tree = f.render(base);
  for (const height of [18, 54, 90, 126]) {
    measure(tree, height);
    tree = f.render();
    assert.equal(Math.abs(offset(tree)), 0);
    assert.equal(flatten(tree).filter(node => node.type === 'LinearGradient').length, 0);
    const viewport = flatten(tree).find(node => style(node.props.style).maxHeight);
    assert.equal(style(viewport.props.style).height, undefined, 'never reserve seven lines for short text');
  }
  for (const height of [234, 180, 144, 18]) {
    measure(tree, height);
    tree = f.render();
    assert.equal(Math.abs(offset(tree)), Math.max(0, height - 126));
  }
  measure(tree, NaN);
  measure(tree, -1);
  assert.equal(Math.abs(offset(f.render())), 0, 'invalid native measurements cannot corrupt the offset');
});

test('only an overflowing compact preview has a soft bottom edge, while guide is consistently present', () => {
  const f = fixture();
  let tree = f.render(base);
  measure(tree, 180);
  tree = f.render();
  const fades = flatten(tree).filter(node => node.type === 'LinearGradient');
  assert.equal(fades.length, 2);
  assert.equal(style(fades[0].props.style).top, 0);
  assert.equal(style(fades[0].props.style).height, 24);
  assert.equal(fades[0].props.pointerEvents, 'none');
  assert.equal(style(fades[1].props.style).bottom, 0);
  assert.equal(style(fades[1].props.style).height, 24);
  assert.equal(fades[1].props.pointerEvents, 'none');
  assert.equal(flatten(tree).filter(node => style(node.props.style).borderLeftWidth).length, 1);
  const compactPadding = style(content(tree).props.style).paddingLeft;
  button(tree).props.onPress();
  tree = f.render();
  assert.equal(flatten(tree).some(node => node.type === 'LinearGradient'), false);
  assert.equal(flatten(tree).filter(node => style(node.props.style).borderLeftWidth).length, 1);
  assert.equal(style(content(tree).props.style).paddingLeft, compactPadding, 'toggling does not rewrap the text');
  assert.equal(Math.abs(offset(tree)), 0, 'expanded text starts at the beginning');
  assert.equal(flatten(tree).some(node => style(node.props.style).maxHeight), false);
  measure(tree, 360);
  tree = f.render();
  assert.equal(Math.abs(offset(tree)), 0, 'expanded streaming does not move text internally');
  button(tree).props.onPress();
  tree = f.render();
  assert.equal(offset(tree), -234, 'folding immediately reveals the newest measured tail');
});

test('a new generation cannot inherit a previous generation preview offset', () => {
  const f = fixture();
  let tree = f.render(base);
  const oldTextLayout = flatten(tree).find(node => node.props.onTextLayout).props.onTextLayout;
  measure(tree, 360);
  tree = f.render();
  assert.equal(offset(tree), -234);
  tree = f.render({ ...base, createdAt: '2026-10-14T00:00:05Z', reasoningText: '新一轮' });
  assert.equal(Math.abs(offset(tree)), 0);
  measure(tree, 18);
  assert.equal(Math.abs(offset(f.render())), 0);
  oldTextLayout({ nativeEvent: { lines: [{ y: 234, height: 126 }] } });
  assert.equal(Math.abs(offset(f.render())), 0, 'late native layout from the replaced generation is ignored');
});

test('seven-line preview uses native line metrics when Android text containers are clamped or fonts scale', () => {
  const f = fixture();
  let tree = f.render(base);
  measure(tree, 216, 24);
  tree = f.render();
  assert.equal(offset(tree), -48);
  assert.equal(style(content(tree).props.style).height, 216, 'explicit full height prevents native container clamping');
  assert.equal(style(flatten(tree).find(node => style(node.props.style).maxHeight).props.style).maxHeight, 168,
    'seven scaled native lines remain visible');
  measure(tree, 288, 24);
  tree = f.render();
  assert.equal(offset(tree), -120);
  button(tree).props.onPress();
  tree = f.render();
  assert.equal(style(content(tree).props.style).height, undefined, 'expanded text always has natural page height');
});

test('thinking ends and folds when answer starts, and opening it later stays open', () => {
  const f = fixture();
  let tree = f.render({ ...base, defaultExpanded: true });
  assert.equal(button(tree).props.accessibilityState.expanded, true);
  tree = f.render({ ...base, defaultExpanded: true, thinkingActive: false });
  assert.equal(button(tree).props.accessibilityState.expanded, false);
  assert.equal(text(button(tree)), '已深度思考（用时 6.0 秒）');
  button(tree).props.onPress();
  tree = f.render();
  assert.equal(button(tree).props.accessibilityState.expanded, true);
  f.setClock('2026-10-14T00:00:20Z');
  tree = f.render({ ...base, defaultExpanded: true, thinkingActive: false, status: 'completed', completedAt: '2026-10-14T00:00:20Z' });
  assert.equal(text(button(tree)), '已深度思考（用时 6.0 秒）');
});

test('expansion compensates actual upward header movement and ignores unmounted work', () => {
  const f = fixture();
  const shifts = [];
  let tree = f.render({ ...base, onHeaderAnchorShift: value => shifts.push(value) });
  button(tree).props.onPress();
  f.setHeaderY(80);
  tree = f.render();
  assert.deepEqual(shifts, [120], 'anchor correction runs in the layout commit without waiting for a frame');
  assert.deepEqual(shifts, [120]);
  button(tree).props.onPress();
  f.render();
  f.flushFrames();
  assert.deepEqual(shifts, [120], 'native anchoring with no movement needs no duplicate compensation');
  button(f.render()).props.onPress();
  f.render();
  f.unmount();
  f.flushFrames();
  assert.deepEqual(shifts, [120]);
});

test('persisted reasoning boundary excludes a long answer and survives a component remount', () => {
  const f = fixture();
  const props = { ...base, thinkingEndedAt: '2026-10-14T00:00:03Z', completedAt: '2026-10-14T00:03:00Z', status: 'completed' };
  let tree = f.render(props);
  assert.equal(text(button(tree)), '已深度思考（用时 3.0 秒）');
  button(tree).props.onPress();
  tree = f.render();
  const reasoningSlot = content(tree).props.children[1];
  button(tree).props.onPress();
  tree = f.render();
  assert.equal(content(tree).props.children[1].type, reasoningSlot.type, 'folding preserves the native text slot');
  assert.equal(text(content(tree).props.children[1]), text(reasoningSlot));
  assert.equal(text(button(fixture().render(props))), '已深度思考（用时 3.0 秒）');
});

test('a delayed press measurement cannot reopen thinking after it has ended', () => {
  const f = fixture();
  const props = { ...base, onHeaderAnchorShift() {} };
  const tree = f.render(props);
  f.deferMeasurement();
  button(tree).props.onPress();
  f.render({ ...props, thinkingActive: false });
  f.flushMeasurements();
  assert.equal(button(f.render()).props.accessibilityState.expanded, false);
  button(f.render()).props.onPress();
  f.flushMeasurements();
  assert.equal(button(f.render()).props.accessibilityState.expanded, true, 'the next press opens after an interrupted expansion');
});

test('rapid toggles use the latest intent while native measurements are pending', () => {
  const f = fixture();
  const tree = f.render({ ...base, onHeaderAnchorShift() {} });
  f.deferMeasurement();
  button(tree).props.onPress();
  button(tree).props.onPress();
  f.flushMeasurements();
  assert.equal(button(f.render()).props.accessibilityState.expanded, false);
});

test('multi-stage native text layout continues compensating upward shift until layout height is positive', () => {
  const f = fixture();
  const shifts = [];
  let tree = f.render({ ...base, onHeaderAnchorShift: value => shifts.push(value) });
  button(tree).props.onPress();
  f.setHeaderY(150);
  tree = f.render();
  assert.deepEqual(shifts, [50], 'first pass compensates partial height');
  f.setHeaderY(30);
  measure(tree, 240);
  tree = f.render();
  assert.deepEqual(shifts, [50, 120], 'second pass after text layout completes compensates remaining delta and settles anchor');
  f.setHeaderY(10);
  tree = f.render();
  assert.deepEqual(shifts, [50, 120], 'settled anchor ignores further spurious shift');
});

test('collapsed long thinking slices tail with 300-char step-windowing and shows dual gradients', () => {
  const f = fixture();
  // 1. Text <= 800 chars is not sliced
  const text700 = 'A'.repeat(700);
  let tree = f.render({ ...base, reasoningText: text700 });
  const textNode700 = flatten(tree).find(node => node.type === 'Text' && node.props.onTextLayout);
  assert.equal(text(textNode700), text700);

  // 2. Text > 800 chars is sliced to tail in 300-char quantized windows
  const text1200 = 'B'.repeat(1200);
  tree = f.render({ ...base, reasoningText: text1200 });
  const textNode1200 = flatten(tree).find(node => node.type === 'Text' && node.props.onTextLayout);
  assert.ok(text(textNode1200).length < 1200, 'tail is sliced');
  // Both top and bottom fades can appear when overflowing
  measure(tree, 250);
  tree = f.render();
  const fades = flatten(tree).filter(node => node.type === 'LinearGradient');
  assert.equal(fades.length, 2, 'both top and bottom gradients are present for overflowing sliced tail');
});

test('expanding long thinking locks viewport at preview height until full text layout settles in a single stage', () => {
  const f = fixture();
  const longText = 'C'.repeat(1200);
  let tree = f.render({ ...base, reasoningText: longText });
  // Measure the collapsed tail slice (e.g. 200px)
  measure(tree, 200);
  tree = f.render();

  // User taps expand
  button(tree).props.onPress();
  f.setHeaderY(150);
  tree = f.render();

  // While waiting for full text layout, container stays locked at previewHeight
  const viewport = flatten(tree).find(node => style(node.props.style).maxHeight);
  assert.ok(viewport, 'viewport is clamped during waitingForFullTextLayout');
  assert.equal(style(viewport.props.style).maxHeight, 110, 'held at measured preview height');

  // Full text onTextLayout arrives
  measure(tree, 800);
  f.setHeaderY(50);
  tree = f.render();

  // Now viewport has no maxHeight clamp and expands to full content in a single stage
  const expandedViewport = flatten(tree).find(node => style(node.props.style).maxHeight);
  assert.equal(expandedViewport, undefined, 'maxHeight removed once full text layout settles');
});
