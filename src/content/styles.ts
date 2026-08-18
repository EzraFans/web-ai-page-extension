/** shadow root 内联样式。:host { all: initial } 隔离站点全局样式渗透。 */
export const FLOATER_STYLES = `
:host {
  all: initial;
  font-family: system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;
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
  border: 1px solid rgba(120, 130, 145, 0.35);
  background: #ffffff;
  color: #4a5568;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  transition: background 0.15s, color 0.15s, transform 0.1s;
}
.launcher:hover {
  background: #3d6ff2;
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
  background: #ffffff;
  border: 1px solid rgba(120, 130, 145, 0.25);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.panel.open {
  display: flex;
}

/* 统一边距节奏：所有区块文本水平起点 14px（.list 容器 4px + 列表项内 10px） */
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
}
.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2328;
}
.manage-link {
  font-size: 12px;
  color: #3d6ff2;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
}
.manage-link:hover {
  text-decoration: underline;
}

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
  background: #eef2fb;
}
.item-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2328;
  display: flex;
  align-items: center;
  gap: 6px;
}
.item-pos {
  font-size: 10px;
  border-radius: 999px;
  padding: 0 6px;
  white-space: nowrap;
  flex-shrink: 0;
}
.item-pos.prepend {
  background: #fff3d6;
  color: #8a6116;
}
.item-pos.append {
  background: #e2ecff;
  color: #2f5ce0;
}
.item-preview {
  font-size: 11px;
  color: #8a919c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-tip {
  padding: 18px 14px;
  font-size: 12px;
  color: #8a919c;
  text-align: center;
}

.quick-form {
  border-top: 1px solid rgba(120, 130, 145, 0.2);
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
  border: 1px solid rgba(120, 130, 145, 0.35);
  border-radius: 7px;
  padding: 6px 9px;
  font-size: 12px;
  font-family: inherit;
  background: #fff;
  color: #1f2328;
}
.quick-input:focus {
  outline: 2px solid #3d6ff2;
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
  background: #3d6ff2;
  color: #fff;
  border-radius: 7px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.quick-add-btn:hover {
  background: #2f5ce0;
}
.quick-error {
  font-size: 11px;
  color: #d94848;
  min-height: 0;
}
.quick-toggle {
  border: none;
  border-top: 1px solid rgba(120, 130, 145, 0.2);
  background: none;
  color: #3d6ff2;
  font-size: 12px;
  cursor: pointer;
  padding: 10px 14px 12px;
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
}
.quick-toggle:hover {
  text-decoration: underline;
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
  background: #2f9e63;
}
.toast.err {
  background: #d94848;
}
`;
