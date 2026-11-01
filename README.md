# 从像素到光线

一本可以直接操作的中文计算机图形学教材。推导、可视化与实际运行的 TypeScript 源码放在同一书页：拖动三角形观察重心权重，改变相机理解透视，在三维场景里检查一个像素如何生成。

**[在线阅读](https://bitnene465.github.io/graphics-book/)** · [GitHub 源码](https://github.com/BITnene465/graphics-book)

当前 Web 版包含 **15 章、64 个聚焦演示、15 个综合演示、35 道编程练习**，另有综合渲染实践、数学补充和术语索引。面向会编程、接触过少量线性代数的读者。基础补写已加入增量光栅化、四元数、消失点、包围盒剔除、半边、Hermite 与 de Boor。后续按 [全书规划](docs/book-plan.md)分批扩展；完整覆盖课程与 GAMES101 仍有 [待办](docs/TODO.md)。

## 本地阅读

需要 Node.js 22.18 或更新版本，以及 npm。在 `graphic` 目录执行：

```bash
npm ci
npm start
```

浏览器会打开 [本地教材](http://127.0.0.1:5017/)。以后直接运行 `npm start` 即可。环境由 `package.json` 和 `package-lock.json` 管理。

侧栏可在全书目录与本章小节之间切换，也可以收起；页顶提供字号和专注阅读。跨章返回、浏览器后退和刷新会恢复当前标签页中的阅读位置、演示参数、相机及物体状态。正文引用可直接跳转，章末提供前后章入口。

演示嵌在推导旁边。二维图可拖动控制点、平移和围绕指针缩放；三维空间支持直接拖动物体、世界／局部轴柄、吸附和视角罗盘。参数数值可拖动微调或点击精确输入，编辑支持撤销重做。“对照”并排显示算法成像与空间视图。未激活演示时滚轮正常阅读，成像质量和操作说明按需展开；窄屏将次要动作收进菜单，多面板图解改为视图切换。完整约定见 [交互说明](docs/interaction.md)。

计算在 Web Worker 中进行：拖动时先生成低分辨率预览，停止操作后补齐所选分辨率。首次访问需要下载静态资源；本版本没有额外的离线缓存层。

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

目录、正文、源文件夹和练习命令统一按阅读顺序编号 01–15。网页使用 `?chapter=textures` 等主题链接；旧版数字网址仍跳到原来的主题，避免书签因重排失效。

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

将 `dist/` 上传到任意静态站点即可，不需要运行时计算服务。用 HTTP 访问构建结果，不要直接双击 `index.html`。路由使用 `?chapter=camera` 等查询参数，因此不需要服务端路由重写。

仓库默认分支为 `web-edition`。GitHub Actions 的 `Check` 检查提交；`Deploy book` 在该分支的教材或代码更新后自动检查并发布 GitHub Pages，也可在 Actions 中手动运行。只修改 README 或 `docs/` 不会重复部署。仓库可位于域名根目录或子路径，静态资源使用相对地址。

自行部署分叉仓库时，在 **Settings → Pages → Source** 选择 **GitHub Actions**，再运行 `Deploy book`。若改用其他分支，需同步修改工作流中的分支名称。

本地开发另支持 `/app?chapter=camera`，公开站点请使用根页面加查询参数。不要上传 `node_modules/`、输出截图或本地缓存。

## 范围与许可

本版重点是理解传统图形学：图像与颜色、变换、相机、光栅化、采样、可见性、光照、纹理、阴影、几何、曲线曲面和基础光线追踪。路径追踪、完整动画与物理模拟尚未纳入，参见 [后续计划](docs/TODO.md)。高分辨率的软件成像会增加计算时间；交互预览用于观察变化，停止操作后的完整成像用于检查所选精度的结果。

已对照本地归档的智慧树课程 51 份课件建立 [逐知识点覆盖审查](docs/course-coverage.md)，并列出符号差异、修正项和缺失专题。本书目前不等于该课程或 GAMES101 的完整替代教材。

原创代码使用 [MIT](LICENSE)，`content/` 下的原创教材正文使用 [CC BY 4.0](LICENSE-CONTENT)。建议署名“BITnene465，《从像素到光线》”，并链接使用的版本。引用资料保留原作者版权。依赖说明见 [NOTICE](NOTICE.md)，静态发布中附有 [第三方许可](public/third-party-notices.txt)。
