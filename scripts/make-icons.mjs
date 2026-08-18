/**
 * 从 SVG 源生成扩展图标（public/icons/icon{16,32,48,128}.png）。
 * 设计：蓝色渐变圆角方块 + 白色闪电，与页面内 ⚡ 启动按钮同一视觉符号。
 * 改动图标后运行：npm run icons
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const SVG = `<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5a8fff"/>
      <stop offset="1" stop-color="#2f5ce0"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="120" height="120" rx="28" fill="url(#bg)"/>
  <!-- 闪电主体：fill+stroke 同色加 round join 让尖端圆角，小尺寸不发虚 -->
  <path d="M78 12 L36 74 L60 74 L52 116 L96 50 L70 50 Z"
        fill="#fff" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>
</svg>`;

for (const size of [16, 32, 48, 128]) {
  const resvg = new Resvg(SVG, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  writeFileSync(`public/icons/icon${size}.png`, png);
  console.log(`icon${size}.png written (${png.length} bytes)`);
}
