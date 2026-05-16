# 撤销 / 重做(undo/redo)设计 (P5+)

> Status: ✅ Active — 2026-05-13 落地完成

state snapshot 风格的 undo/redo,把 viewConfig 整体入栈;reducer 保持纯,history 仅在 hook 里 wrap。

---

## 1. 选型理由

| 方案 | 思路 | 反悔成本 | 选 |
|---|---|---|---|
| A. action-based(event sourcing) | 每个 action 记录 + 写 inverse | 高(30+ action 各写逆向) | ✗ |
| **B. snapshot** | 每次编辑前 push 当前 viewConfig | 低 | ✓ |
| C. diff-based(patch) | 记前后 patch | 中(jsondiff 库 + 复杂) | ✗ |

**选 B 的理由**:
- viewConfig 整体 ~几 KB,50 步 ~250KB 内存
- reducer 已经返回新对象(引用比对够,不需要深拷贝)
- 任何 viewConfig 变更都能撤销,不漏

---

## 2. 数据结构

```ts
// hooks/useViewConfig.ts 内部 state
const [history, setHistory] = useState<{
  past: ViewConfig[];     // undo 拉这个
  future: ViewConfig[];   // redo 拉这个
}>({ past: [], future: [] });

const MAX_HISTORY = 50; // past + future 各 50 步上限
```

不存 current — current 始终是 viewConfig 本身(controlled 走 `value`,uncontrolled 走 `internalState`)。

---

## 3. Hook API

`useViewConfig` 返回 tuple 第 3 位是 `ViewConfigHistory`:

```ts
export interface ViewConfigHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** 手动清空 history(数据源切换会自动调,宿主一般不需要主动用) */
  clearHistory: () => void;
}

const [viewConfig, dispatch, history] = useViewConfig({ ... });
```

**向后兼容**:旧 destructuring `const [vc, dispatch] = useViewConfig(...)` 不破坏,JS 只取前两位忽略第 3 位。

---

## 4. 算 / 不算 step 的清单

### ✅ 算一步(任何改 viewConfig 的 action)

| 类别 | 具体 |
|---|---|
| 字段拖拽 | ADD_FIELD / REMOVE_FIELD / MOVE_FIELD / SWAP_ROWS_COLUMNS / DROP_FIELD |
| 数值字段编辑 | SET_VALUE_AGGREGATOR / SET_VALUE_QUICK_CALC |
| 维度操作 | DRILL_DOWN / DRILL_UP / SET_FIELD_SUB_TOTAL |
| 筛选 | SET_FILTERS / SET_MEASURE_FILTERS |
| 排序 | CYCLE_ROW_SORT |
| 模式切换 | SET_DISPLAY_MODE / SET_QUERY_MODE |
| 设置面板项 | SET_TOTALS / SET_DISPLAY_OPTIONS(各种 boolean) |
| 自建字段 | ADD/UPDATE/REMOVE_CUSTOM_FIELD |
| 条件格式化 | ADD/UPDATE/REMOVE_CONDITIONAL_FORMAT |
| 整体替换 | SET |

### ❌ 不算 step(黑名单)

| Action | 理由 |
|---|---|
| `SET_ROW_PAGE` | 翻页是浏览不是编辑(Excel/Tableau 一致语义) |

**实现**:
```ts
const NON_HISTORY_ACTIONS: ReadonlySet<ViewConfigAction['type']> = new Set([
  'SET_ROW_PAGE',
]);
```

### ⚠ 边界

| 场景 | 行为 |
|---|---|
| reducer 返回同引用(no-op,如 REMOVE_CONDITIONAL_FORMAT 不存在 id) | 不入栈 |
| undo 后再做新 action | future 清空(经典编辑器行为) |
| past 满 50 | shift 最老的,canUndo 仍 true 直到 undo 完 |
| metadata.id 变化 | **自动 clearHistory**(跨数据源 history 无意义) |
| metadata 同 id 但不同对象引用 | 不清空(props identity 抖动不破坏 history) |
| 受控模式(`value` + `onChange`) | undo/redo 调 onChange 传 prev/next,父组件按现有契约更新 value |

---

## 5. Reducer 行为

```ts
const dispatch = useCallback((action) => {
  const currentSource = isControlledRef.current ? (value ?? internalState) : internalState;
  const next = viewConfigReducer(currentSource, action, metadata);
  // reducer 返回同引用 → 无变化,不触发 onChange / history
  if (next === currentSource) return;
  onChange?.(next);
  if (!isControlledRef.current) {
    setInternalState(next);
  }
  // 入 history(黑名单除外);任何"新"编辑都清空 future(经典编辑器行为)
  if (!NON_HISTORY_ACTIONS.has(action.type)) {
    setHistory((h) => ({
      past: [...h.past, currentSource].slice(-MAX_HISTORY),
      future: [],
    }));
  }
}, [value, internalState, onChange, metadata]);
```

**关键不变量**:
- reducer 仍是纯函数,不感知 history
- "无变化(同引用)不入栈" — 即使 dispatch 一个 action,若 reducer 视为 no-op,history 不动

---

## 6. UI 入口

### Toolbar 按钮

`Toolbar.tsx` 新增 2 个 icon-only 按钮(放在"刷新"右边):
- `↶` 撤销 — disabled when `!canUndo`,title `"撤销 (Cmd/Ctrl+Z)"`
- `↷` 重做 — disabled when `!canRedo`,title `"重做 (Cmd/Ctrl+Shift+Z)"`

### 快捷键

`PivotTable.tsx` 文档级 keydown 监听:

| 键 | 动作 |
|---|---|
| `Cmd/Ctrl + Z` | undo |
| `Cmd/Ctrl + Shift + Z` 或 `Cmd/Ctrl + Y` | redo |

**input/textarea/contentEditable 聚焦时不拦截** — 让浏览器原生 input undo 工作:

```ts
const target = e.target as HTMLElement | null;
const tag = target?.tagName;
if (
  tag === 'INPUT' ||
  tag === 'TEXTAREA' ||
  tag === 'SELECT' ||
  target?.isContentEditable
) {
  return; // 不 preventDefault,原生 undo 接管
}
```

---

## 7. 状态比对语义(常见误解)

**例子**:用户拖一个 销售_年 字段,撤销删掉,又拖一个 销售_年。`past` 里记录了几步?

| 步骤 | 操作 | past | current | future |
|---|---|---|---|---|
| 0 | (初始) | `[]` | `empty` | `[]` |
| 1 | 拖年 | `[empty]` | `year_v1` | `[]` |
| 2 | 撤销 | `[]` | `empty` | `[year_v1]` |
| 3 | 又拖年 | `[empty]` | `year_v2` | `[]` ⚠ future 清空,`year_v1` 丢弃 |

**3 次 dispatch,但 history 只 1 个 past 条目**(初始 empty snapshot)。

关键点:
- `year_v1` 和 `year_v2` 是两个不同的 object(`applyDrop` 每次返回新对象),即使结构等价
- no-op 检测用引用相等(`next === currentSource`)— O(1),不做结构比较
- "新 dispatch 清空 future" 是 Excel/VSCode/Figma 标准行为(避免 undo tree 暴涨复杂度)

---

## 8. 与受控模式的契约

控制权对比:

| 模式 | viewConfig 真值源 | undo 行为 |
|---|---|---|
| 不可控 | hook 内部 `internalState` | `setInternalState(prev)` + `onChange?.(prev)`(若有 onChange) |
| 可控 | 父组件 `value` | `onChange(prev)`,父组件按既有契约更新 `value` |

**受控测试**(已加):

```ts
// undo 在受控模式 — 调 onChange 传 prev/next
const { result, rerender } = renderHook(
  ({ value }) => useViewConfig({ value, onChange, metadata }),
  { initialProps: { value: initial } },
);
act(() => result.current[1]({ type: 'REMOVE_FIELD', ... }));
expect(onChange).toHaveBeenCalledTimes(1);
rerender({ value: onChange.mock.calls[0][0] });

act(() => result.current[2].undo());
expect(onChange).toHaveBeenCalledTimes(2);
expect(onChange.mock.calls[1][0].values).toHaveLength(1); // 还原回 initial
```

---

## 9. Trade-off 记录

| 决策 | 选择 | 反悔成本 |
|---|---|---|
| snapshot vs action-based | snapshot(简单 + viewConfig 不大) | 低 |
| MAX_HISTORY = 50 | 50(BI 用户不会真撤销 50 步) | 极低(改常量) |
| 数据源切换自动 clearHistory | 自动(metadata.id 变 → 清) | 低 |
| 翻页(SET_ROW_PAGE)不算 step | 不算(浏览不算编辑) | 中 |
| 引用相等 no-op 检测 | 引用相等(不做结构比对) | 低(可加 deep equal 但意义不大) |
| input 聚焦时不拦截快捷键 | 不拦截(原生 undo 工作) | 极低 |
| 受控模式仍内部维护 history | 是(hook 始终能 undo,父组件按 onChange 同步) | 中 |

---

## 10. 测试覆盖(14 个 + 14 个 baseline = 45 总,在 useViewConfig.test.ts)

| 用例 | 覆盖 |
|---|---|
| 初始 canUndo=canRedo=false | 默认值 |
| dispatch 后 canUndo=true,canRedo=false | 基础入栈 |
| undo → 恢复 + canRedo=true | undo 路径 |
| redo → 恢复 + canUndo=true | redo 路径 |
| undo 后新 dispatch → future 清空 | 经典编辑器行为 |
| `SET_ROW_PAGE` 翻页 → 不入 history | 黑名单 |
| no-op(reducer 同引用)→ 不入 history | 无变化早退 |
| canUndo=false 时 undo() → no-op | 防御 |
| canRedo=false 时 redo() → no-op | 防御 |
| clearHistory() → past/future 都清 | 显式 API |
| past 满 50 → shift 最老 | 上限截断 |
| metadata.id 变 → 自动 clear | 跨数据源 |
| metadata 同 id 不同 ref → 不清 | identity 抖动不破坏 |
| 受控模式 undo/redo 调 onChange | 受控契约 |

---

## 11. 关键文件

```
src/hooks/useViewConfig.ts                    history wrapper + canUndo/canRedo/undo/redo/clearHistory
src/hooks/useViewConfig.test.ts               14 个 history 测试 + 31 个 baseline
src/components/PivotTable/PivotTable.tsx      使用 history;document-level 快捷键监听
src/components/Toolbar/Toolbar.tsx            ↶ ↷ icon-only 按钮
index.html                                    .toolbar-btn--icon-only 32x32 圆角
```

---

## 12. 未做 / 后续可加

- **branching undo tree**(Vim 风格,保留每个分支的 future)— 复杂度暴涨,不做
- **持久化 history 到 localStorage**(刷新后还能 undo)— 未做;一般编辑器也不做,不需要
- **groupable actions**(N 个连续相同 action 合并为 1 步,如列宽 resize)— 当前列宽不在 viewConfig 里,不影响 history;以后改进入 viewConfig 时再加 debounce
- **deep equal no-op 检测**(避免引用变但内容同的 action 入栈)— 业务里没观察到,reducer 都用了引用早退
