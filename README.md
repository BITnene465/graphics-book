# 从像素到光线

一本可以直接操作的中文计算机图形学教材。推导、可视化与实际运行的 TypeScript 源码放在同一书页：拖动三角形观察重心权重，改变相机理解透视，在三维场景里检查一个像素如何生成。

当前 Web 版包含 **15 章、55 个聚焦演示、15 个综合演示、35 道编程练习**，另有综合渲染实践、数学补充和术语索引。面向会编程、接触过少量线性代数的读者。传统渲染主线已经连通；完整覆盖 GAMES101 的扩展保留在 [TODO](docs/TODO.md)。

## 本地阅读

需要 Node.js 22.18 或更新版本，以及 npm。在 `graphic` 目录执行：

```bash
npm ci
npm start
```

浏览器会打开 [本地教材](http://127.0.0.1:5017/)。以后直接运行 `npm start` 即可。环境由 `package.json` 和 `package-lock.json` 管理。

章节目录可以收起。演示的源码、撤销、重置和全屏按钮位于右上角。二维图可直接拖动控制点；三维场景使用环绕、平移、缩放和物体轴柄，快捷键收在演示底部。较慢的正式成像在 Web Worker 中计算，可继续操作页面。首次访问需要下载静态资源；本版本没有额外的离线缓存层。

## 算法在哪里

```text
graphic/
├── content/
│   ├── foundations/      # 十五章、扩展小节与综合实践
│   └── resources/        # 数学、术语、参考文献
├── src/
│   ├── chapters/         # 每章 core.ts、扩展算法、figures.ts、练习和测试
│   ├── math/             # 向量与矩阵的短函数
│   ├── figures/          # 图形数据与演示注册
│   ├── render/           # 场景组合、软件成像、Web Worker
│   ├── reader/           # 排版、交互、源码阅读
│   ├── capstone/         # 综合实践与命令行入口
│   └── exercises/        # 练习检查共用的数值断言
├── scripts/              # 测试、内容检查、许可整理
└── docs/                 # 架构、验收记录与后续计划
```

每章先读 `core.ts`，再看相关扩展文件。算法用普通数组、类型化数组和纯函数表示，不导入 DOM 或 Three.js。`figures.ts` 负责把同一份结果组织成图形；`reader` 负责显示与事件。

正式光栅化、纹理过滤、阴影和光线追踪由 TypeScript 教学算法计算。Three.js / WebGL 用于三维空间视图与相机、物体操作；它与正式成像共享场景和相机，但空间视图使用近似材质。两种结果的职责在界面和教材中分别说明。

完整依赖包括 Vite、TypeScript、Three.js、Markdown-it、KaTeX 和 Prism；没有应用框架、数据库或动态后端。数学公式与字体随静态构建发布，不依赖外部 CDN。

## 练习与验证

```bash
npm run exercise -- 04               # 检查第四章的学生实现
npm run exercise -- 04 --solutions   # 检查参考实现
npm test                            # 算法、参考练习、演示与综合实践
npm run check                       # 测试 + 教材完整性 + 类型检查与构建
```

练习文件是各章的 `exercises.ts`。其中的 35 处 TODO 是留给读者的任务；运行中的教材算法与 `solutions.ts` 已完整实现。学生练习未完成时，该章练习命令会失败并指明函数；`npm test` 默认验证参考实现。

测试包含独立手算、边界、不变量、图形参数范围及实际渲染检查。它们不构成对所有输入或设备的正确性证明。界面检查与环境记录见 [验收记录](docs/verification.md)。

综合项目可以单独运行：

```bash
npm run render -- --size 384 --samples 2
```

输出 PPM 图像与像素 JSON，在线演示也支持 PNG 导出。每轴 2 个样本表示每像素 4 次求值；采样前后保持最终尺寸不变。详细数据流见 [综合实践](content/foundations/capstone.md)。

## 静态构建与发布

```bash
npm run build
npm run preview -- --port 5018
```

将 `dist/` 上传到任意静态站点即可，不需要运行时计算服务。用 HTTP 访问构建结果，不要直接双击 `index.html`。路由使用 `?chapter=03` 等查询参数，因此不需要服务端路由重写。

仓库附带 GitHub Actions：`Check` 检查提交，`Deploy book` 手动发布 GitHub Pages。首次需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**；之后在 Actions 中选择新版分支，运行 `Deploy book` 即可。仓库可位于域名根目录或子路径，静态资源使用相对地址。

本地开发另支持 `/app?chapter=03`，公开站点请使用根页面加查询参数。不要上传 `node_modules/`、输出截图或本地缓存。

## 范围与许可

本版重点是理解传统图形学：图像与颜色、变换、相机、光栅化、采样、可见性、光照、纹理、阴影、几何、曲线曲面和基础光线追踪。路径追踪、完整动画与物理模拟尚未纳入，参见 [后续计划](docs/TODO.md)。高分辨率的软件成像会增加计算时间；空间视图保持 GPU 交互，算法图像在编辑结束后更新。

原创代码使用 [MIT](LICENSE)，`content/` 下的原创教材正文使用 [CC BY 4.0](LICENSE-CONTENT)。建议署名“BITnene465，《从像素到光线》”，并链接使用的版本。引用资料保留原作者版权。依赖说明见 [NOTICE](NOTICE.md)，静态发布中附有 [第三方许可](public/third-party-notices.txt)。
