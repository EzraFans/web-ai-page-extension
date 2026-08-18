/**
 * shadow root 内联样式。
 * - :host { all: initial } 隔离站点全局样式渗透
 * - 颜色全部走 CSS 变量，@media(prefers-color-scheme) 整套暗色覆盖，
 *   跟随系统/站点主题自动切换（豆包、DeepSeek 均有暗色模式）
 */
export const FLOATER_STYLES = `
:host {
  all: initial;
  font-family: system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  /* 亮色主题变量 */
  --wpx-bg: #ffffff;
  --wpx-text: #1f2328;
  --wpx-dim: #8a919c;
  --wpx-border: rgba(120, 130, 145, 0.35);
  --wpx-border-weak: rgba(120, 130, 145, 0.2);
  --wpx-hover: #eef2fb;
  --wpx-primary: #3d6ff2;
  --wpx-primary-strong: #2f5ce0;
  --wpx-danger: #d94848;
  --wpx-ok: #2f9e63;
  --wpx-tag-pre-bg: #fff3d6;
  --wpx-tag-pre-text: #8a6116;
  --wpx-tag-app-bg: #e2ecff;
  --wpx-tag-app-text: #2f5ce0;
  --wpx-input-bg: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :host {
    --wpx-bg: #212329;
    --wpx-text: #e8eaed;
    --wpx-dim: #9aa0a8;
    --wpx-border: #3a3e46;
    --wpx-border-weak: #33363d;
    --wpx-hover: #2a3345;
    --wpx-primary: #5b84f5;
    --wpx-primary-strong: #6f92f7;
    --wpx-danger: #e06c6c;
    --wpx-ok: #4cae7d;
    --wpx-tag-pre-bg: #4a3c1c;
    --wpx-tag-pre-text: #e8c879;
    --wpx-tag-app-bg: #243a68;
    --wpx-tag-app-text: #9db9f7;
    --wpx-input-bg: #1a1c21;
  }
}

* {
  box-sizing: border-box;
}

.floater {
  position: fixed;
  z-index: 2147483647;
}

.launcher {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--wpx-border);
  background: var(--wpx-bg);
  color: var(--wpx-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  transition: background 0.15s, color 0.15s, transform 0.1s;
}
.launcher:hover {
  background: var(--wpx-primary);
  color: #fff;
  transform: scale(1.06);
}

/* 面板用视口坐标由 JS 定位（含边缘翻转），这里只管外观 */
.panel {
  position: fixed;
  width: 320px;
  max-width: calc(100vw - 16px);
  max-height: 420px;
  display: none;
  flex-direction: column;
  background: var(--wpx-bg);
  border: 1px solid var(--wpx-border-weak);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.panel.open {
  display: flex;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
}
.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--wpx-text);
}
.manage-link {
  font-size: 12px;
  color: var(--wpx-primary);
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
}
.manage-link:hover {
  text-decoration: underline;
}

.panel-search {
  margin: 0 14px 8px;
  border: 1px solid var(--wpx-border-weak);
  border-radius: 8px;
  background: var(--wpx-input-bg);
  color: var(--wpx-text);
  font-size: 12px;
  font-family: inherit;
  padding: 6px 10px;
}
.panel-search:focus {
  outline: 2px solid var(--wpx-primary);
  outline-offset: -1px;
}
.panel-search::placeholder {
  color: var(--wpx-dim);
}

/* 统一边距节奏：所有区块文本水平起点 14px（.list 容器 4px + 列表项内 10px） */
.list {
  list-style: none;
  margin: 0;
  padding: 6px 4px 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  flex: 1;
  min-height: 0;
}

.item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.item:hover {
  background: var(--wpx-hover);
}
.item-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--wpx-text);
  display: flex;
  align-items: center;
  gap: 6px;
}
/* 数字键快选序号 */
.item-idx {
  font-size: 10px;
  font-weight: 600;
  color: var(--wpx-dim);
  border: 1px solid var(--wpx-border-weak);
  border-radius: 4px;
  padding: 0 4px;
  line-height: 15px;
  flex-shrink: 0;
}
.item-pos {
  font-size: 10px;
  border-radius: 999px;
  padding: 0 6px;
  white-space: nowrap;
  flex-shrink: 0;
}
.item-pos.prepend {
  background: var(--wpx-tag-pre-bg);
  color: var(--wpx-tag-pre-text);
}
.item-pos.append {
  background: var(--wpx-tag-app-bg);
  color: var(--wpx-tag-app-text);
}
.item-preview {
  font-size: 11px;
  color: var(--wpx-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-tip {
  padding: 18px 14px;
  font-size: 12px;
  color: var(--wpx-dim);
  text-align: center;
}

.quick-form {
  border-top: 1px solid var(--wpx-border-weak);
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.quick-row {
  display: flex;
  gap: 6px;
}
.quick-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--wpx-border);
  border-radius: 7px;
  padding: 6px 9px;
  font-size: 12px;
  font-family: inherit;
  background: var(--wpx-input-bg);
  color: var(--wpx-text);
}
.quick-input:focus {
  outline: 2px solid var(--wpx-primary);
  outline-offset: -1px;
}
.quick-textarea {
  width: 100%;
  resize: vertical;
  min-height: 54px;
  max-height: 120px;
}
.quick-add-btn {
  border: none;
  background: var(--wpx-primary);
  color: #fff;
  border-radius: 7px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.quick-add-btn:hover {
  background: var(--wpx-primary-strong);
}
.quick-error {
  font-size: 11px;
  color: var(--wpx-danger);
  min-height: 0;
}
.quick-toggle {
  border: none;
  border-top: 1px solid var(--wpx-border-weak);
  background: none;
  color: var(--wpx-primary);
  font-size: 12px;
  cursor: pointer;
  padding: 10px 14px 12px;
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
}

.toast {
  position: fixed;
  top: 0;
  left: 0;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12px;
  color: #fff;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}
.toast.ok {
  background: var(--wpx-ok);
}
.toast.err {
  background: var(--wpx-danger);
}
`;
