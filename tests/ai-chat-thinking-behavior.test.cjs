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
  assert.equal(style(preview.props.style).maxHeight, 90);
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
  let tree = f.render({ ...base, reasoningText: '一行\n二行\n三行\n四行\n五行\n六行\n七行' });
  measure(tree, 126);
  tree = f.render();
  assert.equal(offset(tree), -36, 'seven native lines expose the newest five');
  tree = f.render({ ...base, reasoningText: `${base.reasoningText}\n${'继续输出\n'.repeat(20)}` });
  measure(tree, 378);
  tree = f.render();
  assert.equal(offset(tree), -288, 'subsequent native layout advances the tail instead of freezing at five lines');
  assert.equal(378 + offset(tree), 90, 'the newest text edge stays at the bottom of the fixed viewport');
  assert.equal(style(content(tree).props.style).flexShrink, 0, 'measure the full content rather than the clipped viewport');
  assert.equal(flatten(tree).some(node => node.type === 'ScrollView' || node.props.onTouchMove || node.props.onScroll), false);
  assert.equal(style(flatten(tree).find(node => style(node.props.style).maxHeight).props.style).maxHeight, 90);
});

test('short thinking has natural height with no early fades, and wrapping or shrinking recalculates its tail', () => {
  const f = fixture();
  let tree = f.render(base);
  for (const height of [18, 54, 90]) {
    measure(tree, height);
    tree = f.render();
    assert.equal(Math.abs(offset(tree)), 0);
    assert.equal(flatten(tree).filter(node => node.type === 'LinearGradient').length, 0);
    const viewport = flatten(tree).find(node => style(node.props.style).maxHeight);
    assert.equal(style(viewport.props.style).height, undefined, 'never reserve five lines for short text');
  }
  for (const height of [234, 180, 108, 18]) {
    measure(tree, height);
    tree = f.render();
    assert.equal(Math.abs(offset(tree)), Math.max(0, height - 90));
  }
  measure(tree, NaN);
  measure(tree, -1);
  assert.equal(Math.abs(offset(f.render())), 0, 'invalid native measurements cannot corrupt the offset');
});

test('only an overflowing compact preview has soft edges, while only expanded text has a guide', () => {
  const f = fixture();
  let tree = f.render(base);
  measure(tree, 180);
  tree = f.render();
  const fades = flatten(tree).filter(node => node.type === 'LinearGradient');
  assert.equal(fades.length, 2);
  assert.equal(style(fades[0].props.style).top, 0);
  assert.equal(style(fades[1].props.style).bottom, 0);
  assert.equal(fades[0].props.colors[0], fades[1].props.colors[1]);
  assert.equal(fades[0].props.colors[1], fades[1].props.colors[0]);
  assert.ok(fades.every(node => node.props.pointerEvents === 'none' && style(node.props.style).height === 6));
  assert.equal(flatten(tree).some(node => style(node.props.style).borderLeftWidth), false);
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
  assert.equal(offset(tree), -270, 'folding immediately reveals the newest measured tail');
});

test('a new generation cannot inherit a previous generation preview offset', () => {
  const f = fixture();
  let tree = f.render(base);
  const oldTextLayout = flatten(tree).find(node => node.props.onTextLayout).props.onTextLayout;
  measure(tree, 360);
  tree = f.render();
  assert.equal(offset(tree), -270);
  tree = f.render({ ...base, createdAt: '2026-10-14T00:00:05Z', reasoningText: '新一轮' });
  assert.equal(Math.abs(offset(tree)), 0);
  measure(tree, 18);
  assert.equal(Math.abs(offset(f.render())), 0);
  oldTextLayout({ nativeEvent: { lines: [{ y: 270, height: 90 }] } });
  assert.equal(Math.abs(offset(f.render())), 0, 'late native layout from the replaced generation is ignored');
});

test('five-line preview uses native line metrics when Android text containers are clamped or fonts scale', () => {
  const f = fixture();
  let tree = f.render(base);
  measure(tree, 168, 24);
  tree = f.render();
  assert.equal(offset(tree), -48);
  assert.equal(style(content(tree).props.style).height, 168, 'explicit full height prevents native container clamping');
  assert.equal(style(flatten(tree).find(node => style(node.props.style).maxHeight).props.style).maxHeight, 120,
    'five scaled native lines remain visible');
  measure(tree, 240, 24);
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
