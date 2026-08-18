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
npm test          # 单元测试（变量替换 / 站点与 prompt 校验，node --test）
npm run pack      # 发布打包：crx + 版本号 zip + 同步 update_manifest.xml 版本
npm run icons     # 重新生成图标（编辑 scripts/make-icons.mjs 里的 SVG 后执行）
```

## 本地加载

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择本项目的 `dist/` 目录

## 使用

- 首次安装会自动打开管理页；也可以点工具栏图标或面板里的「管理全部」
- 管理页：新建 / 编辑 / 删除 / 排序 prompt，设置每条的插入位置；站点管理配置支持的网站
- 聊天页：输入框旁的 ⚡ 按钮 → 点选 prompt → 自动填入（prepend 在前 / append 在后，与已有内容直接拼接、零分隔；prompt 未以标点结尾时自动补句号）
- 面板：顶部搜索框过滤（回车选第一条），数字键 1-9 快速选择；底部「快捷新增」
- 快捷键 `Alt+P` 开关面板（可在 chrome://extensions/shortcuts 修改）
- 变量占位符（插入时自动替换）：`{{clipboard}}` 剪贴板、`{{selection}}` 页面选中文本、
  `{{date}}` / `{{time}}` / `{{datetime}}` 日期时间、`{{url}}` / `{{title}}` 页面信息；
  未知变量原样保留，剪贴板读取失败保留字面量并 toast 提示
- 悬浮按钮 / 面板跟随系统深浅色主题（豆包、DeepSeek 暗色模式下自动切换）
- 管理页右上角「导出 / 导入」按当前 Tab 区分范围：Prompt 管理页操作 prompt
  （同 id 覆盖、新 id 追加），站点管理页操作站点配置（内置按 id 覆盖保留自定义、
  自建站点域名冲突跳过、导入后自动重注册）

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

管理页 →「站点管理」→ 新增站点：填名称和网址、按需填输入框候选选择器（每行一个，
按序探测；全部失效时自动兜底查找页面底部的输入框），保存时 Chrome 会请求该域名的
访问授权（`optional_host_permissions`，只授权填写的域名）。保存后已打开的目标站点
页面会自动生效（配置热更新），无需刷新。

- 豆包 / DeepSeek 为内置站点：随版本下发、可编辑（选择器/偏移/开关）、不可删除
- 图标锚定默认自动识别输入框可视外壳；特殊布局可切「自定义选择器」指定依附元素
- 按钮偏移默认 `-48 / -6`（输入框右边框线外 16px、略高出顶边）
- 自建站点的注入通过 `chrome.scripting.registerContentScripts` 动态注册，
  浏览器重启后保留，background 启动时会自愈重同步

## 已知限制

- 豆包输入框的具体 DOM 会随版本变化，适配器使用多级候选选择器 + 兜底策略；
  若失效，在豆包聊天页按 F12 检查输入框元素特征后调整 `doubao.ts` 的候选数组
- prompt 数据优先存 `chrome.storage.sync`（跨设备同步，单条上限 6000 字符），
  超过约 92KB 后新条目自动降级到 `storage.local`
