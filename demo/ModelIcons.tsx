/**
 * ModelIcons — 数据模型 picker 用的图标(共享给 ModelPicker / ModelPickerButton)
 *
 * 设计:
 *   - 全部 14×14 SVG,stroke 线条风格(跟数据模型立方体一致;不用 emoji,避免系统渲染差异)
 *   - 颜色走 currentColor — 父 .model-picker__icon--folder/--leaf 决定主色
 *   - Spinner 自带 CSS 动画(用全局 .model-picker-spinner__arc keyframes)
 */

/** 数据模型 — 立方体线框,跟 measure 字段图标系列呼应 */
export function ModelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.5L13.5 4V12L8 14.5L2.5 12V4L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M2.5 4L8 6.5L13.5 4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M8 6.5V14.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** 闭合文件夹 — line 风格,左侧 tab 上沿略低于右侧 body */
export function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 5.5C2 4.94772 2.44772 4.5 3 4.5H6L7.5 6H13C13.5523 6 14 6.44772 14 7V12C14 12.5523 13.5523 13 13 13H3C2.44772 13 2 12.5523 2 12V5.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** 张开文件夹 — body 倾斜表达"打开"语义 */
export function FolderOpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      {/* 后片(底框)*/}
      <path
        d="M2 5.5C2 4.94772 2.44772 4.5 3 4.5H6L7.5 6H13C13.5523 6 14 6.44772 14 7V8H2V5.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
      {/* 前片(张开的盖子)— 梯形,底部窄、顶部宽 */}
      <path
        d="M2 13L3.5 7.5C3.6 7.05 4 6.75 4.5 6.75H14.5L13 12.25C12.85 12.7 12.45 13 11.95 13H2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Spinner — 加载中环形动画(替换沙漏 emoji)
 * 配合 index.html 的 @keyframes model-picker-spin
 */
export function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className="model-picker-spinner"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.25"
      />
      <path
        d="M14 8C14 4.68629 11.3137 2 8 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
