# 授权与第三方声明

本项目原创代码采用 [MIT](LICENSE)，原创教材正文采用 [CC BY 4.0](LICENSE-CONTENT)。外部教材与课程的链接用于参考；其内容、商标与课件版权归原作者，不因被引用而采用本项目许可证。

Web 版依赖由 `package-lock.json` 锁定，使用 npm 安装：

| 软件 | 用途 | 许可 |
|---|---|---|
| Three.js | 三维显示与相机、物体操作 | MIT |
| KaTeX | 数学公式排版 | MIT；字体声明见安装包 |
| markdown-it | 教材 Markdown 解析 | MIT |
| @mdit/plugin-katex | 数学语法连接 | MIT |
| Prism | TypeScript 源码高亮 | MIT |
| TypeScript | 类型检查 | Apache-2.0 |
| Vite | 开发与静态构建 | MIT |

依赖的原始许可证保存在相应安装包中，适用范围与本书原创内容分别计算。构建时，`scripts/notices.mjs` 将运行依赖的许可汇总到 `public/third-party-notices.txt`，并随静态站点发布。开发工具 Prettier 采用 MIT 许可。
