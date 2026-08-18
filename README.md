# AI Prompt Quick Insert

Chrome 扩展（Manifest V3，Chrome 138+）：在豆包和 DeepSeek 的聊天输入框旁注入悬浮按钮，
从下拉列表选择自定义 prompt 后**仅填入输入框（不自动发送）**；每条 prompt 可独立配置插入位置
（插到已有内容最前 / 追加到最后）。

## 开发

```bash
npm install
npm run build     # 类型检查 + 主构建（background/options）+ content 构建
npm run dev       # 两个 watch 并行，改完代码后到 chrome://extensions 刷新扩展
npm run typecheck
npm run pack      # 发布打包：crx + 版本号 zip + 同步 update_manifest.xml 版本
npm run icons     # 重新生成图标（编辑 scripts/make-icons.mjs 里的 SVG 后执行）
```

## 本地加载

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择本项目的 `dist/` 目录

## 使用

- 首次安装会自动打开管理页；也可以点工具栏图标或面板里的「管理全部」
- 管理页：新建 / 编辑 / 删除 / 排序 prompt，设置每条的插入位置
- 聊天页：输入框旁的 ⚡ 按钮 → 点选 prompt → 自动填入（prepend 在前 / append 在后，与已有内容直接拼接、零分隔；prompt 未以标点结尾时自动补句号）
- 面板底部「快捷新增」可在不离开聊天页的情况下添加 prompt

## 目录结构

```
manifest.json            # MV3 清单（构建时复制进 dist）
vite.config.ts           # 主构建：background.js + options 页
vite.content.config.ts   # content 构建：IIFE 单文件 dist/content.js
src/
  shared/                # 数据模型 + chrome.storage 封装（sync 优先，配额降级 local）
  background/            # service worker：安装引导 / 打开管理页 / 消息转发
  options/               # 管理页（CRUD + 排序）
  content/               # 注入脚本
    adapters/            # 站点适配器（doubao / deepseek 输入框选择器候选链）
    controller.ts        # Shadow DOM 悬浮按钮：挂载 / 定位 / SPA 路由重挂载
    panel.ts             # 下拉面板（列表 + 快捷新增）
    injector.ts          # 注入策略链（nativeSetter / execCommand / paste fallback + 读回验证）
```

## 添加新站点支持

1. 在 `src/content/adapters/` 新建适配器，提供候选选择器数组（容器或可编辑元素均可）
2. 在 `adapters/index.ts` 注册
3. 在 `manifest.json` 的 `content_scripts.matches` 加上站点域名

## 已知限制

- 豆包输入框的具体 DOM 会随版本变化，适配器使用多级候选选择器 + 兜底策略；
  若失效，在豆包聊天页按 F12 检查输入框元素特征后调整 `doubao.ts` 的候选数组
- prompt 数据优先存 `chrome.storage.sync`（跨设备同步，单条上限 6000 字符），
  超过约 92KB 后新条目自动降级到 `storage.local`
